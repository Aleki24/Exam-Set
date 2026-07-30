-- ============================================================================
-- QUESTION USAGE TRACKING
-- Migration: 015_question_usage.sql
--
-- The setter offers "prefer questions I have used least", and the question pool
-- is ordered by `questions.usage_count`. Nothing was ever writing that column,
-- so it sat at 0 for every row and the preference did nothing.
--
-- Usage is recorded in the database rather than the client, so it counts however
-- a paper was made: saved from the setter, published to the shop, or created
-- through the API.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Single-question increment
--
-- Referenced by questionService.incrementQuestionUsage. SECURITY DEFINER so a
-- teacher can record usage without write access to the whole questions row.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_question_usage(question_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE questions
       SET usage_count = COALESCE(usage_count, 0) + 1
     WHERE id = question_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_question_usage(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Bump every question in a new paper
--
-- `exams.question_ids` is a JSONB array of question UUIDs. On insert, each one
-- gets its counter raised and the paper recorded against it, which is what
-- powers both the "used N times" hint in the bank and the duplication check.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION bump_question_usage_for_exam()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.question_ids IS NULL OR jsonb_array_length(NEW.question_ids) = 0 THEN
        RETURN NEW;
    END IF;

    UPDATE questions q
       SET usage_count = COALESCE(q.usage_count, 0) + 1,
           used_in_exam_ids =
               CASE
                   WHEN COALESCE(q.used_in_exam_ids, '[]'::jsonb) @> to_jsonb(NEW.id::text)
                       THEN q.used_in_exam_ids
                   ELSE COALESCE(q.used_in_exam_ids, '[]'::jsonb) || to_jsonb(NEW.id::text)
               END
      FROM jsonb_array_elements_text(NEW.question_ids) AS ids(question_id)
     WHERE q.id = ids.question_id::uuid;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS exams_bump_question_usage ON exams;
CREATE TRIGGER exams_bump_question_usage
    AFTER INSERT ON exams
    FOR EACH ROW
    EXECUTE FUNCTION bump_question_usage_for_exam();

-- ----------------------------------------------------------------------------
-- 3. Backfill from papers that already exist
--
-- Without this, every question created before today still looks unused, and the
-- setter would keep handing out the same ones.
-- ----------------------------------------------------------------------------

WITH usage AS (
    SELECT ids.question_id::uuid AS question_id,
           COUNT(*)              AS times_used,
           jsonb_agg(DISTINCT e.id::text) AS exam_ids
      FROM exams e
      CROSS JOIN LATERAL jsonb_array_elements_text(
              COALESCE(e.question_ids, '[]'::jsonb)
          ) AS ids(question_id)
     WHERE jsonb_typeof(COALESCE(e.question_ids, '[]'::jsonb)) = 'array'
     GROUP BY ids.question_id
)
UPDATE questions q
   SET usage_count = usage.times_used,
       used_in_exam_ids = usage.exam_ids
  FROM usage
 WHERE q.id = usage.question_id
   AND COALESCE(q.usage_count, 0) = 0;
