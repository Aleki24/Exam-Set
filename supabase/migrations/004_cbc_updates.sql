-- ============================================================================
-- CBC CURRICULUM UPDATES
-- 1. Add 'level' and 'band' to grades
-- 2. Add 'code', 'pathway', 'cluster' to subjects
-- 3. Seed CBC data
-- ============================================================================

-- 1. Schema Updates
ALTER TABLE grades ADD COLUMN IF NOT EXISTS level VARCHAR(50); -- e.g., 'primary', 'junior', 'senior'
ALTER TABLE grades ADD COLUMN IF NOT EXISTS band VARCHAR(50);  -- e.g., 'lower_primary', 'upper_primary', 'STEM'

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS code VARCHAR(20); -- e.g., 'ILA', 'MATH', 'ENG'
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS pathway VARCHAR(100); -- e.g., 'STEM', 'Social Sciences', 'Core'
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS cluster VARCHAR(100); -- e.g., 'Pure Sciences', 'Arts', 'Languages'

-- 2. Ensure CBC Curriculum Exists
INSERT INTO curriculums (name, description, country) VALUES
    ('CBC', 'Competency Based Curriculum', 'Kenya')
ON CONFLICT (name) DO NOTHING;

-- 3. Seed Subjects (Learning Areas)
-- Helper: Subjects Injection
INSERT INTO subjects (name, code, pathway, cluster) VALUES
-- Lower Primary
('Indigenous Language Activities', 'ILA', NULL, NULL),
('Kiswahili Language Activities', 'KLA', NULL, NULL),
('English Language Activities', 'ELA', NULL, NULL),
('Mathematics Activities', 'MA', NULL, NULL),
('Environmental Activities', 'EA', NULL, NULL),
('Creative Activities', 'CA', NULL, NULL),

-- Upper Primary
('Mathematics', 'MATH', 'Core', 'Core'), -- Shared name, updated metadata
('Kiswahili', 'KIS', 'Core', 'Core'),
('English', 'ENG', 'Core', 'Core'),
('Science and Technology', 'ST', NULL, NULL),
('Agriculture and Nutrition', 'AGN', NULL, NULL),
('Social Studies', 'SS', NULL, NULL),
('Creative Arts', 'CA_ARTS', NULL, NULL),

-- Junior Secondary
('Kenyan Sign Language', 'KSL', 'Core', 'Core'),
('Integrated Science', 'IS', NULL, NULL),
('Health Education', 'HE', NULL, NULL),
('Pre-Technical Studies', 'PTS', NULL, NULL),
('Business Studies', 'BS', 'Social_Sciences', 'Humanities & Business'),
('Computer Studies', 'CS', 'STEM', 'Applied Sciences'),
('Life Skills Education', 'LSE', NULL, NULL),
('Sports and Physical Education', 'PE', 'Core', 'Core'),

-- Senior Secondary (Core)
('Core Mathematics', 'MATH_CORE', 'Core', 'Core'),
('Essential Mathematics', 'MATH_ESSENTIAL', 'Core', 'Core'),
-- ('Mathematics', ...) already exists, we might need to be careful with duplicates or shared names.
-- 'Mathematics' is used in Primary/Junior. Senior splits it.
('Community Service Learning', 'CSL', 'Core', 'Core'),
('Physical Education', 'PE_SENIOR', 'Core', 'Core'), -- Distinct from PE? Maybe.

-- Senior Secondary (STEM)
('Biology', 'BIO', 'STEM', 'Pure Sciences'),
('Chemistry', 'CHEM', 'STEM', 'Pure Sciences'),
('Physics', 'PHY', 'STEM', 'Pure Sciences'),
('General Science', 'GEN_SCI', 'STEM', 'Pure Sciences'),

('Agriculture', 'AGRI', 'STEM', 'Applied Sciences'),
('Computer Science', 'CS_SCI', 'STEM', 'Applied Sciences'),
('Home Science', 'HS', 'STEM', 'Applied Sciences'),

('Aviation', 'AVI', 'STEM', 'Technology & Engineering'),
('Building Construction', 'BC', 'STEM', 'Technology & Engineering'),
('Electricity', 'ELEC', 'STEM', 'Technology & Engineering'),
('Metalwork', 'MW', 'STEM', 'Technology & Engineering'),
('Power Mechanics', 'PM', 'STEM', 'Technology & Engineering'),
('Woodwork', 'WW', 'STEM', 'Technology & Engineering'),
('Media Technology', 'MT', 'STEM', 'Technology & Engineering'),
('Marine', 'MAR', 'STEM', 'Technology & Engineering'),
('Fisheries Technology', 'FT', 'STEM', 'Technology & Engineering'),

-- Senior Secondary (Arts & Sports)
('Fine Arts', 'FA', 'Arts_and_Sports_Science', 'Arts'),
('Music and Dance', 'MD', 'Arts_and_Sports_Science', 'Arts'),
('Theatre and Film', 'TF', 'Arts_and_Sports_Science', 'Arts'),
('Sports and Recreation', 'SR', 'Arts_and_Sports_Science', 'Sports Science'),

