-- ============================================================================
-- THE ROLE, IN THE ACCESS TOKEN
-- Migration: 037_role_in_the_access_token.sql
--
-- Every guarded API route asked the database who the caller was, purely to read
-- one column. `requireAdmin` runs on a fifth of the routes and each call was a
-- PostgREST round trip for `profiles.role` — a value the auth server already
-- knows at the moment it mints the token, and which does not change between one
-- request and the next.
--
-- Supabase's custom access token hook runs when a token is issued or refreshed.
-- Putting the role in the token there means the application can read it out of a
-- JWT it has already verified, and the round trip disappears.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It does not change `is_admin()`, `is_owner()` or `current_role_name()`. They go
-- on reading `profiles`, and every row level security policy and every privileged
-- function goes on calling them.
--
-- That is the whole safety argument for this migration, so it is worth stating
-- plainly. A claim in a token is a photograph of the role at the moment the token
-- was minted. Tokens live for the access-token lifetime — an hour by default — so
-- for up to an hour after an owner removes somebody's admin, that person still
-- holds a token that says "admin".
--
-- The two mistakes are not the same size:
--
--   a stale claim in the app    an ex-admin sees an admin screen and gets a clean
--                               refusal from the database when they touch
--                               anything, because the wall is `is_admin()`.
--   a stale claim in the wall   an ex-admin confirms a payment.
--
-- `admin_confirm_order` and `set_user_role` both call `is_admin()` / `is_owner()`
-- inside Postgres, where reading `profiles` is a local index lookup rather than a
-- network hop. There was never anything to save there. The cost was entirely in
-- the application asking over the wire, and that is the only place this changes.
--
-- ENABLING IT
--
-- Creating the function is not enough: the hook has to be switched on for the
-- project.
--
--   Hosted   Dashboard → Authentication → Hooks → Customize Access Token (JWT)
--            Claims → select `public.custom_access_token_hook`.
--   Local    supabase/config.toml:
--              [auth.hook.custom_access_token]
--              enabled = true
--              uri = "pg-functions://postgres/public/custom_access_token_hook"
--
-- Until it is switched on the claim is simply absent, and the application falls
-- back to reading `profiles` exactly as before. Existing sessions do the same
-- until their next refresh. There is no moment at which anybody is locked out,
-- which is why the application treats a missing claim as "ask the database"
-- rather than as "not an admin".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. THE HOOK
--
-- STABLE and reads one row. It runs on every token issue and refresh, so it has
-- to stay this cheap.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_claims JSONB;
BEGIN
    SELECT p.role
      INTO v_role
      FROM public.profiles p
     WHERE p.id = (event->>'user_id')::UUID;

    v_claims := event->'claims';

    -- Written even when it is null. A claim that is present and null says "this
    -- account has no role on record"; an absent claim says "this token was
    -- minted before the hook existed". The application needs to tell those
    -- apart — the first is a plain user, the second means go and ask.
    v_claims := jsonb_set(v_claims, '{user_role}', COALESCE(to_jsonb(v_role), 'null'::JSONB));

    RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. WHO MAY RUN IT
--
-- The auth server runs this as `supabase_auth_admin`, which by default cannot
-- see anything in `public`. Nobody else has any business executing it: it is not
-- a security boundary, but it is a function that takes a user id and returns
-- claims, and there is no reason to leave it callable.
-- ----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;

-- `profiles` has row level security on, and the auth server is subject to it
-- like anything else. Without this the hook silently reads nothing and every
-- token comes out claiming no role — which the application would then treat as
-- "ask the database", so it would fail safe, but it would also fail to do the
-- one thing it exists for.
DROP POLICY IF EXISTS "auth_admin_reads_roles" ON public.profiles;
CREATE POLICY "auth_admin_reads_roles" ON public.profiles
    AS PERMISSIVE FOR SELECT
    TO supabase_auth_admin
    USING (TRUE);

-- ----------------------------------------------------------------------------
-- 3. A NOTE ON THE OTHER DIRECTION
--
-- Nothing here lets anybody write their own role into a token. The hook reads
-- `profiles.role`, which only `set_user_role` can change (migration 013), which
-- is owner-only and guarded again by the `profiles_protect_role` trigger. The
-- token is downstream of that, and a forged token fails signature verification
-- before any of this is reached.
-- ----------------------------------------------------------------------------
