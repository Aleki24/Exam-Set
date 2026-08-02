-- ============================================================================
-- RESOURCE KINDS
-- Migration: 023_resource_kinds.sql
--
-- Turns the paper shop into a full resource library — notes, schemes of work,
-- lesson plans, set-book guides, curriculum designs — by adding one column
-- rather than one table.
--
-- WHY NOT A `resources` TABLE
--
-- Every piece of commerce in this schema keys on an exam id: `entitlements`,
-- `orders`, `order_items`, `can_download_paper`, `increment_paper_download`,
-- the M-Pesa confirmation function, and the row level security in 012. A second
-- table means a second copy of all of it, and the copy drifts from the original
-- the first time somebody changes one and not the other. When a paywall drifts,
-- the failure is a stranger downloading a paper they did not pay for.
--
-- So a resource is an `exams` row with a kind. A scheme of work is sold, owned
-- and delivered by the identical code path that already sells a mock, and there
-- is exactly one place where entitlement is decided.
--
-- The cost is that `exams` is now a slightly wrong name for what it holds. That
-- is worth one paywall instead of two.
--
-- Rows carrying `question_ids` can be sat and rendered by paperPdf; rows
-- carrying only a storage key are documents. `resource_kind` says which.
-- ============================================================================

ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS resource_kind VARCHAR(40) NOT NULL DEFAULT 'past-paper';

COMMENT ON COLUMN exams.resource_kind IS
    'What the artefact is (past-paper, notes, scheme-of-work, ...). Distinct from '
    'exam_type, which says which sitting a paper belongs to. See src/lib/resources.ts.';

-- ----------------------------------------------------------------------------
-- Backfill
--
-- Existing stock is all exam material, and the default of 'past-paper' is right
-- for most of it — but not for rows whose exam_type already says otherwise. A
-- row that has always been an end-of-term paper should browse as a termly exam
-- from the first day the shelf exists, not sit under "past papers" until
-- somebody edits it by hand.
--
-- Only rows still holding the default are touched, so re-running this migration
-- never overwrites a kind that has since been set deliberately.
-- ----------------------------------------------------------------------------

UPDATE exams SET resource_kind = 'termly-exam'
    WHERE resource_kind = 'past-paper'
      AND exam_type IN ('opener', 'mid-term', 'end-term');

UPDATE exams SET resource_kind = 'mock'
    WHERE resource_kind = 'past-paper'
      AND exam_type IN ('mock', 'county-mock', 'joint-mock', 'pre-mock', 'trial');

UPDATE exams SET resource_kind = 'topical'
    WHERE resource_kind = 'past-paper'
      AND exam_type = 'topical';

UPDATE exams SET resource_kind = 'holiday-assignment'
    WHERE resource_kind = 'past-paper'
      AND exam_type = 'holiday';

UPDATE exams SET resource_kind = 'revision-booklet'
    WHERE resource_kind = 'past-paper'
      AND exam_type = 'revision-booklet';

UPDATE exams SET resource_kind = 'marking-scheme'
    WHERE resource_kind = 'past-paper'
      AND exam_type = 'marking-scheme';

-- ----------------------------------------------------------------------------
-- Indexes
--
-- The browse hierarchy queries level → subject → kind in that order, and the
-- shop filters the same three columns. Both are always scoped to published
-- catalog stock, so that pair leads the index: it is the only part of the
-- predicate present on every single query.
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_exams_kind_browse
    ON exams(source, is_published, level_slug, resource_kind, year DESC);

CREATE INDEX IF NOT EXISTS idx_exams_kind_subject
    ON exams(source, is_published, subject, resource_kind);

-- No row level security changes. `exams_select` already governs who may read a
-- row, and it turns on `source`, `is_published` and `created_by` — none of which
-- this migration touches. A resource is visible under exactly the rules a paper
-- was, which is the entire reason for doing it this way.
