-- ============================================================================
-- LET NEW ACCOUNTS SIGN IN IMMEDIATELY
-- Migration: 022_autoconfirm_signups.sql
--
-- The equivalent of turning off "Confirm email" in Authentication → Providers,
-- done in the database because that toggle is GoTrue service configuration
-- rather than anything stored here.
--
-- Why it is needed at all: this project has no SMTP configured, so Supabase
-- falls back to its built-in mailer, which only delivers to members of the
-- project and is rate limited to a couple of messages an hour. Every account
-- created by an ordinary teacher was therefore left unconfirmed forever and
-- could never sign in — which is exactly what happened to two of the first
-- three accounts, stuck from March until August with nobody realising.
--
-- THE TRADE-OFF, STATED PLAINLY
-- Email confirmation proves the person signing up controls the address they
-- typed. Without it somebody can register using an address that is not theirs.
-- For a shop that sells exam papers this is a fair trade: the address is only
-- used to reach the customer, and nothing is granted by owning one — roles are
-- assigned by the owner, and purchases are tied to the account that paid. It
-- would not be a fair trade on a platform where an email address confers
-- access to something.
--
-- TO UNDO: drop the trigger below, and either configure SMTP or accept that
-- unconfirmed accounts cannot sign in.
--   DROP TRIGGER IF EXISTS autoconfirm_new_users ON auth.users;
-- ============================================================================

CREATE OR REPLACE FUNCTION public.autoconfirm_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- BEFORE INSERT, so the row is written already confirmed rather than being
    -- updated a moment later. GoTrue reads this column when deciding whether a
    -- password sign-in is allowed.
    IF NEW.email_confirmed_at IS NULL AND NEW.email IS NOT NULL THEN
        NEW.email_confirmed_at := NOW();
    END IF;

    -- Phone signups come from the WhatsApp bot, which already passes
    -- phone_confirm. Covered here too so the two paths cannot diverge.
    IF NEW.phone_confirmed_at IS NULL AND NEW.phone IS NOT NULL THEN
        NEW.phone_confirmed_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.autoconfirm_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS autoconfirm_new_users ON auth.users;
CREATE TRIGGER autoconfirm_new_users
    BEFORE INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.autoconfirm_new_user();

COMMENT ON FUNCTION public.autoconfirm_new_user() IS
    'Marks new accounts confirmed on creation, standing in for the "Confirm email" setting because this project has no SMTP. Drop the autoconfirm_new_users trigger to restore normal confirmation.';
