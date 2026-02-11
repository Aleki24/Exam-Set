-- ============================================================================
-- VIRTUAL EXAM SYSTEM TABLES
-- Migration: 011_virtual_exams.sql
-- Purpose: Add tables for student exam-taking, responses, and tagging
-- ============================================================================

-- ============================================================================
-- 1. EXAM SESSIONS TABLE
-- Tracks when a student starts/takes an exam
-- ============================================================================

CREATE TABLE IF NOT EXISTS exam_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    time_remaining INTEGER, -- seconds remaining when last saved
    time_limit_seconds INTEGER, -- total time allowed
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' 
        CHECK (status IN ('in_progress', 'submitted', 'timed_out', 'abandoned')),
    
    -- Scoring
    score DECIMAL(6,2),
    max_score INTEGER,
    percentage DECIMAL(5,2),
    
    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 2. EXAM RESPONSES TABLE
-- Stores individual question answers within a session
-- ============================================================================

CREATE TABLE IF NOT EXISTS exam_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    
    -- Response data (flexible JSONB for all question types)
    -- MCQ: {"selected": "A"}
    -- True/False: {"selected": true}
    -- Matching: {"pairs": [{"left": 1, "right": 2}]}
    -- Fill-blank: {"answers": ["word1", "word2"]}
    -- Essay/Structured: {"text": "..."}
    -- Numeric: {"value": 42, "unit": "m"}
    response JSONB DEFAULT '{}'::jsonb,
    
    -- Grading
    is_correct BOOLEAN,
    marks_awarded DECIMAL(5,2) DEFAULT 0,
    marks_possible INTEGER NOT NULL DEFAULT 1,
    
    -- Time tracking
    time_spent_seconds INTEGER DEFAULT 0,
    first_answered_at TIMESTAMP WITH TIME ZONE,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Flags
    is_flagged BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one response per question per session
    UNIQUE(session_id, question_id)
);

-- ============================================================================
-- 3. QUESTION TAGS TABLE
-- Custom tags for categorizing questions
-- ============================================================================

