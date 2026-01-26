-- ============================================================================
-- EXAM GENERATOR - RESET AND SETUP SCRIPT
-- RUN THIS TO FRESHLY INSTALL THE DATABASE SCHEMA
-- This script will:
-- 1. Drop all existing tables and types (CAUTION: Deletes all data)
-- 2. Re-create the entire schema
-- 3. Enable RLS and security policies
-- 4. Seed initial data
-- ============================================================================

-- 1. CLEANUP (Drop existing objects)
DROP TRIGGER IF EXISTS update_exams_search_keywords ON exams;
DROP FUNCTION IF EXISTS update_exam_search_keywords;
DROP TRIGGER IF EXISTS update_exams_updated_at ON exams;
DROP TRIGGER IF EXISTS update_questions_updated_at ON questions;
DROP FUNCTION IF EXISTS update_updated_at_column;

DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS grade_subjects CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS grades CASCADE;
DROP TABLE IF EXISTS curriculums CASCADE;

DROP TYPE IF EXISTS blooms_level;
DROP TYPE IF EXISTS question_type;
DROP TYPE IF EXISTS difficulty_level;
DROP TYPE IF EXISTS exam_term;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CREATE TYPES
CREATE TYPE exam_term AS ENUM (
    'opener',
    'mid_term_1',
    'end_term_1',
    'mid_term_2',
    'end_term_2',
    'mid_term_3',
    'end_term_3'
);

CREATE TYPE difficulty_level AS ENUM ('Easy', 'Medium', 'Difficult');

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

CREATE TYPE blooms_level AS ENUM (
    'Knowledge',
    'Understanding',
    'Application',
    'Analysis',
    'Evaluation',
    'Creation'
);

-- 3. CREATE TABLES

