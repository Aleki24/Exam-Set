-- Create exam_sessions table
create table public.exam_sessions (
  id uuid not null default gen_random_uuid (),
  exam_id uuid not null,
  user_id uuid not null default auth.uid (),
  status text not null check (
    status in ('in_progress', 'submitted', 'timed_out', 'abandoned')
  ),
  score double precision null,
  max_score double precision null,
  percentage double precision null,
  time_limit_seconds integer null,
  time_remaining integer null,
  started_at timestamp with time zone not null default now(),
  submitted_at timestamp with time zone null,
  ip_address text null,
  user_agent text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint exam_sessions_pkey primary key (id),
  constraint exam_sessions_exam_id_fkey foreign key (exam_id) references exams (id) on delete cascade
) tablespace pg_default;

-- Create exam_responses table
create table public.exam_responses (
  id uuid not null default gen_random_uuid (),
  session_id uuid not null,
  question_id uuid not null,
  response jsonb not null default '{}'::jsonb,
  is_correct boolean null,
  marks_awarded double precision null,
  marks_possible double precision null,
  time_spent_seconds integer null default 0,
  is_flagged boolean not null default false,
  first_answered_at timestamp with time zone null,
  last_updated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint exam_responses_pkey primary key (id),
  constraint exam_responses_session_id_fkey foreign key (session_id) references exam_sessions (id) on delete cascade,
  constraint exam_responses_question_id_fkey foreign key (question_id) references questions (id) on delete cascade
) tablespace pg_default;

-- Create indexes for performance
create index idx_exam_sessions_user_id on public.exam_sessions (user_id);
create index idx_exam_sessions_exam_id on public.exam_sessions (exam_id);
create index idx_exam_responses_session_id on public.exam_responses (session_id);

-- Enable RLS
alter table public.exam_sessions enable row level security;
alter table public.exam_responses enable row level security;

-- RLS Policies for exam_sessions
create policy "Users can view their own sessions"
  on public.exam_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sessions"
  on public.exam_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own sessions"
  on public.exam_sessions for update
  using (auth.uid() = user_id);

-- RLS Policies for exam_responses
create policy "Users can view responses for their sessions"
  on public.exam_responses for select
  using (
    exists (
      select 1 from exam_sessions
      where id = exam_responses.session_id
      and user_id = auth.uid()
    )
  );

create policy "Users can insert responses for their sessions"
  on public.exam_responses for insert
  with check (
    exists (
      select 1 from exam_sessions
      where id = exam_responses.session_id
      and user_id = auth.uid()
    )
  );

create policy "Users can update responses for their sessions"
  on public.exam_responses for update
  using (
    exists (
      select 1 from exam_sessions
      where id = exam_responses.session_id
      and user_id = auth.uid()
    )
  );
