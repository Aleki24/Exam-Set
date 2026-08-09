-- ============================================================================
-- FIGURES BELONG WITH THEIR QUESTIONS
-- Migration: 042_question_figures.sql
--
-- A third of the questions on a typical Kenyan paper carry a diagram — a
-- gradient graph, a net, concentric arcs, a distance-time graph — and they are
-- often the higher-mark ones. None of them could be stocked: `questions` has
-- had `image_path`, `image_caption` and `image_required` since the beginning,
-- and nothing could write a file for them to point at.
--
-- WHY A SEPARATE, PUBLIC BUCKET
--
-- `exam-papers` is private because a paper is the paid product and its PDF must
-- never have a public link. A figure is not the product. It is one diagram out
-- of forty questions, useless on its own, and gating it would mean signing a
-- URL per figure on every render — forty round trips to print one paper, on the
-- connection this whole product is designed around.
--
-- So figures get their own bucket, public to read and staff-only to write. The
-- paywall stays exactly where it was, on the assembled document.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'question-figures',
    'question-figures',
    true,
    5 * 1024 * 1024,                                  -- a cropped diagram, not a scan
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may look at a diagram. That is the point of the bucket.
drop policy if exists question_figures_public_read on storage.objects;
create policy question_figures_public_read
    on storage.objects
    for select
    to public
    using (bucket_id = 'question-figures');

-- Only staff may put one there, or replace or remove one. The same rule
-- migration 040 applied to the questions themselves: contributing a question is
-- open, editing shared stock is not.
drop policy if exists question_figures_admin_write on storage.objects;
create policy question_figures_admin_write
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'question-figures' and is_admin());

drop policy if exists question_figures_admin_update on storage.objects;
create policy question_figures_admin_update
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'question-figures' and is_admin());

drop policy if exists question_figures_admin_delete on storage.objects;
create policy question_figures_admin_delete
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'question-figures' and is_admin());
