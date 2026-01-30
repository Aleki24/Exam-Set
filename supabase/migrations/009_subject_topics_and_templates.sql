-- ============================================================================
-- MINIMAL SAFE MIGRATION - Run this first
-- ============================================================================

-- STEP 1: Create subject_topics table
CREATE TABLE IF NOT EXISTS subject_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    topic_number INTEGER NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(subject_id, topic_number)
);

-- STEP 2: Create paper_templates table
CREATE TABLE IF NOT EXISTS paper_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
    total_marks INTEGER NOT NULL DEFAULT 40,
    time_limit VARCHAR(50) DEFAULT '1 hour',
    sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    shuffle_within_sections BOOLEAN DEFAULT TRUE,
    shuffle_sections BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STEP 3: Enable RLS
ALTER TABLE subject_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_templates ENABLE ROW LEVEL SECURITY;

-- STEP 4: Create policies
DROP POLICY IF EXISTS "topics_select" ON subject_topics;
DROP POLICY IF EXISTS "topics_all" ON subject_topics;
CREATE POLICY "topics_select" ON subject_topics FOR SELECT USING (true);
CREATE POLICY "topics_all" ON subject_topics FOR ALL USING (true);

DROP POLICY IF EXISTS "templates_select" ON paper_templates;
DROP POLICY IF EXISTS "templates_all" ON paper_templates;
CREATE POLICY "templates_select" ON paper_templates FOR SELECT USING (true);
CREATE POLICY "templates_all" ON paper_templates FOR ALL USING (true);

-- Done! Tables created successfully.
