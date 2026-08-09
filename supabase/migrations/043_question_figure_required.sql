-- ============================================================================
-- 043 — mark a question whose figure IS the question
-- ============================================================================
--
-- `paperLayout.layoutFigure()` has always read an `image_required` flag, and
-- `unrenderableQuestions()` has always filtered on it. Nothing ever wrote it,
-- because there was nowhere to store it — so the check was dead and a question
-- reading "use the graph below" could be selected into a paper with no graph.
--
-- The distinction is real and only a person can draw it:
--
--   image_path set, image_required false  — the diagram helps. Print it if it
--                                           is there; the question still reads
--                                           without it.
--   image_required true                   — the diagram is the question. A
--                                           paper without it is unanswerable
--                                           and must not be sold.
--
-- Default FALSE, so every question already in the bank keeps its current
-- behaviour: printable, with the figure treated as a bonus.
-- ============================================================================

ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN questions.image_required IS
    'TRUE when the question cannot be answered without its figure. The paper '
    'builder refuses to select such a question when image_path is empty.';

-- The only query that reads it asks "which selected questions are missing a
-- required figure?", which is a narrow slice of a large table.
CREATE INDEX IF NOT EXISTS questions_image_required_idx
    ON questions (image_required)
    WHERE image_required AND image_path IS NULL;
