-- ============================================================================
-- CLOSE TWO GAPS BETWEEN THE MIGRATIONS AND THE LIVE DATABASE
-- Migration: 021_schema_drift.sql
--
-- Found while rendering papers to PDF: two columns the application code reads
-- and writes do not exist on the deployed database. Neither failed loudly,
-- which is why both survived — Postgres rejects a SELECT naming a missing
-- column, but an INSERT that simply never mentions one succeeds and quietly
-- drops the value.
--
--   questions.sub_parts   Migration 003 adds it and was never applied here. The
--                         question form builds sub-parts, the setter totals
--                         their marks, and `mapRow` reads them — so a teacher
--                         entering a question with parts (a), (b) and (c) has
--                         been losing them on save, silently, all along.
--
--   exams.instructions    The setter has an instructions box, defaulted to
--                         "Answer ALL questions in the spaces provided", and
--                         the value has nowhere to go. Every published paper
--                         therefore prints with no rubric at all, which on a
--                         Kenyan exam paper is conspicuous.
--
-- Both are additive and nullable, so this cannot disturb a single existing row.
-- ============================================================================

ALTER TABLE questions ADD COLUMN IF NOT EXISTS sub_parts JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN questions.sub_parts IS
    'Array of question sub-parts, each with id, label (a, b, c...), text and marks.';

ALTER TABLE exams ADD COLUMN IF NOT EXISTS instructions TEXT;

COMMENT ON COLUMN exams.instructions IS
    'Rubric printed under INSTRUCTIONS TO CANDIDATES on the generated paper.';
