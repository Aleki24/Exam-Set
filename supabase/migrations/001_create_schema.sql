-- ============================================================================
-- EXAM GENERATOR DATABASE SCHEMA
-- Hierarchy: Curriculum → Grade → Subject
-- Filters: Term (Opener, Mid Term 1-3, End Term 1-3)
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. LOOKUP TABLES
-- ============================================================================

-- Curriculums table (IGCSE, CBC, Pearson, Cambridge, etc.)
CREATE TABLE IF NOT EXISTS curriculums (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    country VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grades table (linked to curriculum)
CREATE TABLE IF NOT EXISTS grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    curriculum_id UUID NOT NULL REFERENCES curriculums(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    level_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(curriculum_id, name)
);

-- Subjects table
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grade-Subject junction table (many-to-many)
CREATE TABLE IF NOT EXISTS grade_subjects (
    grade_id UUID REFERENCES grades(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (grade_id, subject_id)
);

-- ============================================================================
-- 2. ENUM TYPES
-- ============================================================================

-- Term filter enum
CREATE TYPE exam_term AS ENUM (
    'opener',
    'mid_term_1',
    'end_term_1',
    'mid_term_2',
    'end_term_2',
    'mid_term_3',
    'end_term_3'
);

-- Difficulty enum
CREATE TYPE difficulty_level AS ENUM ('Easy', 'Medium', 'Difficult');

-- Question type enum
CREATE TYPE question_type AS ENUM (
    'Multiple Choice',
    'True/False',
    'Matching',
    'Fill-in-the-blank',
    'Numeric',
    'Structured',
    'Short Answer',
    'Essay',
    'Practical',
    'Oral'
);

-- Bloom's taxonomy levels
CREATE TYPE blooms_level AS ENUM (
    'Knowledge',
    'Understanding',
    'Application',
    'Analysis',
    'Evaluation',
    'Creation'
);

-- ============================================================================
-- 3. QUESTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Question content
    text TEXT NOT NULL,
    marks INTEGER NOT NULL DEFAULT 1 CHECK (marks > 0),
    difficulty difficulty_level NOT NULL DEFAULT 'Medium',
    topic VARCHAR(200) NOT NULL,
    subtopic VARCHAR(200),
    
    -- Hierarchy (foreign keys)
    curriculum_id UUID REFERENCES curriculums(id) ON DELETE SET NULL,
    grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    
    -- Term filter
    term exam_term,
    
    -- Question type and data
    type question_type NOT NULL DEFAULT 'Structured',
    options JSONB DEFAULT '[]'::jsonb,           -- For Multiple Choice
    matching_pairs JSONB DEFAULT '[]'::jsonb,    -- For Matching
    unit VARCHAR(50),                             -- For Numeric
    expected_length VARCHAR(20),                  -- For Essay (lines/words/pages)
    
    -- Marking and taxonomy
    marking_scheme TEXT,
    blooms_level blooms_level DEFAULT 'Knowledge',
    answer_schema TEXT,
    
    -- Media support
    image_path TEXT,
    image_caption TEXT,
    has_latex BOOLEAN DEFAULT FALSE,
    graph_svg TEXT,
    
    -- AI generation metadata
    is_ai_generated BOOLEAN DEFAULT FALSE,
    ai_quality_score DECIMAL(3,2) CHECK (ai_quality_score >= 0 AND ai_quality_score <= 1),
    
    -- Usage tracking
    used_in_exam_ids JSONB DEFAULT '[]'::jsonb,
    usage_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 4. EXAMS TABLE (stores generated exam metadata with R2 reference)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Exam metadata
    title VARCHAR(255) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    
    -- Hierarchy references
    curriculum_id UUID REFERENCES curriculums(id) ON DELETE SET NULL,
    grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    
    -- Exam details
    term exam_term,
    total_marks INTEGER NOT NULL DEFAULT 0,
    time_limit VARCHAR(50),
    institution VARCHAR(200),
    exam_board VARCHAR(50),
    
    -- Cloudflare R2 storage
    pdf_storage_key VARCHAR(500),
    pdf_url TEXT,
    thumbnail_storage_key VARCHAR(500),
    thumbnail_url TEXT,
    
    -- Questions reference
    question_ids JSONB DEFAULT '[]'::jsonb,
    question_count INTEGER DEFAULT 0,
    
    -- Search optimization (full-text search)
    search_keywords TSVECTOR,
    
    -- User tracking (optional - for multi-user scenarios)
    created_by UUID,
    is_public BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 5. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Questions indexes
CREATE INDEX IF NOT EXISTS idx_questions_curriculum ON questions(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_questions_grade ON questions(grade_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_term ON questions(term);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);
CREATE INDEX IF NOT EXISTS idx_questions_blooms ON questions(blooms_level);

-- Exams indexes
CREATE INDEX IF NOT EXISTS idx_exams_curriculum ON exams(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_exams_grade ON exams(grade_id);
CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject_id);
CREATE INDEX IF NOT EXISTS idx_exams_term ON exams(term);
CREATE INDEX IF NOT EXISTS idx_exams_created_at ON exams(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exams_search ON exams USING GIN(search_keywords);

-- ============================================================================
-- 6. TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for questions
CREATE TRIGGER update_questions_updated_at
    BEFORE UPDATE ON questions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for exams
CREATE TRIGGER update_exams_updated_at
    BEFORE UPDATE ON exams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update search keywords
CREATE OR REPLACE FUNCTION update_exam_search_keywords()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_keywords = to_tsvector('english', 
        COALESCE(NEW.title, '') || ' ' || 
        COALESCE(NEW.subject, '') || ' ' ||
        COALESCE(NEW.code, '') || ' ' ||
        COALESCE(NEW.institution, '')
    );
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for exam search keywords
CREATE TRIGGER update_exams_search_keywords
    BEFORE INSERT OR UPDATE ON exams
    FOR EACH ROW
    EXECUTE FUNCTION update_exam_search_keywords();

-- ============================================================================
-- 7. SEED DATA - CURRICULUMS
-- ============================================================================

INSERT INTO curriculums (name, description, country) VALUES
    ('IGCSE', 'International General Certificate of Secondary Education', 'International'),
    ('CBC', 'Competency Based Curriculum', 'Kenya'),
    ('Pearson', 'Pearson Edexcel International', 'UK/International'),
    ('Cambridge', 'Cambridge Assessment International Education', 'International'),
    ('National', 'National Curriculum', 'Various'),
    ('IB', 'International Baccalaureate', 'International')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 8. SEED DATA - SUBJECTS
-- ============================================================================

INSERT INTO subjects (name, description) VALUES
    ('Mathematics', 'Pure and Applied Mathematics'),
    ('Physics', 'Physical Sciences'),
    ('Chemistry', 'Chemical Sciences'),
    ('Biology', 'Life Sciences'),
    ('Integrated Science', 'Combined Science Studies'),
    ('English', 'English Language and Literature'),
    ('History', 'Historical Studies'),
    ('Geography', 'Geographical Studies'),
    ('Computer Science', 'Computing and ICT')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 9. SEED DATA - GRADES (for each curriculum)
-- ============================================================================

-- IGCSE Grades
INSERT INTO grades (curriculum_id, name, level_order)
SELECT c.id, g.name, g.level_order
FROM curriculums c
CROSS JOIN (VALUES 
    ('Year 9', 1),
    ('Year 10', 2),
    ('Year 11', 3),
    ('Year 12', 4),
    ('Year 13', 5)
) AS g(name, level_order)
WHERE c.name = 'IGCSE'
ON CONFLICT (curriculum_id, name) DO NOTHING;

-- CBC Grades
INSERT INTO grades (curriculum_id, name, level_order)
SELECT c.id, g.name, g.level_order
FROM curriculums c
CROSS JOIN (VALUES 
    ('Grade 4', 1),
    ('Grade 5', 2),
    ('Grade 6', 3),
    ('Grade 7', 4),
    ('Grade 8', 5),
    ('Grade 9', 6)
) AS g(name, level_order)
WHERE c.name = 'CBC'
ON CONFLICT (curriculum_id, name) DO NOTHING;

-- Cambridge Grades
INSERT INTO grades (curriculum_id, name, level_order)
SELECT c.id, g.name, g.level_order
FROM curriculums c
CROSS JOIN (VALUES 
    ('Primary 4', 1),
    ('Primary 5', 2),
    ('Primary 6', 3),
    ('Lower Secondary 1', 4),
    ('Lower Secondary 2', 5),
    ('Lower Secondary 3', 6),
    ('IGCSE Year 1', 7),
    ('IGCSE Year 2', 8),
    ('AS Level', 9),
    ('A Level', 10)
) AS g(name, level_order)
WHERE c.name = 'Cambridge'
ON CONFLICT (curriculum_id, name) DO NOTHING;

-- Pearson Grades
INSERT INTO grades (curriculum_id, name, level_order)
SELECT c.id, g.name, g.level_order
FROM curriculums c
CROSS JOIN (VALUES 
    ('Year 9', 1),
    ('Year 10', 2),
    ('Year 11', 3),
    ('Year 12', 4),
    ('Year 13', 5)
) AS g(name, level_order)
WHERE c.name = 'Pearson'
ON CONFLICT (curriculum_id, name) DO NOTHING;

-- IB Grades
INSERT INTO grades (curriculum_id, name, level_order)
SELECT c.id, g.name, g.level_order
FROM curriculums c
CROSS JOIN (VALUES 
    ('PYP 4', 1),
    ('PYP 5', 2),
    ('PYP 6', 3),
    ('MYP 1', 4),
    ('MYP 2', 5),
    ('MYP 3', 6),
    ('MYP 4', 7),
    ('MYP 5', 8),
    ('DP Year 1', 9),
    ('DP Year 2', 10)
) AS g(name, level_order)
WHERE c.name = 'IB'
ON CONFLICT (curriculum_id, name) DO NOTHING;

-- ============================================================================
-- 10. LINK GRADES TO SUBJECTS (grade_subjects)
-- ============================================================================

-- Link all grades to all subjects (simplified - you can customize)
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id
FROM grades g
CROSS JOIN subjects s
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE curriculums ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

-- Create policies (currently allowing public access for development)

-- Curriculums
CREATE POLICY "Curriculums are viewable by everyone" ON curriculums FOR SELECT USING (true);
CREATE POLICY "Curriculums are editable by everyone" ON curriculums FOR ALL USING (true);

-- Grades
CREATE POLICY "Grades are viewable by everyone" ON grades FOR SELECT USING (true);
CREATE POLICY "Grades are editable by everyone" ON grades FOR ALL USING (true);

-- Subjects
CREATE POLICY "Subjects are viewable by everyone" ON subjects FOR SELECT USING (true);
CREATE POLICY "Subjects are editable by everyone" ON subjects FOR ALL USING (true);

-- Grade Subjects
CREATE POLICY "Grade Subjects are viewable by everyone" ON grade_subjects FOR SELECT USING (true);
CREATE POLICY "Grade Subjects are editable by everyone" ON grade_subjects FOR ALL USING (true);

-- Questions
CREATE POLICY "Questions are viewable by everyone" ON questions FOR SELECT USING (true);
CREATE POLICY "Questions are editable by everyone" ON questions FOR ALL USING (true);

-- Exams
CREATE POLICY "Exams are viewable by everyone" ON exams FOR SELECT USING (true);
CREATE POLICY "Exams are editable by everyone" ON exams FOR ALL USING (true);
