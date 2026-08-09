-- ============================================================================
-- A REVIEW QUEUE, AND KEYS FOR THE THINGS THAT WILL FILL IT
-- Migration: 041_review_queue_and_ingest_keys.sql
--
-- The bank is about to start receiving questions from a model rather than from
-- a person, and the two need different treatment. A teacher who quick-adds a
-- question while building their own paper has read it. A model that writes
-- fifty overnight has not been read by anyone.
--
-- So `review_status` decides what the public sees, and nothing generated
-- reaches a buyer until somebody says so.
--
-- WHERE THE EXISTING 253 LAND
--
-- Approved if they carry a marking scheme, pending if they do not. That split
-- is not arbitrary: the site's own title sells "papers & marking schemes", and
-- a question with no scheme prints "No marking scheme recorded for this
-- question" onto a document somebody paid for. 50 of the 253 have one.
--
-- This deliberately shrinks the setter's visible bank from 253 to 50. That is
-- the honest number — the other 203 were always going to produce half a
-- product, and holding them makes the gap something you can see and work
-- through rather than something a buyer discovers.
-- ============================================================================

create type question_review_status as enum ('approved', 'pending', 'rejected');

/*
 * The default is 'approved', not 'pending', and that is deliberate.
 *
 * `/set` calls `createQuestion` when a teacher quick-adds to cover a gap
 * mid-paper. Defaulting to 'pending' would make the question they just wrote
 * invisible to the policy below, so the paper they are building could not use
 * it — the feature would appear to silently fail.
 *
 * A person who typed a question has read it. A model that wrote fifty
 * overnight has not, so the ingest route sets 'pending' explicitly. The
 * default protects the existing flow; the exception is where the risk is.
 */
alter table public.questions
    add column if not exists review_status question_review_status not null default 'approved',
    add column if not exists created_by uuid references auth.users(id) on delete set null,
    add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
    add column if not exists reviewed_at timestamptz;

-- Everything already in the bank, judged by the one thing that decides whether
-- it can be sold: does it come with an answer. 50 of 253 do.
update public.questions
   set review_status = 'pending'
 where marking_scheme is null or btrim(marking_scheme) = '';

create index if not exists questions_review_status_idx
    on public.questions (review_status);

-- ---------------------------------------------------------------------------
-- Reads: the public sees approved questions; staff see everything.
--
-- `/set` is unauthenticated and loads the bank through a session-less client,
-- so this policy is what the setter actually reads. It must stay permissive
-- enough for that and narrow enough that unreviewed generated content cannot
-- be assembled into a paper somebody buys.
-- ---------------------------------------------------------------------------
drop policy if exists "Public Read Questions" on public.questions;

create policy questions_select_approved
    on public.questions
    for select
    to public
    using (
        review_status = 'approved'
        or is_admin()
        -- Your own contribution is visible to you the moment you write it,
        -- whatever the queue thinks of it. Anything else makes quick-add feel
        -- broken to the one person who knows the question is fine.
        or created_by = auth.uid()
    );

-- ---------------------------------------------------------------------------
-- Ingest keys.
--
-- The MCP server runs on somebody's laptop, not in this deployment, so it
-- cannot hold a session and must not hold a service-role key — that key
-- bypasses row level security entirely and would turn a leaked laptop into
-- full database access.
--
-- Only the hash is stored. A key that cannot be read back out of the database
-- cannot be leaked by anything that can read the database.
-- ---------------------------------------------------------------------------
create table if not exists public.ingest_keys (
    id uuid primary key default gen_random_uuid(),
    -- What it is for, so a key can be revoked without guessing what breaks.
    name text not null,
    -- sha256 of the key. Never the key itself.
    key_hash text not null unique,
    -- The first characters, shown in the UI so a key is recognisable in a list.
    key_prefix text not null,
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz
);

alter table public.ingest_keys enable row level security;

-- Staff only, and even then read-only from the client: keys are minted and
-- revoked through routes that can hash, never by writing this table directly.
create policy ingest_keys_select_admin
    on public.ingest_keys
    for select
    to authenticated
    using (is_admin());

create index if not exists ingest_keys_hash_idx on public.ingest_keys (key_hash) where revoked_at is null;
