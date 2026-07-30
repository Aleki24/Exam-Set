-- ============================================================================
-- PRIVATE STORAGE BUCKET
-- Migration: 014_storage_bucket.sql
--
-- Where paper and marking-scheme PDFs live when Supabase Storage is the backend
-- (the default; set the R2_* variables to use Cloudflare R2 instead).
--
-- The bucket is private and stays private. No storage policies are granted,
-- because uploads and downloads both go through server routes holding the
-- service role: /api/papers/upload after an admin check, and
-- /api/papers/[id]/download after an entitlement check. A leaked bucket path is
-- worthless on its own.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exam-papers', 'exam-papers', FALSE, 26214400, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = 26214400,          -- 25 MB, matching the upload route
        allowed_mime_types = ARRAY['application/pdf'];
