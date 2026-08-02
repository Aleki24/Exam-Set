-- ============================================================================
-- CBA / SBA SCORE CAPTURE
-- Migration: 032_cba_capture.sql
--
-- A class register and a place to put BE/AE/ME/EE against each learning
-- outcome, so a teacher can score a whole class where the class actually is.
--
-- WHY
--
-- KNEC sets hard deadlines for School Based Assessment uploads and the CBA
-- portal buckles on the final day — deadlines have been publicly extended more
-- than once because of portal strain. In between, a teacher scores on paper and
-- then hand-keys every learner against every outcome into a national grid,
-- while the head is required to retain all the evidence.
--
-- Nothing here talks to KNEC, and nothing here claims to. It makes the hours
-- before the portal survivable: capture in the classroom, check it is complete
-- while the class is still in front of you, then key it in once.
--
-- LEARNERS ARE NOT ACCOUNTS
--
-- `class_learners` holds a name and an optional admission number, and does not
-- reference `profiles`. Grade 3 pupils do not have accounts and should not need
-- one to be marked — requiring a sign-up per child would kill the feature and
-- create a pile of children's accounts nobody asked for.
--
-- The consequence is that this table holds named children, which makes the
-- access rule below the most important thing in the migration: exactly one
-- teacher can read a roster, and it is the teacher who created it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    name VARCHAR(120) NOT NULL,
    grade_label VARCHAR(40),
    learning_area VARCHAR(120),
    /** The school year this register belongs to. */
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_learners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,

    name VARCHAR(120) NOT NULL,
    admission_number VARCHAR(40),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One assessment: a project or performance task with its outcomes.
CREATE TABLE IF NOT EXISTS cba_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    title VARCHAR(160) NOT NULL,
    /**
     * The outcomes being scored, as [{ id, title, strand }].
     *
     * Held as jsonb rather than a table because they are authored together,
     * read together, and never queried across assessments — and because KNEC
     * changes them between years, so a normalised copy would need migrating
     * every time a strand is renamed.
     */
    outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,

    /** KNEC's deadline, when the teacher knows it. */
    due_on DATE,
    submitted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One learner, one outcome, one level.
CREATE TABLE IF NOT EXISTS cba_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES cba_assessments(id) ON DELETE CASCADE,
    learner_id UUID NOT NULL REFERENCES class_learners(id) ON DELETE CASCADE,

    outcome_id VARCHAR(64) NOT NULL,
    level VARCHAR(2) NOT NULL CHECK (level IN ('BE', 'AE', 'ME', 'EE')),

    /** Where the teacher can note what they saw, for the evidence file. */
    note TEXT,

    scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Re-scoring a learner replaces the score rather than adding a second one.
    -- Without this, an offline device syncing twice would double every row.
    UNIQUE (assessment_id, learner_id, outcome_id)
);

CREATE INDEX IF NOT EXISTS idx_class_groups_owner ON class_groups(created_by, year DESC);
CREATE INDEX IF NOT EXISTS idx_class_learners_class ON class_learners(class_id, name);
CREATE INDEX IF NOT EXISTS idx_cba_assessments_class ON cba_assessments(class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cba_scores_assessment ON cba_scores(assessment_id);

-- ----------------------------------------------------------------------------
-- Access: one teacher, their own register, nothing else
--
-- These tables hold named children. There is no admin read, no school-wide read
-- and no sharing — not because those are hard, but because none of them has been
-- designed yet, and a standing grant added "for now" over children's assessment
-- records is the kind that is still there in three years.
--
-- Learners and scores are reached through their class, so ownership is checked
-- against `class_groups` every time rather than denormalised onto each row,
-- where it could drift.
-- ----------------------------------------------------------------------------

ALTER TABLE class_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_learners   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cba_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cba_scores       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_groups_own ON class_groups;
CREATE POLICY class_groups_own ON class_groups
    FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS class_learners_own ON class_learners;
CREATE POLICY class_learners_own ON class_learners
    FOR ALL USING (
        EXISTS (SELECT 1 FROM class_groups g
                 WHERE g.id = class_learners.class_id AND g.created_by = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM class_groups g
                 WHERE g.id = class_learners.class_id AND g.created_by = auth.uid())
    );

DROP POLICY IF EXISTS cba_assessments_own ON cba_assessments;
CREATE POLICY cba_assessments_own ON cba_assessments
    FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS cba_scores_own ON cba_scores;
CREATE POLICY cba_scores_own ON cba_scores
    FOR ALL USING (
        EXISTS (SELECT 1 FROM cba_assessments a
                 WHERE a.id = cba_scores.assessment_id AND a.created_by = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM cba_assessments a
                 WHERE a.id = cba_scores.assessment_id AND a.created_by = auth.uid())
    );
