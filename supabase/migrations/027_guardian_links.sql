-- ============================================================================
-- GUARDIAN LINKS
-- Migration: 027_guardian_links.sql
--
-- Letting a parent see how their child is doing.
--
-- This is the most sensitive thing this product does, and the sensitivity is
-- not the marks — it is that one person is being shown another person's
-- results. Everything below follows from treating that as the actual feature.
--
-- THE FOUR RULES
--
-- 1. The learner consents. A guardian invites; nothing is visible until the
--    learner accepts. The alternative — a parent types an email and starts
--    watching — is surveillance with a friendly label, and it is the shape this
--    feature takes by default if nobody stops it.
--
-- 2. Either side can end it, at any time, without asking the other. A consent
--    that cannot be withdrawn was never consent.
--
-- 3. A guardian sees summaries, never the work. Averages, subjects, topics that
--    need attention. Not individual answers, not what was got wrong on question
--    four. The purpose is "how do I help?", and the answer to that never
--    required reading somebody's exam script over their shoulder.
--
-- 4. The learner can always see who is watching. A link nobody can enumerate is
--    a link nobody can revoke.
--
-- WHY A SECURITY DEFINER FUNCTION AND NOT AN RLS POLICY
--
-- The obvious move is to widen the policy on `exam_sessions` so a linked
-- guardian passes it too. That would be a mistake: every progress view, every
-- existing query and every future one would silently start returning a second
-- person's rows, and the blast radius of a bug in the link logic becomes the
-- whole product. `exam_sessions` keeps exactly one rule — you see your own.
--
-- Guardians get a narrow, explicit door instead: one function, returning
-- aggregates only, that checks the link before it returns anything.
-- ============================================================================

CREATE TABLE IF NOT EXISTS guardian_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    guardian_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    learner_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- pending  — invited, not yet accepted. Nothing is visible.
    -- accepted — the learner said yes. Summaries visible.
    -- revoked  — ended by either side. Nothing visible, and the row is kept so
    --            both people can see that it happened.
    status VARCHAR(12) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'revoked')),

    -- Who ended it, so neither side has to guess.
    revoked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

    invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,

    -- One live link per pair. Re-inviting after a revocation is allowed and
    -- reuses the row, so a revoked link cannot be bypassed by inviting again.
    UNIQUE (guardian_id, learner_id)
);

-- Nobody may guardian themselves. Harmless in effect, but it is the kind of row
-- that makes later logic ambiguous for no benefit.
ALTER TABLE guardian_links DROP CONSTRAINT IF EXISTS guardian_links_not_self;
ALTER TABLE guardian_links ADD CONSTRAINT guardian_links_not_self
    CHECK (guardian_id <> learner_id);

CREATE INDEX IF NOT EXISTS idx_guardian_links_guardian ON guardian_links(guardian_id, status);
CREATE INDEX IF NOT EXISTS idx_guardian_links_learner  ON guardian_links(learner_id, status);

ALTER TABLE guardian_links ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Both sides can see the link. Rule 4: a link nobody can enumerate is a link
-- nobody can revoke.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS guardian_links_select ON guardian_links;
CREATE POLICY guardian_links_select ON guardian_links
    FOR SELECT USING (guardian_id = auth.uid() OR learner_id = auth.uid());

-- Only a guardian creates the invitation, and only ever as themselves.
DROP POLICY IF EXISTS guardian_links_insert ON guardian_links;
CREATE POLICY guardian_links_insert ON guardian_links
    FOR INSERT WITH CHECK (guardian_id = auth.uid());

