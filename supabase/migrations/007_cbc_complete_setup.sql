-- ============================================================================
-- CBC CURRICULUM COMPLETE SETUP
-- Based on official CBC rationalized structure
-- ============================================================================

-- ================================
-- 1. CLEAN UP AND FIX GRADES
-- ================================

-- First, ensure we have the CBC curriculum
INSERT INTO curriculums (name, description, country)
VALUES ('CBC', 'Competency Based Curriculum (Kenya)', 'Kenya')
ON CONFLICT (name) DO NOTHING;

-- Delete any incorrectly named grades (Year X format)
DELETE FROM grades WHERE name LIKE 'Year%';

-- Get CBC curriculum ID
DO $$
DECLARE
    cbc_id UUID;
BEGIN
    SELECT id INTO cbc_id FROM curriculums WHERE name = 'CBC';
    
    -- Insert/Update all 12 CBC grades
    -- Lower Primary (Grades 1-3)
    INSERT INTO grades (curriculum_id, name, level, band, level_order) VALUES
        (cbc_id, 'Grade 1', 'primary', 'lower_primary', 1),
        (cbc_id, 'Grade 2', 'primary', 'lower_primary', 2),
        (cbc_id, 'Grade 3', 'primary', 'lower_primary', 3)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = 'primary', band = 'lower_primary', level_order = EXCLUDED.level_order;
    
    -- Upper Primary (Grades 4-6)
    INSERT INTO grades (curriculum_id, name, level, band, level_order) VALUES
        (cbc_id, 'Grade 4', 'primary', 'upper_primary', 4),
        (cbc_id, 'Grade 5', 'primary', 'upper_primary', 5),
        (cbc_id, 'Grade 6', 'primary', 'upper_primary', 6)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = 'primary', band = 'upper_primary', level_order = EXCLUDED.level_order;
    
    -- Junior Secondary (Grades 7-9)
    INSERT INTO grades (curriculum_id, name, level, band, level_order) VALUES
        (cbc_id, 'Grade 7', 'junior', NULL, 7),
        (cbc_id, 'Grade 8', 'junior', NULL, 8),
        (cbc_id, 'Grade 9', 'junior', NULL, 9)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = 'junior', band = NULL, level_order = EXCLUDED.level_order;
    
    -- Senior Secondary (Grades 10-12)
    INSERT INTO grades (curriculum_id, name, level, band, level_order) VALUES
        (cbc_id, 'Grade 10', 'senior', NULL, 10),
        (cbc_id, 'Grade 11', 'senior', NULL, 11),
        (cbc_id, 'Grade 12', 'senior', NULL, 12)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = 'senior', band = NULL, level_order = EXCLUDED.level_order;
END $$;

-- ================================
-- 2. SET UP SUBJECTS (LEARNING AREAS)
-- ================================

-- Clear existing subjects and start fresh with CBC-aligned ones
-- First, let's add all the subjects

-- LOWER PRIMARY (Grades 1-3)
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Indigenous Language Activities', 'ILA', NULL, 'lower_primary'),
    ('Kiswahili Language Activities', 'KLA', NULL, 'lower_primary'),
    ('English Language Activities', 'ELA', NULL, 'lower_primary'),
    ('Mathematics Activities', 'MA', NULL, 'lower_primary'),
    ('Religious Education', 'RE', NULL, 'lower_primary'),
    ('Environmental Activities', 'EA', NULL, 'lower_primary'),
    ('Creative Activities', 'CA', NULL, 'lower_primary')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, cluster = EXCLUDED.cluster;

-- UPPER PRIMARY (Grades 4-6)
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('English', 'ENG', NULL, 'upper_primary'),
    ('Kiswahili', 'KIS', NULL, 'upper_primary'),
    ('Mathematics', 'MATH', NULL, 'upper_primary'),
    ('Agriculture and Nutrition', 'AGN', NULL, 'upper_primary'),
    ('Social Studies', 'SS', NULL, 'upper_primary'),
    ('Creative Arts', 'CART', NULL, 'upper_primary'),
    ('Science and Technology', 'ST', NULL, 'upper_primary')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, cluster = EXCLUDED.cluster;

-- JUNIOR SECONDARY (Grades 7-9) - 9 Compulsory Learning Areas
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Kenyan Sign Language', 'KSL', NULL, 'junior'),
    ('Social Studies / Life Skills', 'SSLS', NULL, 'junior'),
    ('Integrated Science', 'IS', NULL, 'junior'),
    ('Health Education', 'HE', NULL, 'junior'),
    ('Agriculture / Home Science', 'AGHS', NULL, 'junior'),
    ('Pre-Technical Studies', 'PTS', NULL, 'junior'),
    ('Business Studies', 'BS', NULL, 'junior'),
    ('Computer Studies', 'CS', NULL, 'junior'),
    ('Creative Arts and Sports', 'CAS', NULL, 'junior')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, cluster = EXCLUDED.cluster;

