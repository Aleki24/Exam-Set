-- ============================================================================
-- CBC CURRICULUM COMPLETE SETUP - FROM OFFICIAL JSON STRUCTURE
-- No NULL values - all subjects have proper level, band, pathway, cluster
-- ============================================================================

-- ================================
-- 1. SETUP CURRICULUM
-- ================================
INSERT INTO curriculums (name, description, country)
VALUES ('CBC', 'Competency Based Curriculum (Kenya)', 'Kenya')
ON CONFLICT (name) DO NOTHING;

-- ================================
-- 2. CLEAN UP EXISTING DATA
-- ================================
DELETE FROM grade_subjects;
DELETE FROM subjects;
DELETE FROM grades WHERE name LIKE 'Year%';

-- ================================
-- 3. SETUP GRADES (All 12)
-- ================================
DO $$
DECLARE
    cbc_id UUID;
BEGIN
    SELECT id INTO cbc_id FROM curriculums WHERE name = 'CBC';
    
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
        (cbc_id, 'Grade 7', 'junior', 'jss', 7),
        (cbc_id, 'Grade 8', 'junior', 'jss', 8),
        (cbc_id, 'Grade 9', 'junior', 'jss', 9)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = 'junior', band = 'jss', level_order = EXCLUDED.level_order;
    
    -- Senior Secondary (Grades 10-12)
    INSERT INTO grades (curriculum_id, name, level, band, level_order) VALUES
        (cbc_id, 'Grade 10', 'senior', 'sss', 10),
        (cbc_id, 'Grade 11', 'senior', 'sss', 11),
        (cbc_id, 'Grade 12', 'senior', 'sss', 12)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = 'senior', band = 'sss', level_order = EXCLUDED.level_order;
END $$;

-- ================================
-- 4. SETUP SUBJECTS WITH NO NULLS
-- ================================

-- LOWER PRIMARY (Grades 1-3)
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Indigenous Language Activities', 'ILA', 'Core', 'Lower Primary'),
    ('Kiswahili Language Activities', 'KLA', 'Core', 'Lower Primary'),
    ('English Language Activities', 'ELA', 'Core', 'Lower Primary'),
    ('Mathematics Activities', 'MA', 'Core', 'Lower Primary'),
    ('Religious Education', 'RE', 'Core', 'Lower Primary'),
    ('Environmental Activities', 'EA', 'Core', 'Lower Primary'),
    ('Creative Activities', 'CA', 'Core', 'Lower Primary')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- UPPER PRIMARY (Grades 4-6)
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('English', 'ENG', 'Core', 'Upper Primary'),
    ('Kiswahili', 'KIS', 'Core', 'Upper Primary'),
    ('Mathematics', 'MATH', 'Core', 'Upper Primary'),
    ('Agriculture and Nutrition', 'AGN', 'Core', 'Upper Primary'),
    ('Social Studies', 'SS', 'Core', 'Upper Primary'),
    ('Creative Arts', 'CART', 'Core', 'Upper Primary'),
    ('Science and Technology', 'ST', 'Core', 'Upper Primary')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- JUNIOR SECONDARY (Grades 7-9) - 9 Compulsory Learning Areas
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Kiswahili or Kenyan Sign Language', 'KSL', 'Core', 'Junior Secondary'),
    ('Social Studies / Life Skills Education', 'SSLS', 'Core', 'Junior Secondary'),
    ('Integrated Science / Health Education', 'ISHE', 'Core', 'Junior Secondary'),
    ('Agriculture / Nutrition / Home Science', 'ANHS', 'Core', 'Junior Secondary'),
    ('Pre-Technical Studies / Business Studies / Computer Studies', 'PTBC', 'Core', 'Junior Secondary'),
    ('Creative Arts and Sports', 'CAS', 'Core', 'Junior Secondary')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR SECONDARY - CORE SUBJECTS (Grades 10-12)
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Kiswahili or Kenya Sign Language', 'KKSL', 'Core', 'Senior Core'),
    ('Core Mathematics', 'CMATH', 'Core', 'Senior Core'),
    ('Essential Mathematics', 'EMATH', 'Core', 'Senior Core'),
    ('Community Service Learning', 'CSL', 'Core', 'Senior Core'),
    ('Physical Education', 'PE', 'Core', 'Senior Core')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - STEM PATHWAY: Pure Sciences
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Biology', 'BIO', 'STEM', 'Pure Sciences'),
    ('Chemistry', 'CHEM', 'STEM', 'Pure Sciences'),
    ('Physics', 'PHY', 'STEM', 'Pure Sciences'),
    ('General Science', 'GSCI', 'STEM', 'Pure Sciences')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - STEM PATHWAY: Applied Sciences
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Agriculture', 'AGRI', 'STEM', 'Applied Sciences'),
    ('Computer Studies / Computer Science', 'CSCI', 'STEM', 'Applied Sciences'),
    ('Home Science', 'HS', 'STEM', 'Applied Sciences')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - STEM PATHWAY: Technology & Engineering
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Aviation', 'AVI', 'STEM', 'Technology & Engineering'),
    ('Building Construction', 'BC', 'STEM', 'Technology & Engineering'),
    ('Electricity', 'ELEC', 'STEM', 'Technology & Engineering'),
    ('Metalwork', 'MW', 'STEM', 'Technology & Engineering'),
    ('Power Mechanics', 'PM', 'STEM', 'Technology & Engineering'),
    ('Woodwork', 'WW', 'STEM', 'Technology & Engineering'),
    ('Media Technology', 'MT', 'STEM', 'Technology & Engineering'),
    ('Marine and Fisheries Technology', 'MFT', 'STEM', 'Technology & Engineering')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - ARTS & SPORTS SCIENCE PATHWAY: Arts
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Fine Arts', 'FA', 'Arts & Sports Science', 'Arts'),
    ('Music and Dance', 'MD', 'Arts & Sports Science', 'Arts'),
    ('Theatre and Film', 'TF', 'Arts & Sports Science', 'Arts')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - ARTS & SPORTS SCIENCE PATHWAY: Sports Science
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Sports and Recreation', 'SR', 'Arts & Sports Science', 'Sports Science')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - SOCIAL SCIENCES PATHWAY: Languages & Literature
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
    ('Mandarin Chinese', 'MAN', 'Social Sciences', 'Languages & Literature')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- SENIOR - SOCIAL SCIENCES PATHWAY: Humanities & Business
