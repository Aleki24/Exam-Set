-- ============================================================================
-- Question Templates and Topic Enhancements
-- ============================================================================

-- STEP 1: Create question_templates table for reusable question formats
CREATE TABLE IF NOT EXISTS question_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    -- Pre-filled question fields
    type VARCHAR(50) NOT NULL DEFAULT 'Structured',
    marks INTEGER NOT NULL DEFAULT 1,
    difficulty VARCHAR(20) DEFAULT 'Medium',
    blooms_level VARCHAR(50) DEFAULT 'Knowledge',
    -- Optional linking to subject/grade
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
    topic VARCHAR(200),
    -- Additional template data
    default_options_count INTEGER DEFAULT 4,  -- For MCQs
    expected_length VARCHAR(50),              -- For essays
    -- Template metadata
    is_system BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STEP 2: Add grade_id and sort_order to subject_topics
ALTER TABLE subject_topics 
ADD COLUMN IF NOT EXISTS grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- STEP 3: Create index for faster topic lookups by grade
CREATE INDEX IF NOT EXISTS idx_subject_topics_grade ON subject_topics(grade_id);
CREATE INDEX IF NOT EXISTS idx_subject_topics_subject_grade ON subject_topics(subject_id, grade_id);

-- STEP 4: Enable RLS on question_templates
ALTER TABLE question_templates ENABLE ROW LEVEL SECURITY;

-- STEP 5: Create policies for question_templates
DROP POLICY IF EXISTS "question_templates_select" ON question_templates;
DROP POLICY IF EXISTS "question_templates_all" ON question_templates;
CREATE POLICY "question_templates_select" ON question_templates FOR SELECT USING (true);
CREATE POLICY "question_templates_all" ON question_templates FOR ALL USING (true);

-- STEP 6: Insert some default system templates
INSERT INTO question_templates (name, description, type, marks, difficulty, blooms_level, is_system) VALUES
    ('Easy MCQ', 'Multiple choice with 4 options, easy difficulty', 'Multiple Choice', 1, 'Easy', 'Knowledge', true),
    ('Medium MCQ', 'Multiple choice with 4 options, medium difficulty', 'Multiple Choice', 1, 'Medium', 'Understanding', true),
    ('Short Answer', 'Brief written response, 1-2 sentences', 'Short Answer', 2, 'Easy', 'Knowledge', true),
    ('Structured Question', 'Multi-part question with sub-questions', 'Structured', 3, 'Medium', 'Application', true),
    ('Essay Question', 'Extended written response', 'Essay', 5, 'Difficult', 'Analysis', true),
    ('Calculation', 'Numerical problem requiring working', 'Numeric', 3, 'Medium', 'Application', true),
    ('True/False', 'Simple true/false statement', 'True/False', 1, 'Easy', 'Knowledge', true),
    ('Matching', 'Match items from two columns', 'Matching', 2, 'Easy', 'Understanding', true)
ON CONFLICT DO NOTHING;

-- Done!
