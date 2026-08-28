-- ============================================================================
-- WORD DOCUMENTS IN THE PAPER BUCKET
-- Migration: 034_word_uploads.sql
--
-- The shop sold PDFs because the bucket accepted PDFs. Most of what Kenyan
-- teachers actually buy from a resource site — schemes of work, lesson plans,
-- records of work — is bought precisely so it can be edited before it is used,
-- and that means Word. A locked PDF of a scheme of work is half a product.
--
-- `allowed_mime_types` is the bucket's own copy of the list in
-- `src/lib/uploadFormats.ts`. The two have to agree: the app authorises an
-- upload and hands the browser a signed URL, and if storage then refuses the
-- content type the failure lands in the browser with nothing in this app able
-- to explain it. Adding a format is a change to both, always.
--
-- Only the canonical content types are listed. The app resolves the aliases a
-- browser may report (`application/octet-stream` for a .docx is the common one)
-- down to these before it signs anything, so storage never sees them.
--
-- Nothing about the bucket's privacy changes. It stays private, with no storage
-- policies: every upload goes through /api/papers/upload after an admin check
-- and every download is signed by /api/papers/[id]/download after an
-- entitlement check.
-- ============================================================================

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
           'application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/msword'
       ]
 WHERE id = 'exam-papers';

-- Belt and braces for a project restored from an older dump, where 014 may
-- never have run and the bucket does not exist at all.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'exam-papers',
    'exam-papers',
    FALSE,
    26214400,                                -- 25 MB, matching the upload route
    ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
    ]
)
ON CONFLICT (id) DO NOTHING;
