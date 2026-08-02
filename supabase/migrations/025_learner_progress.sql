-- ============================================================================
-- LEARNER PROGRESS
-- Migration: 025_learner_progress.sql
--
-- Papers attempted, topics covered, and whether the marks are going up.
--
-- Every number here already existed. `exam_sessions` has recorded score,
-- max_score, percentage and submitted_at since the setter shipped, and
-- `exam_responses` has recorded per-question marks and correctness alongside
-- the question's topic. What was missing was not data — it was the arithmetic,
-- and nowhere to see it.
--
-- SECURITY INVOKER, AND WHY IT IS THE WHOLE DESIGN
--
-- A view in Postgres runs as its owner by default, which means a view over
-- `exam_sessions` created by an admin would happily hand every learner's marks
-- to whoever queried it — row level security on the underlying table is not
-- consulted, because the view's owner is the one reading. That is how a
-- progress dashboard becomes a data breach without a single line of obviously
-- wrong code.
--
-- `security_invoker = true` makes each view run as the caller instead, so the
-- existing policies apply unchanged: "Users can view their own sessions" is
-- already exactly the rule these views need, and inheriting it is safer than
-- restating it. There is one rule about who may see a learner's marks, it lives
-- on the table, and nothing added here can drift from it.
--
-- Requires Postgres 15+. This project is on 17.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Overall
--
-- Completed sittings only. A paper somebody opened and abandoned is not a
-- result, and averaging it in would drag an honest average down for the crime
-- of having been curious. `attempted` still counts it, because that is a
-- different question and worth answering separately.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW learner_progress_summary
WITH (security_invoker = true) AS
SELECT
    s.user_id,
    COUNT(*)                                                   AS papers_attempted,
    COUNT(*) FILTER (WHERE s.submitted_at IS NOT NULL)         AS papers_completed,
    ROUND(AVG(s.percentage) FILTER (WHERE s.submitted_at IS NOT NULL)::numeric, 1)
                                                               AS average_percentage,
    ROUND(MAX(s.percentage) FILTER (WHERE s.submitted_at IS NOT NULL)::numeric, 1)
                                                               AS best_percentage,
    SUM(s.score)   FILTER (WHERE s.submitted_at IS NOT NULL)   AS marks_scored,
    SUM(s.max_score) FILTER (WHERE s.submitted_at IS NOT NULL) AS marks_available,
    MAX(s.submitted_at)                                        AS last_completed_at,
    MAX(s.started_at)                                          AS last_started_at
FROM exam_sessions s
GROUP BY s.user_id;

COMMENT ON VIEW learner_progress_summary IS
    'One row per learner: attempts, completions, average and best. Runs as the caller, so the existing exam_sessions RLS decides who sees what.';

-- ----------------------------------------------------------------------------
-- By subject
--
-- Which learning areas are being revised, and how they are going. Joined to
-- `exams` for the subject and level, so a subject reads the same here as it
-- does everywhere else in the product.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW learner_subject_progress
WITH (security_invoker = true) AS
SELECT
    s.user_id,
    e.subject,
    e.level_slug,
    COUNT(*) FILTER (WHERE s.submitted_at IS NOT NULL)          AS papers_completed,
    ROUND(AVG(s.percentage) FILTER (WHERE s.submitted_at IS NOT NULL)::numeric, 1)
                                                                AS average_percentage,
    MAX(s.submitted_at)                                         AS last_completed_at
FROM exam_sessions s
JOIN exams e ON e.id = s.exam_id
WHERE e.subject IS NOT NULL
GROUP BY s.user_id, e.subject, e.level_slug;

COMMENT ON VIEW learner_subject_progress IS
    'Per learner, per subject. Runs as the caller — RLS on exam_sessions still applies.';

-- ----------------------------------------------------------------------------
-- By topic
--
-- The one that is actually useful for revision: which strands are weak.
--
-- Built from responses rather than sessions, because a paper covers many topics
-- and a single percentage for the whole sitting cannot tell a learner that they
-- are fine on Algebra and losing every mark on Geometry. Marks are summed
-- rather than percentages averaged: a one-mark question and a twelve-mark
-- question are not equal evidence, and averaging their percentages pretends
-- they are.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW learner_topic_progress
WITH (security_invoker = true) AS
SELECT
    s.user_id,
    q.topic,
    e.subject,
    COUNT(*)                                        AS questions_answered,
    COUNT(*) FILTER (WHERE r.is_correct)            AS questions_correct,
    SUM(r.marks_awarded)                            AS marks_awarded,
    SUM(r.marks_possible)                           AS marks_possible,
    CASE
        WHEN COALESCE(SUM(r.marks_possible), 0) > 0
        THEN ROUND((SUM(r.marks_awarded) / SUM(r.marks_possible) * 100)::numeric, 1)
        ELSE NULL
    END                                             AS percentage,
    MAX(r.last_updated_at)                          AS last_answered_at
FROM exam_responses r
JOIN exam_sessions s ON s.id = r.session_id
JOIN questions q     ON q.id = r.question_id
LEFT JOIN exams e    ON e.id = s.exam_id
WHERE q.topic IS NOT NULL
  AND s.submitted_at IS NOT NULL
GROUP BY s.user_id, q.topic, e.subject;

COMMENT ON VIEW learner_topic_progress IS
    'Per learner, per topic, weighted by marks rather than by question count. Runs as the caller.';

-- ----------------------------------------------------------------------------
-- Trend
--
-- The last twenty completed sittings in order, which is what a sparkline needs
-- and what "are the marks going up?" actually means. Capped in the view rather
-- than the caller so nobody can ask for a learner's entire history by accident.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW learner_recent_results
WITH (security_invoker = true) AS
SELECT * FROM (
    SELECT
        s.user_id,
        s.id            AS session_id,
        s.exam_id,
        e.title,
        e.subject,
        e.grade_label,
        s.score,
        s.max_score,
        ROUND(s.percentage::numeric, 1) AS percentage,
        s.submitted_at,
        ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.submitted_at DESC) AS rn
    FROM exam_sessions s
    LEFT JOIN exams e ON e.id = s.exam_id
    WHERE s.submitted_at IS NOT NULL
) ranked
WHERE rn <= 20;

COMMENT ON VIEW learner_recent_results IS
    'The last twenty completed sittings per learner, newest first. Runs as the caller.';

-- ----------------------------------------------------------------------------
-- Continue where you left off
--
-- Sittings started and never submitted. One row per exam — somebody who opened
-- the same paper four times wants to resume it once, not be shown four
-- half-finished copies of the same thing.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW learner_unfinished_sessions
WITH (security_invoker = true) AS
SELECT DISTINCT ON (s.user_id, s.exam_id)
    s.user_id,
    s.id AS session_id,
    s.exam_id,
    e.title,
    e.subject,
    e.grade_label,
    e.slug,
    s.started_at,
    s.time_remaining
FROM exam_sessions s
LEFT JOIN exams e ON e.id = s.exam_id
WHERE s.submitted_at IS NULL
ORDER BY s.user_id, s.exam_id, s.started_at DESC;

COMMENT ON VIEW learner_unfinished_sessions IS
    'Papers started and not submitted, one per exam, newest attempt. Runs as the caller.';

-- Progress is always asked for one learner at a time, and always in date order.
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user_submitted
    ON exam_sessions(user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_responses_session
    ON exam_responses(session_id);
