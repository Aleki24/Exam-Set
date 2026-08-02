-- ============================================================================
-- MARKING
-- Migration: 028_marking.sql
--
-- Records who marked an answer and how sure they were.
--
-- `exam_responses` has carried `marks_awarded` and `is_correct` since the setter
-- shipped, and nothing has ever written to either. Every score, percentage,
-- subject average and topic diagnostic in the product has therefore read zero —
-- correctly computed from columns nobody filled in. This migration adds the two
-- fields the marking service needs; the service is what finally populates the
-- rest.
--
-- UNMARKED IS NOT ZERO
--
-- `marks_awarded` stays nullable, and that nullability is load-bearing rather
-- than incidental. Null means nobody marked it: no scheme, a scheme that needs
-- material we do not have, or a model that declined. Zero means it was marked
-- and earned nothing.
--
-- Collapsing the two would drag a learner's average down for gaps in our data
-- and report strands as weak that were never assessed — and since the whole
-- purpose of the diagnostics is to decide what to revise next, that costs
-- somebody real hours. Nothing in this schema may default `marks_awarded` to 0.
-- ============================================================================

ALTER TABLE exam_responses
    -- auto — arithmetic, locally: numeric comparison or an exact scheme match
    -- ai   — a model marking against the stored marking scheme
    -- self — the learner marked it themselves after disagreeing with the above
    ADD COLUMN IF NOT EXISTS marked_by VARCHAR(8),
    -- 0–1. Null when unmarked. 1 for arithmetic, which is not a guess.
    ADD COLUMN IF NOT EXISTS mark_confidence REAL,
    -- Shown to the learner: what earned the marks, what was missing, or why it
    -- could not be marked at all.
    ADD COLUMN IF NOT EXISTS mark_note TEXT,
    ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ;

ALTER TABLE exam_responses DROP CONSTRAINT IF EXISTS exam_responses_marked_by_check;
ALTER TABLE exam_responses ADD CONSTRAINT exam_responses_marked_by_check
    CHECK (marked_by IS NULL OR marked_by IN ('auto', 'ai', 'self'));

ALTER TABLE exam_responses DROP CONSTRAINT IF EXISTS exam_responses_confidence_range;
ALTER TABLE exam_responses ADD CONSTRAINT exam_responses_confidence_range
    CHECK (mark_confidence IS NULL OR (mark_confidence >= 0 AND mark_confidence <= 1));

-- A mark and its provenance travel together. A number with no idea where it came
-- from cannot be labelled honestly in the UI, and an unmarked row must not claim
-- a marker.
ALTER TABLE exam_responses DROP CONSTRAINT IF EXISTS exam_responses_mark_provenance;
ALTER TABLE exam_responses ADD CONSTRAINT exam_responses_mark_provenance
    CHECK (
        (marks_awarded IS NULL AND marked_by IS NULL)
        OR (marks_awarded IS NOT NULL AND marked_by IS NOT NULL)
    );

COMMENT ON COLUMN exam_responses.marks_awarded IS
    'Marks earned. NULL means nobody marked it — never use 0 for that. See src/services/markingService.ts.';

-- ----------------------------------------------------------------------------
-- Sessions record what was reachable, not what was set
--
-- A paper is scored out of the questions that were actually marked. Ten marks
-- with one unmarkable question is nine out of nine, plus a count of what was
-- skipped — not nine out of ten, which would charge the learner for our missing
-- marking scheme and pass the error into every average downstream.
-- ----------------------------------------------------------------------------

ALTER TABLE exam_sessions
    ADD COLUMN IF NOT EXISTS marked_count INTEGER,
    ADD COLUMN IF NOT EXISTS unmarked_count INTEGER;

COMMENT ON COLUMN exam_sessions.max_score IS
    'Marks available across the questions that were actually marked, not across the whole paper.';

CREATE INDEX IF NOT EXISTS idx_exam_responses_marked
    ON exam_responses(session_id, marked_by);
