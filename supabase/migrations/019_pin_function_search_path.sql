-- ============================================================================
-- PIN search_path ON EVERY SECURITY DEFINER FUNCTION
-- Migration: 019_pin_function_search_path.sql
--
-- A SECURITY DEFINER function runs with its owner's privileges but resolves
-- unqualified names using the *caller's* search_path. Anyone able to create an
-- object in a schema that sits earlier on that path can therefore decide which
-- `orders` or which `is_admin()` a privileged function actually reaches.
--
-- Pinning the path closes that off, and does it without touching a single
-- function body — which is what makes this safe to apply to twenty-one
-- functions at once. `public` is where every table these functions use lives,
-- and `pg_temp` is placed last on purpose: leaving it off the end entirely can
-- break some plpgsql, while putting it first would reopen the same hole through
-- temporary objects.
--
-- Written as a loop over the catalog rather than twenty-one ALTER statements so
-- that it stays correct as functions are added, and so re-running it is a no-op.
-- ============================================================================

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prosecdef
           AND NOT EXISTS (
               SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                WHERE c LIKE 'search_path=%'
           )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.sig);
    END LOOP;
END $$;