-- Either side may update: the learner to accept, either to revoke. Which
-- transitions are legal is enforced by the trigger below, because a policy can
-- say who may write the row but not what they may turn it into.
DROP POLICY IF EXISTS guardian_links_update ON guardian_links;
CREATE POLICY guardian_links_update ON guardian_links
    FOR UPDATE USING (guardian_id = auth.uid() OR learner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Which transitions are legal
--
-- Without this, a guardian who may update the row may simply set it to
-- 'accepted' themselves — which is the entire consent model defeated by one
-- PATCH. Rule 1 lives here.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_guardian_link_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;  -- service role
    END IF;

    -- Only the learner may accept. This is the consent.
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
        IF auth.uid() <> OLD.learner_id THEN
            RAISE EXCEPTION 'Only the learner can accept a guardian request'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.accepted_at := now();
        NEW.revoked_at := NULL;
        NEW.revoked_by := NULL;
    END IF;

    -- Either side may revoke, always. Rule 2.
    IF NEW.status = 'revoked' AND OLD.status IS DISTINCT FROM 'revoked' THEN
        NEW.revoked_at := now();
        NEW.revoked_by := auth.uid();
    END IF;

    -- Re-inviting after a revocation goes back to pending, never straight to
    -- accepted: consent given once is not consent given again.
    IF NEW.status = 'pending' AND OLD.status = 'accepted' THEN
        NEW.accepted_at := NULL;
    END IF;

    -- The pair itself is immutable. Repointing a link at a different learner
    -- would carry an acceptance with it.
    IF NEW.guardian_id <> OLD.guardian_id OR NEW.learner_id <> OLD.learner_id THEN
        RAISE EXCEPTION 'A link cannot be moved to a different person'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guardian_links_transition ON guardian_links;
CREATE TRIGGER guardian_links_transition
    BEFORE UPDATE ON guardian_links
    FOR EACH ROW
    EXECUTE FUNCTION enforce_guardian_link_transition();

-- ----------------------------------------------------------------------------
-- The narrow door
--
-- Summaries only, and only for an accepted link. Rule 3.
--
-- SECURITY DEFINER because it must read the learner's sessions, which the
-- guardian has no right to. That makes the first statement in the body the most
-- important line in this migration: it is the only thing standing between a
-- guardian and somebody else's results.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guardian_learner_summary(p_learner UUID)
RETURNS TABLE (
    papers_attempted BIGINT,
    papers_completed BIGINT,
    average_percentage NUMERIC,
    best_percentage NUMERIC,
    last_completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM guardian_links
         WHERE guardian_id = auth.uid()
           AND learner_id = p_learner
           AND status = 'accepted'
    ) THEN
        RAISE EXCEPTION 'No accepted link to that learner'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE s.submitted_at IS NOT NULL)::BIGINT,
           ROUND(AVG(s.percentage) FILTER (WHERE s.submitted_at IS NOT NULL)::numeric, 1),
           ROUND(MAX(s.percentage) FILTER (WHERE s.submitted_at IS NOT NULL)::numeric, 1),
           MAX(s.submitted_at)
      FROM exam_sessions s
     WHERE s.user_id = p_learner;
END;
$$;

CREATE OR REPLACE FUNCTION guardian_learner_subjects(p_learner UUID)
RETURNS TABLE (
    subject VARCHAR,
    papers_completed BIGINT,
    average_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM guardian_links
         WHERE guardian_id = auth.uid()
           AND learner_id = p_learner
           AND status = 'accepted'
    ) THEN
        RAISE EXCEPTION 'No accepted link to that learner'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT e.subject,
           COUNT(*) FILTER (WHERE s.submitted_at IS NOT NULL)::BIGINT,
           ROUND(AVG(s.percentage) FILTER (WHERE s.submitted_at IS NOT NULL)::numeric, 1)
      FROM exam_sessions s
      JOIN exams e ON e.id = s.exam_id
     WHERE s.user_id = p_learner
       AND e.subject IS NOT NULL
     GROUP BY e.subject
     ORDER BY 3 ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION guardian_learner_summary(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION guardian_learner_subjects(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardian_learner_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION guardian_learner_subjects(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- Finding a learner to invite
--
-- By exact email only, returning the id and nothing else. A search that matched
-- partially, or returned names, would turn this into a directory of every
-- account on the platform — which is how "invite your child" becomes an
-- enumeration endpoint.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION find_learner_by_email(p_email VARCHAR)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in first' USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT p.id FROM profiles p
     WHERE lower(p.email) = lower(trim(p_email))
       AND p.id <> auth.uid()
     LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION find_learner_by_email(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_learner_by_email(VARCHAR) TO authenticated;
