-- ============================================================================
-- THE QUESTION BANK IS NOT A SCRATCH PAD
-- Migration: 040_question_bank_write_guard.sql
--
-- `questions_write_authenticated` granted ALL on `questions` to every
-- authenticated role with `USING (true)`. INSERT, UPDATE and DELETE, on every
-- row, to anybody who completed a sign-up form.
--
-- The bank is the asset the whole product is built on: the setter draws from it,
-- every generated paper is made of it, and it is the one thing here that cannot
-- be re-derived from a backup of anything else. One `delete()` from any account
-- emptied it.
--
-- WHAT THIS KEEPS
--
-- INSERT stays open to authenticated users, because contributing is a real flow
-- and not an oversight: `/set` is deliberately public, the README grants "Set
-- exams" to the User role, and the setter calls `createQuestion` /
-- `bulkCreateQuestions` when a teacher quick-adds to cover a gap while building
-- a paper. Closing INSERT would break the setter for everyone but staff.
--
-- WHAT THIS CLOSES
--
-- UPDATE and DELETE become admin-only. There is no ownership model to appeal to
-- — `questions` has no `created_by` column, so "edit your own" is not something
-- the table can express. Until it can, editing and removing shared stock is a
-- staff action, which is what the README already claims and what the policy
-- failed to enforce.
--
-- READS ARE DELIBERATELY UNTOUCHED
--
-- `Public Read Questions` looks alarming and is correct. `/set` is
-- unauthenticated on purpose, and `utils/supabase/publicClient.ts` exists
-- precisely so the bank loads with no session — it was written to fix the setter
-- hanging on "Loading bank…" behind a stalled token refresh. Restricting reads
-- would break the flagship free tool.
--
-- That marking schemes are readable by anyone is therefore a pricing decision,
-- not a leak, and it is not this migration's business.
-- ============================================================================

drop policy if exists questions_write_authenticated on public.questions;

-- Contributing: any signed-in user, exactly as before.
create policy questions_insert_authenticated
    on public.questions
    for insert
    to authenticated
    with check (true);

-- Correcting and removing: staff only.
create policy questions_update_admin
    on public.questions
    for update
    to authenticated
    using (is_admin())
    with check (is_admin());

create policy questions_delete_admin
    on public.questions
    for delete
    to authenticated
    using (is_admin());
