-- ============================================================================
-- TIGHTEN ROW LEVEL SECURITY
-- Migration: 016_tighten_rls.sql
--
-- The early migrations shipped catch-all policies — `FOR ALL USING (true)` — on
-- every table. Postgres ORs policies together, so those silently overrode the
-- ownership rules added in 012 and 013. On a live deployment that meant anyone
-- holding the anon key, which is embedded in the frontend bundle and therefore
-- public by design, could:
--
--   * set price_cents = 0 on any paper and download it free
--   * publish their own rows into the shop
--   * read every unpublished draft and every teacher's private paper
--   * delete the entire question bank
--
-- This migration removes those overrides. Reads stay open where the content is
-- genuinely public (the curriculum lookups and the shared question bank); writes
-- now require a real account; and `exams` falls back to the ownership policies
-- from 012/013, which already cover SELECT, INSERT, UPDATE and DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXAMS — the paywall
--
-- Nothing replaces these: exams_select, exams_insert_own, exams_update_own and
-- exams_delete_own from migrations 012/013 provide full coverage, and they are
-- the policies that make published/draft and paid/free mean anything.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public Write Exams" ON exams;
DROP POLICY IF EXISTS "Public Read Exams" ON exams;

-- ----------------------------------------------------------------------------
-- 2. QUESTION BANK AND LOOKUPS
--
-- Reading stays public: the shop and the setter both need it before sign-in, and
-- none of it is secret. Writing moves from "anyone at all" to "a signed-in
-- account", which is the actual hole. Deliberately not admin-only — teachers add
-- questions from the setter, and locking writes to admins would break that.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    t TEXT;
    write_policies TEXT[] := ARRAY[
        'questions:Public Write Questions',
        'curriculums:Public Write Curriculums',
        'grades:Public Write Grades',
        'subjects:Public Write Subjects',
        'grade_subjects:Public Write GradeSubjects',
        'subject_topics:topics_all',
        'paper_templates:templates_all',
        'question_templates:question_templates_all'
    ];
    entry TEXT;
    tbl TEXT;
    pol TEXT;
BEGIN
    FOREACH entry IN ARRAY write_policies LOOP
        tbl := split_part(entry, ':', 1);
        pol := split_part(entry, ':', 2);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
            tbl || '_write_authenticated', tbl
        );
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. TABLES WITH NO RLS AT ALL
--
-- strands and image_bank were fully exposed. Enabling RLS without policies would
-- lock the app out entirely, so each gets the same read-open / write-signed-in
-- shape as the rest of the bank.
-- ----------------------------------------------------------------------------

ALTER TABLE strands ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS strands_read ON strands;
CREATE POLICY strands_read ON strands FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS strands_write_authenticated ON strands;
CREATE POLICY strands_write_authenticated ON strands
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS image_bank_read ON image_bank;
CREATE POLICY image_bank_read ON image_bank FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS image_bank_write_authenticated ON image_bank;
CREATE POLICY image_bank_write_authenticated ON image_bank
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
