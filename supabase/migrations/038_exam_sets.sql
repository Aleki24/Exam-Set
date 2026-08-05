-- ============================================================================
-- EXAM SETS
-- Migration: 038_exam_sets.sql
--
-- A school sits one exam across a dozen subjects. The catalog had no way to say
-- so. "Kabras Mock End Term 2" was four unrelated columns — `institution` (free
-- text, unnormalised), `exam_type`, `term_slug`, `year` — with no key, no name,
-- and no way to ask the only question a teacher actually asks: what else was in
-- this sitting?
--
-- WHY A TABLE, WHEN 023 ARGUED AGAINST ONE
--
-- Migration 023 refused a `resources` table on the grounds that every piece of
-- commerce keys on an exam id, and a second table means a second paywall that
-- drifts from the first. That argument holds here and is the reason for the
-- shape below rather than an objection to it: a set is **not sellable**. It has
-- no price, no entitlement, no download route. Buying "the whole set" adds its
-- members to the cart and each paper is bought, owned and downloaded exactly as
-- it was before. `can_download_paper` is untouched. There is still one paywall.
--
-- WHY A COLUMN ON `exams`, NOT A JOIN TABLE
--
-- A paper belongs to one sitting. Kabras' Form 4 Mathematics Paper 1 was sat
-- once. `exams.set_id` is therefore a plain nullable reference: one index, one
-- extra `.eq()` in the filter builder both the shop and the bot already share,
-- and no second table to secure. 026 chose `exam_ids UUID[]` for class shares
-- because a share "is never queried from the other direction" — a catalog set
-- is queried from that direction on every paper page, which is exactly why the
-- reference lives on the paper.
-- ============================================================================

CREATE TABLE IF NOT EXISTS exam_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The URL key and the name shown to a buyer. The name is editable: it is
    -- suggested from the fields below at upload time, never derived from them
    -- afterwards, because a school's own wording beats anything assembled.
    slug VARCHAR(200) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,

    -- What the sitting was. Mirrors the columns of the same name on `exams`,
    -- and together these form the natural key the upload form matches against
    -- so a second Kabras paper joins the existing set instead of making a new one.
    institution VARCHAR(200),
    exam_type VARCHAR(40),
    term_slug VARCHAR(20),
    year INTEGER,
    level_slug VARCHAR(40),

    description TEXT,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,

    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ON DELETE SET NULL, deliberately not CASCADE. The papers are the stock, and
-- somebody has paid for them. Deleting a set ungroups its members; it must
-- never be a way to destroy purchased material.
ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS set_id UUID REFERENCES exam_sets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exams_set ON exams(set_id) WHERE set_id IS NOT NULL;

-- Find-or-create at upload time reads this. Deliberately NOT unique: a school
-- running junior and senior mocks in the same term is one natural key and two
-- legitimate sets. Duplicates are prevented by offering the existing set to the
-- person uploading, not by the database refusing the write.
CREATE INDEX IF NOT EXISTS idx_exam_sets_natural
    ON exam_sets (
        lower(coalesce(institution, '')),
        coalesce(exam_type, ''),
        coalesce(term_slug, ''),
        coalesce(year, 0)
    );

CREATE INDEX IF NOT EXISTS idx_exam_sets_published
    ON exam_sets (is_published, year DESC);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
--
-- Mirrors `exams_select` from 030 so "published" means one thing across both
-- tables. Writing is an admin action, the same as stocking the shop is.
--
-- Note what is deliberately absent: a stored member count. A count computed
-- over every member would report drafts to anonymous visitors — a set that says
-- "12 papers" while showing 9 has leaked the existence of three unpublished
-- rows. Counts are read from `exams` instead, where this policy's counterpart
-- already decides what the caller may see.
-- ----------------------------------------------------------------------------

ALTER TABLE exam_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_sets_select ON exam_sets;
CREATE POLICY exam_sets_select ON exam_sets
    FOR SELECT USING (
        is_published = TRUE   -- the shop, open to all
        OR is_admin()         -- staff see drafts too
    );

DROP POLICY IF EXISTS exam_sets_write ON exam_sets;
CREATE POLICY exam_sets_write ON exam_sets
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

COMMENT ON TABLE exam_sets IS
    'A named sitting — one school''s exam across many subjects. Groups exams rows via exams.set_id. Not sellable: a set has no price and no entitlement, and buying one adds its members to the cart.';

COMMENT ON COLUMN exams.set_id IS
    'The sitting this paper belongs to, or NULL. See supabase/migrations/038_exam_sets.sql.';