-- Senior Secondary (Social Sciences)
('Literature in English', 'LIT_ENG', 'Social_Sciences', 'Languages & Literature'),
('Indigenous Languages', 'IL', 'Social_Sciences', 'Languages & Literature'),
('Fasihi ya Kiswahili', 'FAS_KIS', 'Social_Sciences', 'Languages & Literature'),
('English Language', 'ENG_LANG', 'Social_Sciences', 'Languages & Literature'),
('Kiswahili Kipevu', 'KIS_KIPEVU', 'Social_Sciences', 'Languages & Literature'),
('Sign Language', 'SIGN_LANG', 'Social_Sciences', 'Languages & Literature'),
('Arabic', 'ARABIC', 'Social_Sciences', 'Languages & Literature'),
('French', 'FRENCH', 'Social_Sciences', 'Languages & Literature'),
('German', 'GERMAN', 'Social_Sciences', 'Languages & Literature'),
('Mandarin Chinese', 'MANDARIN', 'Social_Sciences', 'Languages & Literature'),

('History and Citizenship', 'HIST_CIT', 'Social_Sciences', 'Humanities & Business'),
('Geography', 'GEO', 'Social_Sciences', 'Humanities & Business'),
('Christian Religious Education', 'CRE', 'Social_Sciences', 'Humanities & Business'),
('Islamic Religious Education', 'IRE', 'Social_Sciences', 'Humanities & Business'),
('Hindu Religious Education', 'HRE', 'Social_Sciences', 'Humanities & Business')

ON CONFLICT (name) DO UPDATE SET 
    code = EXCLUDED.code,
    pathway = EXCLUDED.pathway,
    cluster = EXCLUDED.cluster;

-- 4. Seed Grades with Hierarchy
DO $$
DECLARE
    cbc_id UUID;
BEGIN
    SELECT id INTO cbc_id FROM curriculums WHERE name = 'CBC';

    -- Primary: Lower Valid for Grade 1-3
    INSERT INTO grades (curriculum_id, name, level, band, level_order) VALUES
    (cbc_id, 'Grade 1', 'primary', 'lower_primary', 1),
    (cbc_id, 'Grade 2', 'primary', 'lower_primary', 2),
    (cbc_id, 'Grade 3', 'primary', 'lower_primary', 3)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = EXCLUDED.level, band = EXCLUDED.band;

    -- Primary: Upper Valid for Grade 4-6
    INSERT INTO grades (curriculum_id, name, level, band, level_order) VALUES
    (cbc_id, 'Grade 4', 'primary', 'upper_primary', 4),
    (cbc_id, 'Grade 5', 'primary', 'upper_primary', 5),
    (cbc_id, 'Grade 6', 'primary', 'upper_primary', 6)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = EXCLUDED.level, band = EXCLUDED.band;

    -- Junior Secondary
    INSERT INTO grades (curriculum_id, name, level, band, level_order) VALUES
    (cbc_id, 'Grade 7', 'junior', NULL, 7),
    (cbc_id, 'Grade 8', 'junior', NULL, 8),
    (cbc_id, 'Grade 9', 'junior', NULL, 9)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = EXCLUDED.level, band = EXCLUDED.band;

    -- Senior Secondary
    INSERT INTO grades (curriculum_id, name, level, band, level_order) VALUES
    (cbc_id, 'Grade 10', 'senior', NULL, 10),
    (cbc_id, 'Grade 11', 'senior', NULL, 11),
    (cbc_id, 'Grade 12', 'senior', NULL, 12)
    ON CONFLICT (curriculum_id, name) DO UPDATE SET level = EXCLUDED.level, band = EXCLUDED.band;
END $$;

-- 5. Seed Grade-Subject Mappings
DO $$
DECLARE
    cbc_id UUID;
    g_id UUID;
BEGIN
    SELECT id INTO cbc_id FROM curriculums WHERE name = 'CBC';

    -- Lower Primary
    FOR g_id IN SELECT id FROM grades WHERE curriculum_id = cbc_id AND band = 'lower_primary' LOOP
        INSERT INTO grade_subjects (grade_id, subject_id)
        SELECT g_id, id FROM subjects WHERE code IN ('ILA', 'KLA', 'ELA', 'MA', 'RE', 'EA', 'CA')
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- Upper Primary
    FOR g_id IN SELECT id FROM grades WHERE curriculum_id = cbc_id AND band = 'upper_primary' LOOP
        INSERT INTO grade_subjects (grade_id, subject_id)
        SELECT g_id, id FROM subjects WHERE code IN ('ENG', 'KIS', 'MATH', 'RE', 'AGN', 'SS', 'CA_ARTS', 'ST')
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- Junior Secondary
    FOR g_id IN SELECT id FROM grades WHERE curriculum_id = cbc_id AND level = 'junior' LOOP
        INSERT INTO grade_subjects (grade_id, subject_id)
        SELECT g_id, id FROM subjects WHERE code IN (
            'ENG', 'KIS', 'KSL', 'MATH', 'SS', 'LSE', 'CRE', 'IRE', 'HRE', 'IS', 'HE', 'AGN', 'HS', 'PTS', 'BS', 'CS', 'CA_ARTS', 'PE'
        )
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- Senior Secondary - Link explicit courses based on Senior status
    -- Note: 'Mathematics' (MATH) from primary shouldn't be linked if we use 'MATH_CORE'/'MATH_ESSENTIAL'.
    FOR g_id IN SELECT id FROM grades WHERE curriculum_id = cbc_id AND level = 'senior' LOOP
        INSERT INTO grade_subjects (grade_id, subject_id)
        SELECT g_id, id FROM subjects WHERE 
          (pathway IS NOT NULL AND pathway IN ('Core', 'STEM', 'Arts_and_Sports_Science', 'Social_Sciences'))
          OR code IN ('MATH_CORE', 'MATH_ESSENTIAL', 'PE_SENIOR')
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;