-- SENIOR SECONDARY (Grades 10-12) - Core Subjects
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Core Mathematics', 'CMATH', 'Core', 'senior_core'),
    ('Essential Mathematics', 'EMATH', 'Core', 'senior_core'),
    ('Community Service Learning', 'CSL', 'Core', 'senior_core'),
    ('Physical Education', 'PE', 'Core', 'senior_core')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - STEM Pathway
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Biology', 'BIO', 'STEM', 'Pure Sciences'),
    ('Chemistry', 'CHEM', 'STEM', 'Pure Sciences'),
    ('Physics', 'PHY', 'STEM', 'Pure Sciences'),
    ('General Science', 'GSCI', 'STEM', 'Pure Sciences'),
    ('Agriculture', 'AGRI', 'STEM', 'Applied Sciences'),
    ('Computer Science', 'CSCI', 'STEM', 'Applied Sciences'),
    ('Home Science', 'HS', 'STEM', 'Applied Sciences'),
    ('Aviation', 'AVI', 'STEM', 'Technology & Engineering'),
    ('Building Construction', 'BC', 'STEM', 'Technology & Engineering'),
    ('Electricity', 'ELEC', 'STEM', 'Technology & Engineering'),
    ('Metalwork', 'MW', 'STEM', 'Technology & Engineering'),
    ('Power Mechanics', 'PM', 'STEM', 'Technology & Engineering'),
    ('Woodwork', 'WW', 'STEM', 'Technology & Engineering'),
    ('Media Technology', 'MT', 'STEM', 'Technology & Engineering'),
    ('Marine', 'MAR', 'STEM', 'Technology & Engineering'),
    ('Fisheries Technology', 'FT', 'STEM', 'Technology & Engineering')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - Arts and Sports Science Pathway
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Fine Arts', 'FA', 'Arts', 'Arts'),
    ('Music and Dance', 'MD', 'Arts', 'Arts'),
    ('Theatre and Film', 'TF', 'Arts', 'Arts'),
    ('Sports and Recreation', 'SR', 'Sports', 'Sports Science')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - Social Sciences Pathway
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Literature in English', 'LIT', 'Social Sciences', 'Languages & Literature'),
    ('Indigenous Languages', 'IL', 'Social Sciences', 'Languages & Literature'),
    ('Fasihi ya Kiswahili', 'FAS', 'Social Sciences', 'Languages & Literature'),
    ('English Language', 'ENGL', 'Social Sciences', 'Languages & Literature'),
    ('Kiswahili Kipevu', 'KISP', 'Social Sciences', 'Languages & Literature'),
    ('Sign Language', 'SL', 'Social Sciences', 'Languages & Literature'),
    ('Arabic', 'ARAB', 'Social Sciences', 'Languages & Literature'),
    ('French', 'FRE', 'Social Sciences', 'Languages & Literature'),
    ('German', 'GER', 'Social Sciences', 'Languages & Literature'),
    ('Mandarin Chinese', 'MAN', 'Social Sciences', 'Languages & Literature'),
    ('History and Citizenship', 'HC', 'Social Sciences', 'Humanities & Business'),
    ('Geography', 'GEO', 'Social Sciences', 'Humanities & Business'),
    ('Christian Religious Education', 'CRE', 'Social Sciences', 'Humanities & Business'),
    ('Islamic Religious Education', 'IRE', 'Social Sciences', 'Humanities & Business'),
    ('Hindu Religious Education', 'HRE', 'Social Sciences', 'Humanities & Business')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- ================================
-- 3. SET UP GRADE-SUBJECT MAPPINGS
-- ================================

-- Clear existing mappings
DELETE FROM grade_subjects;

-- LOWER PRIMARY (Grades 1-3) mappings
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id
FROM grades g
CROSS JOIN subjects s
WHERE g.band = 'lower_primary'
AND s.code IN ('ILA', 'KLA', 'ELA', 'MA', 'RE', 'EA', 'CA');

-- UPPER PRIMARY (Grades 4-6) mappings
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id
FROM grades g
CROSS JOIN subjects s
WHERE g.band = 'upper_primary'
AND s.code IN ('ENG', 'KIS', 'MATH', 'RE', 'AGN', 'SS', 'CART', 'ST');

-- JUNIOR SECONDARY (Grades 7-9) mappings
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id
FROM grades g
CROSS JOIN subjects s
WHERE g.level = 'junior'
AND s.code IN ('ENG', 'KIS', 'KSL', 'MATH', 'SSLS', 'RE', 'IS', 'HE', 'AGHS', 'PTS', 'BS', 'CS', 'CAS');

-- SENIOR SECONDARY (Grades 10-12) - Core subjects for all
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id
FROM grades g
CROSS JOIN subjects s
WHERE g.level = 'senior'
AND s.code IN ('ENG', 'KIS', 'KSL', 'CMATH', 'EMATH', 'CSL', 'PE');

-- SENIOR SECONDARY - All elective subjects (students can choose from any pathway)
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id
FROM grades g
CROSS JOIN subjects s
WHERE g.level = 'senior'
AND s.pathway IN ('STEM', 'Arts', 'Sports', 'Social Sciences')
ON CONFLICT DO NOTHING;

-- ================================
-- 4. VERIFY SETUP
-- ================================
SELECT 'Grades:' as section;
SELECT name, level, band, level_order FROM grades ORDER BY level_order;

SELECT 'Subjects by level:' as section;
SELECT s.name, s.code, s.pathway, s.cluster, COUNT(gs.grade_id) as grade_count
FROM subjects s
LEFT JOIN grade_subjects gs ON gs.subject_id = s.id
GROUP BY s.id, s.name, s.code, s.pathway, s.cluster
ORDER BY s.cluster, s.name;