CREATE TABLE IF NOT EXISTS question_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#6366f1', -- Default indigo
    description TEXT,
    
    -- Ownership (optional - for user-specific tags)
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_global BOOLEAN DEFAULT FALSE, -- Admin-created tags visible to all
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 4. QUESTION TAG MAPPINGS (Junction table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS question_tag_mappings (
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES question_tags(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (question_id, tag_id)
);

-- ============================================================================
-- 5. SYLLABUS POINTS TABLE (for curriculum mapping)
-- ============================================================================

CREATE TABLE IF NOT EXISTS syllabus_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Hierarchy
    curriculum_id UUID REFERENCES curriculums(id) ON DELETE CASCADE,
    grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    
    -- Point details
    code VARCHAR(50) NOT NULL, -- e.g., "1.2.3" or "A.1"
    title VARCHAR(255) NOT NULL,
    description TEXT,
    parent_point_id UUID REFERENCES syllabus_points(id) ON DELETE SET NULL,
    order_index INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(curriculum_id, subject_id, code)
);

-- ============================================================================
-- 6. QUESTION SYLLABUS MAPPINGS (Junction table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS question_syllabus_mappings (
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    syllabus_point_id UUID NOT NULL REFERENCES syllabus_points(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (question_id, syllabus_point_id)
);

-- ============================================================================
-- 7. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Exam sessions indexes
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user ON exam_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam ON exam_sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_sessions(status);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_submitted ON exam_sessions(submitted_at DESC);

-- Exam responses indexes
CREATE INDEX IF NOT EXISTS idx_exam_responses_session ON exam_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_responses_question ON exam_responses(question_id);

-- Question tags indexes
CREATE INDEX IF NOT EXISTS idx_question_tags_slug ON question_tags(slug);
CREATE INDEX IF NOT EXISTS idx_question_tags_global ON question_tags(is_global) WHERE is_global = TRUE;

-- Tag mappings indexes
CREATE INDEX IF NOT EXISTS idx_tag_mappings_question ON question_tag_mappings(question_id);
CREATE INDEX IF NOT EXISTS idx_tag_mappings_tag ON question_tag_mappings(tag_id);

-- Syllabus point indexes
CREATE INDEX IF NOT EXISTS idx_syllabus_points_curriculum ON syllabus_points(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_points_subject ON syllabus_points(subject_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_points_grade ON syllabus_points(grade_id);

-- Full-text search index for questions (if not exists)
CREATE INDEX IF NOT EXISTS idx_questions_text_search 
ON questions USING GIN(to_tsvector('english', COALESCE(text, '') || ' ' || COALESCE(topic, '')));

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

-- Update timestamp trigger for exam_sessions
CREATE TRIGGER update_exam_sessions_updated_at
    BEFORE UPDATE ON exam_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_tag_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_syllabus_mappings ENABLE ROW LEVEL SECURITY;

-- Exam sessions: users can only see their own sessions
CREATE POLICY "Users can view own exam sessions" 
ON exam_sessions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own exam sessions" 
ON exam_sessions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own exam sessions" 
ON exam_sessions FOR UPDATE 
USING (auth.uid() = user_id);

-- Exam responses: users can only manage responses in their sessions
CREATE POLICY "Users can view own responses" 
ON exam_responses FOR SELECT 
USING (session_id IN (SELECT id FROM exam_sessions WHERE user_id = auth.uid()));

CREATE POLICY "Users can create responses in own sessions" 
ON exam_responses FOR INSERT 
WITH CHECK (session_id IN (SELECT id FROM exam_sessions WHERE user_id = auth.uid()));

CREATE POLICY "Users can update responses in own sessions" 
ON exam_responses FOR UPDATE 
USING (session_id IN (SELECT id FROM exam_sessions WHERE user_id = auth.uid()));

-- Question tags: global tags viewable by all, users can manage own tags
CREATE POLICY "Global tags viewable by all" 
ON question_tags FOR SELECT 
USING (is_global = TRUE OR created_by = auth.uid());

CREATE POLICY "Users can create own tags" 
ON question_tags FOR INSERT 
WITH CHECK (created_by = auth.uid() OR is_global = FALSE);

CREATE POLICY "Users can update own tags" 
ON question_tags FOR UPDATE 
USING (created_by = auth.uid());

CREATE POLICY "Users can delete own tags" 
ON question_tags FOR DELETE 
USING (created_by = auth.uid());

-- Tag mappings: viewable by all for now
CREATE POLICY "Tag mappings viewable by all" 
ON question_tag_mappings FOR SELECT 
USING (TRUE);

CREATE POLICY "Tag mappings editable by all" 
ON question_tag_mappings FOR ALL 
USING (TRUE);

-- Syllabus points: viewable by all
CREATE POLICY "Syllabus points viewable by all" 
ON syllabus_points FOR SELECT 
USING (TRUE);

CREATE POLICY "Syllabus points editable by all" 
ON syllabus_points FOR ALL 
USING (TRUE);

-- Syllabus mappings: viewable by all
CREATE POLICY "Syllabus mappings viewable by all" 
ON question_syllabus_mappings FOR SELECT 
USING (TRUE);

CREATE POLICY "Syllabus mappings editable by all" 
ON question_syllabus_mappings FOR ALL 
USING (TRUE);

-- ============================================================================
-- 10. SEED DATA - Default Tags
-- ============================================================================

INSERT INTO question_tags (name, slug, color, is_global, description) VALUES
    ('Calculator Allowed', 'calculator-allowed', '#22c55e', TRUE, 'Question requires or allows calculator use'),
    ('No Calculator', 'no-calculator', '#ef4444', TRUE, 'Question must be solved without calculator'),
    ('Diagram Required', 'diagram-required', '#3b82f6', TRUE, 'Question requires drawing a diagram'),
    ('Show Working', 'show-working', '#f59e0b', TRUE, 'Full working must be shown for marks'),
    ('Multiple Steps', 'multiple-steps', '#8b5cf6', TRUE, 'Question has multiple solution steps'),
    ('Real World', 'real-world', '#06b6d4', TRUE, 'Applied/contextual problem'),
    ('Extension', 'extension', '#ec4899', TRUE, 'Challenge or extension question'),
    ('Core Content', 'core-content', '#6366f1', TRUE, 'Essential curriculum content')
ON CONFLICT (slug) DO NOTHING;
