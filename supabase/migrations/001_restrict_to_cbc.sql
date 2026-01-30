-- Migration: Restrict to CBC Curriculum
-- Description: Removes all curriculums except 'CBC' from the database.

-- 1. Delete non-CBC curriculums
-- Note: This will cascade delete linked grades, subjects (if linked via curriculum), and questions (if set to CASCADE or SET NULL)
-- Based on schema: 
-- questions.curriculum_id REFERENCES curriculums(id) ON DELETE SET NULL
-- grades.curriculum_id REFERENCES curriculums(id) ON DELETE CASCADE
-- exams.curriculum_id REFERENCES curriculums(id) ON DELETE SET NULL

DELETE FROM curriculums 
WHERE name != 'CBC';

-- 2. Ensure CBC exists (idempotent check, though likely it exists if we are running this)
INSERT INTO curriculums (name, description, country)
SELECT 'CBC', 'Competency Based Curriculum', 'Kenya'
WHERE NOT EXISTS (
    SELECT 1 FROM curriculums WHERE name = 'CBC'
);
