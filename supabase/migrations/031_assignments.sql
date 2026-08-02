-- ============================================================================
-- ASSIGNMENTS
-- Migration: 031_assignments.sql
--
-- One field turns a share link into an assignment: a due date.
--
-- WHY THIS IS THE RETENTION MECHANISM AND NOT A FEATURE
--
-- Learning platforms lose most of their users inside a fortnight — engagement
-- falls away around day fifteen and under 15% are still active by week four.
-- A download shop is worse than that by construction: you buy the paper, you
-- leave, and nothing ever asks you back.
--
-- Cohort and teacher-led designs retain several times better than solo study,
-- and the reason is not the software. It is that somebody is expecting the work.
-- `class_shares` already carries a teacher, a title, a resource list and an
-- expiry; adding a due date turns the strongest accountability force in a school
-- into the return loop this product does not otherwise have.
--
-- WHAT IS DELIBERATELY NOT ADDED
--
-- No per-learner scores for the teacher. Migration 027 established that seeing
-- another person's results requires that person's consent, and a share link is
-- opened by whoever holds it — often with no account at all. Quietly making an
-- assignment a way around a consent model built two migrations ago would be the
-- worst kind of feature creep: invisible, convenient, and a breach.
--
-- A teacher gets counts, which is what "has my class done it?" actually asks.
-- ============================================================================

ALTER TABLE class_shares
    -- Null means the link is a reading list, not an assignment. Both are useful
    -- and the UI says which is which; a due date is never invented for a share
    -- that did not ask for one.
    ADD COLUMN IF NOT EXISTS due_on DATE,
    -- Counted, never itemised. See above.
    ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN class_shares.due_on IS
    'When the work is due. NULL means this is a reading list rather than an assignment.';

-- A due date after the link stops working is a promise the product cannot keep:
-- the class would arrive to a dead link before the deadline. Enforced rather
-- than validated in the route, because the route is the part that gets rewritten.
ALTER TABLE class_shares DROP CONSTRAINT IF EXISTS class_shares_due_before_expiry;
ALTER TABLE class_shares ADD CONSTRAINT class_shares_due_before_expiry
    CHECK (due_on IS NULL OR due_on <= (expires_at AT TIME ZONE 'UTC')::date);

-- ----------------------------------------------------------------------------
-- Has the class done it?
--
-- SECURITY DEFINER because it counts sittings across many learners, which no
-- teacher may read directly — `exam_sessions` still says "you see your own" and
-- this migration does not touch that.
--
-- It returns three numbers and no names. That is the whole design: enough for a
-- teacher to know whether to chase the class, never enough to read one learner's
-- marks without the consent migration 027 requires.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assignment_progress(p_share UUID)
RETURNS TABLE (
    learners_started BIGINT,
    learners_submitted BIGINT,
    resources INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam_ids UUID[];
BEGIN
    -- Only the teacher who made it.
    SELECT ARRAY(SELECT jsonb_array_elements_text(to_jsonb(exam_ids))::uuid)
      INTO v_exam_ids
      FROM class_shares
     WHERE id = p_share
       AND created_by = auth.uid();

    IF v_exam_ids IS NULL THEN
        RAISE EXCEPTION 'No such assignment'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT
        COUNT(DISTINCT s.user_id)::BIGINT,
        COUNT(DISTINCT s.user_id) FILTER (WHERE s.submitted_at IS NOT NULL)::BIGINT,
        COALESCE(array_length(v_exam_ids, 1), 0)
      FROM exam_sessions s
     WHERE s.exam_id = ANY(v_exam_ids);
END;
$$;

REVOKE ALL ON FUNCTION assignment_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assignment_progress(UUID) TO authenticated;

-- Counting an open. Same shape as record_share_view: takes a token, changes one
-- number, tells the caller nothing.
CREATE OR REPLACE FUNCTION record_share_open(p_token VARCHAR)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE class_shares
       SET open_count = open_count + 1
     WHERE token = p_token
       AND revoked_at IS NULL
       AND expires_at > now();
END;
$$;

REVOKE ALL ON FUNCTION record_share_open(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_share_open(VARCHAR) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_class_shares_due ON class_shares(created_by, due_on)
    WHERE due_on IS NOT NULL;
