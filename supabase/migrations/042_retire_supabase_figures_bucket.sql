-- ============================================================================
-- FIGURES GO WHERE THE PAPERS GO
-- Migration: 042_retire_supabase_figures_bucket.sql
--
-- An earlier attempt gave question figures their own public bucket in Supabase
-- Storage. That was wrong twice over, and the live account showed why.
--
-- This deployment stores through `utils/storage.ts`, which prefers Cloudflare
-- R2 whenever the four R2_* variables are set. They are — the bucket `examgen`
-- already held `papers/` and `exams/` prefixes written by the upload route, so
-- a Supabase bucket would never have been written to at all.
--
-- And the abstraction addresses exactly one bucket per backend. A second bucket
-- is not something it can express. Figures therefore live beside the papers as
-- a `figures/` prefix, which behaves identically on R2 and on Supabase and
-- needs no new configuration on either.
--
-- The bucket row is left in place: Supabase forbids deleting from
-- storage.buckets in SQL, and an empty unreferenced bucket costs nothing. The
-- policies are dropped so nothing can write to it by accident and mistake it
-- for the live store.
-- ============================================================================

drop policy if exists question_figures_public_read on storage.objects;
drop policy if exists question_figures_admin_write on storage.objects;
drop policy if exists question_figures_admin_update on storage.objects;
drop policy if exists question_figures_admin_delete on storage.objects;
