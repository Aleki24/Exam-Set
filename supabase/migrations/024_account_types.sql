-- ============================================================================
-- ACCOUNT TYPES
-- Migration: 024_account_types.sql
--
-- Who somebody is, as distinct from what they are allowed to do.
--
-- THE SEPARATION THAT MATTERS
--
-- `profiles.role` is the *permission* role — owner, admin, user. Every row level
-- security policy in migration 012 turns on it, and `requireAdmin` /
-- `requireOwner` gate seventeen API routes with it. It is granted, never chosen.
--
-- `account_type` is the *personalisation* field — student, teacher, parent,
-- institution. It is chosen freely at signup and changeable at any time.
--
-- These are two different questions and they must never be one column. If the
-- signup form wrote to `role`, then picking "teacher" from a dropdown would
-- grant whatever a teacher may do — and the day anything in this product keys
-- an ability off "teacher", a stranger would grant it to themselves in the time
-- it takes to fill in a form. Widening `role` was the obvious-looking move and
-- it is a privilege escalation with a friendly label on it.
--
-- So `account_type` grants nothing. It decides which navigation somebody sees,
-- which resources are recommended, and which dashboard opens first. Every
-- ability in the product is still decided by `role` and by row level security,
-- exactly as before. Nothing in this migration touches either.
-- ============================================================================

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS account_type VARCHAR(20),
    -- What they learn or teach. One level and one grade is enough for the
    -- personalisation this drives, and asking for more at signup is how a
    -- signup form stops being finished.
    ADD COLUMN IF NOT EXISTS level_slug VARCHAR(30),
    ADD COLUMN IF NOT EXISTS grade_label VARCHAR(40),
    ADD COLUMN IF NOT EXISTS subject_interests TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS school_name VARCHAR(160),
    -- Null means they have never been asked. That is deliberately different from
    -- "asked and skipped": the first can be prompted again, the second must not
    -- be, and a single nullable account_type could not tell them apart.
    ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.account_type IS
    'student | teacher | parent | institution. Personalisation only — grants nothing. '
    'Permissions live in profiles.role and are enforced by RLS.';

-- Only the four known values, and only ever set by the account holder. A CHECK
-- rather than an enum so adding a fifth is a one-line migration and not a type
-- rewrite that locks the table.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_account_type_check
    CHECK (account_type IS NULL OR account_type IN ('student', 'teacher', 'parent', 'institution'));

-- ----------------------------------------------------------------------------
-- Who may write it
--
-- `profiles_update_own` already exists for the account holder. What it cannot
-- express on its own is that `role` must stay out of reach: a policy grants the
-- whole row or none of it, so an account holder allowed to edit their name is
-- equally allowed to set role='owner' unless something stops them.
--
-- This trigger is that something. It is not new protection invented here — it
-- closes the hole this migration would otherwise open by giving people a
-- genuine reason to write to their own profile row for the first time.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- The service role and SQL run by an admin bypass RLS entirely and are the
    -- intended way to promote somebody. Only a request carrying an end user's
    -- JWT is constrained here.
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Roles cannot be changed from the browser. Ask an owner.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_role ON profiles;
CREATE TRIGGER profiles_protect_role
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION protect_profile_role();

-- ----------------------------------------------------------------------------
-- Backfill
--
-- Existing accounts are left with a null account_type on purpose, so they are
-- asked once rather than silently assigned something wrong. An owner or admin
-- is the exception: they are running the shop, so "teacher" is both true and
-- the only choice that makes their own dashboard useful on first load.
-- ----------------------------------------------------------------------------

UPDATE profiles
   SET account_type = 'teacher', onboarded_at = now()
 WHERE account_type IS NULL
   AND role IN ('owner', 'admin');

CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON profiles(account_type);