INSERT INTO subjects (name, code, pathway, cluster) VALUES
    ('Business Studies', 'BS', 'Social Sciences', 'Humanities & Business'),
    ('History and Citizenship', 'HC', 'Social Sciences', 'Humanities & Business'),
    ('Geography', 'GEO', 'Social Sciences', 'Humanities & Business'),
    ('Christian Religious Education', 'CRE', 'Social Sciences', 'Humanities & Business'),
    ('Islamic Religious Education', 'IRE', 'Social Sciences', 'Humanities & Business'),
    ('Hindu Religious Education', 'HRE', 'Social Sciences', 'Humanities & Business')
ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, pathway = EXCLUDED.pathway, cluster = EXCLUDED.cluster;

-- ================================
-- 5. SETUP GRADE-SUBJECT MAPPINGS
-- ================================

-- LOWER PRIMARY (Grades 1-3)
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id FROM grades g CROSS JOIN subjects s
WHERE g.band = 'lower_primary' AND s.cluster = 'Lower Primary';

-- UPPER PRIMARY (Grades 4-6) - includes Religious Education from lower primary
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id FROM grades g CROSS JOIN subjects s
WHERE g.band = 'upper_primary' AND s.cluster = 'Upper Primary';

-- Add Religious Education to Upper Primary (shared subject)
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id FROM grades g CROSS JOIN subjects s
WHERE g.band = 'upper_primary' AND s.code = 'RE'
ON CONFLICT DO NOTHING;

-- JUNIOR SECONDARY (Grades 7-9)
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id FROM grades g CROSS JOIN subjects s
WHERE g.band = 'jss' AND s.cluster = 'Junior Secondary';

-- Add shared subjects to Junior Secondary (English, Kiswahili, Mathematics, Religious Education)
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id FROM grades g CROSS JOIN subjects s
WHERE g.band = 'jss' AND s.code IN ('ENG', 'KIS', 'MATH', 'RE')
ON CONFLICT DO NOTHING;

-- SENIOR SECONDARY (Grades 10-12) - Core subjects
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id FROM grades g CROSS JOIN subjects s
WHERE g.band = 'sss' AND s.cluster = 'Senior Core';

-- Add shared core subjects to Senior Secondary
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id FROM grades g CROSS JOIN subjects s
WHERE g.band = 'sss' AND s.code IN ('ENG', 'KIS')
ON CONFLICT DO NOTHING;

-- SENIOR SECONDARY - All pathway subjects
INSERT INTO grade_subjects (grade_id, subject_id)
SELECT g.id, s.id FROM grades g CROSS JOIN subjects s
WHERE g.band = 'sss' AND s.pathway IN ('STEM', 'Arts & Sports Science', 'Social Sciences')
ON CONFLICT DO NOTHING;

-- ================================
-- 6. VERIFY - CHECK FOR NULLS
-- ================================
SELECT 'Subjects with NULL values:' as check_type;
SELECT name, code, pathway, cluster FROM subjects 
WHERE pathway IS NULL OR cluster IS NULL;

SELECT 'All Grades:' as check_type;
SELECT name, level, band, level_order FROM grades ORDER BY level_order;

SELECT 'Subject count by cluster:' as check_type;
SELECT cluster, COUNT(*) as count FROM subjects GROUP BY cluster ORDER BY cluster;