-- Curriculums
CREATE TABLE curriculums (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    country VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grades
CREATE TABLE grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    curriculum_id UUID NOT NULL REFERENCES curriculums(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    level_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(curriculum_id, name)
);

-- Subjects
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grade-Subject junction
CREATE TABLE grade_subjects (
    grade_id UUID REFERENCES grades(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (grade_id, subject_id)
);

-- Questions
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Question content
    text TEXT NOT NULL,
    marks INTEGER NOT NULL DEFAULT 1 CHECK (marks > 0),
    difficulty difficulty_level NOT NULL DEFAULT 'Medium',
    topic VARCHAR(200) NOT NULL,
    subtopic VARCHAR(200),
    
    -- Hierarchy
    curriculum_id UUID REFERENCES curriculums(id) ON DELETE SET NULL,
    grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    
    -- Filter
    term exam_term,
    
    -- Type & Data
    type question_type NOT NULL DEFAULT 'Structured',
    options JSONB DEFAULT '[]'::jsonb,
    matching_pairs JSONB DEFAULT '[]'::jsonb,
    unit VARCHAR(50),
    expected_length VARCHAR(20),
    
    -- Marking
    marking_scheme TEXT,
    blooms_level blooms_level DEFAULT 'Knowledge',
    answer_schema TEXT,
    
    -- Media
    image_path TEXT,
    image_caption TEXT,
    has_latex BOOLEAN DEFAULT FALSE,
    graph_svg TEXT,
    
    -- AI Meta
    is_ai_generated BOOLEAN DEFAULT FALSE,
    ai_quality_score DECIMAL(3,2),
    
    -- Usage
    used_in_exam_ids JSONB DEFAULT '[]'::jsonb,
    usage_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exams
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Metadata
    title VARCHAR(255) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    
    -- Hierarchy
    curriculum_id UUID REFERENCES curriculums(id) ON DELETE SET NULL,
    grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    
    -- Details
    term exam_term,
    total_marks INTEGER NOT NULL DEFAULT 0,
    time_limit VARCHAR(50),
    institution VARCHAR(200),
    exam_board VARCHAR(50),
    
    -- Storage
    pdf_storage_key VARCHAR(500),
    pdf_url TEXT,
    thumbnail_storage_key VARCHAR(500),
    thumbnail_url TEXT,
    
    -- Questions
    question_ids JSONB DEFAULT '[]'::jsonb,
    question_count INTEGER DEFAULT 0,
    
    -- Search
    search_keywords TSVECTOR,
    
    -- Access
    created_by UUID,
    is_public BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. CREATE INDEXES
CREATE INDEX idx_questions_curriculum ON questions(curriculum_id);
CREATE INDEX idx_questions_grade ON questions(grade_id);
CREATE INDEX idx_questions_subject ON questions(subject_id);
CREATE INDEX idx_questions_term ON questions(term);
CREATE INDEX idx_questions_topic ON questions(topic);
CREATE INDEX idx_exams_search ON exams USING GIN(search_keywords);

-- 5. TRIGGERS

-- Timestamp Updater
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Text Search Updater
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

CREATE TRIGGER update_exams_search_keywords BEFORE INSERT OR UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION update_exam_search_keywords();

-- 6. ENABLE RLS & POLICIES

ALTER TABLE curriculums ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read Curriculums" ON curriculums FOR SELECT USING (true);
CREATE POLICY "Public Write Curriculums" ON curriculums FOR ALL USING (true);

CREATE POLICY "Public Read Grades" ON grades FOR SELECT USING (true);
CREATE POLICY "Public Write Grades" ON grades FOR ALL USING (true);

CREATE POLICY "Public Read Subjects" ON subjects FOR SELECT USING (true);
CREATE POLICY "Public Write Subjects" ON subjects FOR ALL USING (true);

CREATE POLICY "Public Read GradeSubjects" ON grade_subjects FOR SELECT USING (true);
CREATE POLICY "Public Write GradeSubjects" ON grade_subjects FOR ALL USING (true);

CREATE POLICY "Public Read Questions" ON questions FOR SELECT USING (true);
CREATE POLICY "Public Write Questions" ON questions FOR ALL USING (true);

CREATE POLICY "Public Read Exams" ON exams FOR SELECT USING (true);
CREATE POLICY "Public Write Exams" ON exams FOR ALL USING (true);

-- 7. SEED DATA

-- Curriculums
INSERT INTO curriculums (name, description, country) VALUES
    ('IGCSE', 'International General Certificate of Secondary Education', 'International'),
    ('CBC', 'Competency Based Curriculum', 'Kenya'),
    ('Pearson', 'Pearson Edexcel International', 'UK/International'),
    ('Cambridge', 'Cambridge Assessment International Education', 'International'),
    ('National', 'National Curriculum', 'Various'),
    ('IB', 'International Baccalaureate', 'International');

-- Subjects
INSERT INTO subjects (name, description) VALUES
    ('Mathematics', 'Pure and Applied Mathematics'),
    ('Physics', 'Physical Sciences'),
    ('Chemistry', 'Chemical Sciences'),
    ('Biology', 'Life Sciences'),
    ('Integrated Science', 'Combined Science Studies'),
    ('English', 'English Language and Literature'),
    ('History', 'Historical Studies'),
    ('Geography', 'Geographical Studies'),
    ('Computer Science', 'Computing and ICT');

-- Grades (simplified seeding)
DO $$
DECLARE
    curr_id UUID;
BEGIN
    -- IGCSE
    SELECT id INTO curr_id FROM curriculums WHERE name = 'IGCSE';
    INSERT INTO grades (curriculum_id, name, level_order) VALUES
        (curr_id, 'Year 9', 1), (curr_id, 'Year 10', 2), (curr_id, 'Year 11', 3);
        
    -- CBC
    SELECT id INTO curr_id FROM curriculums WHERE name = 'CBC';
    INSERT INTO grades (curriculum_id, name, level_order) VALUES
        (curr_id, 'Grade 7', 4), (curr_id, 'Grade 8', 5), (curr_id, 'Grade 9', 6);
END $$;
