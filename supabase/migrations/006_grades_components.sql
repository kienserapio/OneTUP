-- 006 — Grades and grade components.
--
-- TUP grades run 1.00 (highest) to 5.00 (failing). Non-numeric marks live in a
-- separate column and are excluded from GWA entirely, rather than being coerced
-- into a number that would quietly distort an average.

create table public.grades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  value         numeric(3,2) check (value between 1.00 and 5.00),
  mark          text check (mark in ('INC','DRP','W','P','NP')),
  is_projected  boolean not null default false,
  recorded_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, enrollment_id),
  check (value is not null or mark is not null)
);

alter table public.grades enable row level security;
create policy grades_all_own on public.grades
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_grades_enrollment on public.grades (enrollment_id);

select public.attach_updated_at('public.grades');


create table public.grade_components (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  label         text not null,
  weight_pct    numeric(5,2) not null check (weight_pct > 0 and weight_pct <= 100),
  -- One-sided: bonus points legitimately push a component past 100.
  score_pct     numeric(5,2) check (score_pct >= 0),
  is_complete   boolean not null default false,
  ordinal       smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.grade_components enable row level security;
create policy components_all_own on public.grade_components
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_components_enrollment on public.grade_components (enrollment_id, ordinal);

select public.attach_updated_at('public.grade_components');


-- The percentage-to-1.00-scale mapping varies by professor and is not knowable
-- centrally, so each student keeps their own per-course table.
create table public.grade_scale_mappings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  min_pct       numeric(5,2) not null,
  grade_value   numeric(3,2) not null check (grade_value between 1.00 and 5.00),
  created_at    timestamptz not null default now(),
  unique (enrollment_id, grade_value)
);

alter table public.grade_scale_mappings enable row level security;
create policy scale_mappings_all_own on public.grade_scale_mappings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
