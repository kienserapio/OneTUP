-- 013 — Study packs, flashcards, practice questions, sessions.
--
-- Every generated artefact carries `source_chunk_id`. That is what turns
-- "check it against the source" from a disclaimer into an action a student can
-- actually take, and it is why the chunks are stored rather than discarded
-- after generation.

create table public.study_packs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  enrollment_id  uuid references public.enrollments(id) on delete set null,
  title          text not null,
  source_name    text,
  source_path    text,                     -- Supabase Storage path
  summary        text,
  key_concepts   jsonb,
  status         text not null default 'processing'
                 check (status in ('processing','ready','failed')),
  model_used     text,
  prompt_version text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.study_chunks (
  id        uuid primary key default gen_random_uuid(),
  pack_id   uuid not null references public.study_packs(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  ordinal   smallint not null,
  content   text not null,
  embedding extensions.vector(384),
  created_at timestamptz not null default now()
);

create table public.flashcards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  pack_id         uuid not null references public.study_packs(id) on delete cascade,
  source_chunk_id uuid references public.study_chunks(id) on delete set null,
  front           text not null,
  back            text not null,
  -- SM-2 state
  ease_factor   numeric(4,2) not null default 2.5 check (ease_factor >= 1.3),
  interval_days integer not null default 0,
  repetitions   integer not null default 0,
  due_on        date not null default current_date,
  lapses        integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.flashcard_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  quality      smallint not null check (quality between 0 and 5),
  reviewed_at  timestamptz not null default now()
);

create table public.practice_questions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  pack_id         uuid not null references public.study_packs(id) on delete cascade,
  source_chunk_id uuid references public.study_chunks(id) on delete set null,
  question        text not null,
  answer          text not null,
  explanation     text,
  difficulty      text check (difficulty in ('easy','medium','hard')),
  created_at      timestamptz not null default now()
);

create table public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  enrollment_id    uuid references public.enrollments(id) on delete set null,
  pack_id          uuid references public.study_packs(id) on delete set null,
  mode             text not null check (mode in
                   ('pomodoro','flashcards','blurt','feynman','practice_test','cram')),
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer,
  score            numeric(5,2),
  created_at       timestamptz not null default now()
);

alter table public.study_packs        enable row level security;
alter table public.study_chunks       enable row level security;
alter table public.flashcards         enable row level security;
alter table public.flashcard_reviews  enable row level security;
alter table public.practice_questions enable row level security;
alter table public.study_sessions     enable row level security;

create policy packs_all_own     on public.study_packs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy chunks_all_own    on public.study_chunks
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cards_all_own     on public.flashcards
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy reviews_all_own   on public.flashcard_reviews
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy questions_all_own on public.practice_questions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sessions_all_own  on public.study_sessions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_cards_due on public.flashcards (user_id, due_on);
create index idx_chunks_pack on public.study_chunks (pack_id, ordinal);
create index idx_questions_pack on public.practice_questions (pack_id);
create index idx_sessions_user on public.study_sessions (user_id, started_at desc);

select public.attach_updated_at('public.study_packs');
select public.attach_updated_at('public.flashcards');
