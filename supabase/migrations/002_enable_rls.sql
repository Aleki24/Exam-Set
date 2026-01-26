-- ============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- Use this migration to resolve "RLS Disabled" warnings.
-- It enables RLS and sets up default public access policies.
-- ============================================================================

-- 1. Enable RLS on all tables
ALTER TABLE curriculums ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

-- 2. Create "Public Access" policies
-- Since auth is not yet strictly enforced, we allow public read/write for now.
-- In production, you should restrict write access to authenticated users.

-- Curriculums (Read: Public, Write: Public for demo)
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

-- Note: In a real app with Auth, you would do something like:
-- CREATE POLICY "Users can only edit their own exams" ON exams 
-- FOR UPDATE USING (auth.uid() = created_by);
