-- 014 — Faculty evaluation.
--
-- `evaluation_answers.value` is only ever written by a student action. There is
-- no code path, and no column default, that produces a Likert rating — the
-- evaluation exists to give the university real signal about teaching, and
-- polluting it would harm the students who come after (PRD §8.4).
--
-- Both the student's original bullets and the prose they approved are kept, so
-- they can always revert.

create table public.evaluation_instruments (
  id         uuid primary key default gen_random_uuid(),
  term_id    uuid references public.terms(id) on delete set null,
  version    text not null,
  questions  jsonb not null,   -- [{id, text, ordinal, scale_min, scale_max}]
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.evaluations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  enrollment_id   uuid not null references public.enrollments(id) on delete cascade,
  instrument_id   uuid not null references public.evaluation_instruments(id),
  faculty_name    text not null,
  comment_bullets text,
  comment_final   text,
  status          text not null default 'draft'
                  check (status in ('draft','complete','exported')),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, enrollment_id, instrument_id)
);

create table public.evaluation_answers (
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  question_id   text not null,
  value         smallint not null check (value between 1 and 5),
  updated_at    timestamptz not null default now(),
  primary key (evaluation_id, question_id)
);

alter table public.evaluation_instruments enable row level security;
alter table public.evaluations            enable row level security;
alter table public.evaluation_answers     enable row level security;

create policy instruments_read on public.evaluation_instruments for select using (true);
create policy evals_all_own    on public.evaluations
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy answers_all_own  on public.evaluation_answers
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_evaluations_user on public.evaluations (user_id, status);

select public.attach_updated_at('public.evaluations');
