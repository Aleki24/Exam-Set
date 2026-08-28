-- Migration 044.
-- Pin the search_path on the three trigger functions that did not have one.
--
-- Supabase's security linter flags `function_search_path_mutable` on all three.
-- A function with no `search_path` of its own resolves unqualified names using
-- whatever the *caller's* path happens to be. Anyone able to create objects in a
-- schema earlier on that path can therefore put their own `now()`, or their own
-- table, in front of the one the function meant — and these run as triggers on
-- writes, so the hijacked call happens on somebody else's insert.
--
-- None of the three is SECURITY DEFINER, so this is hardening rather than a live
-- hole: the function runs with the caller's own rights either way. It closes the
-- shadowing route regardless, and costs nothing.
--
-- `public, pg_temp` rather than `''`: the bodies reference their tables
-- unqualified, and an empty path would break them outright. pg_temp is listed
-- last explicitly — left implicit, Postgres searches it FIRST, which is the
-- shadowing route this is meant to shut.
--
-- Idempotent: ALTER FUNCTION ... SET is a no-op when the value already matches.

ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_exam_search_keywords() SET search_path = public, pg_temp;
ALTER FUNCTION public.bump_exam_purchase_count() SET search_path = public, pg_temp;
