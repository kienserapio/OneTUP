-- 004 — Enrollments and schedule blocks. M1, the keystone.
--
-- Every other module reads from here. `raw_schedule` is kept on every block so
-- an improved parser can be re-run against historical imports without asking a
-- student to import again.

create table public.enrollments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  course_id         uuid not null references public.courses(id),
  section_id        uuid references public.sections(id) on delete set null,
  term_id           uuid not null references public.terms(id),
  faculty_name      text,
  allowed_absences  smallint check (allowed_absences >= 0),   -- null = use the preference default
  lates_per_absence smallint check (lates_per_absence > 0),
  color_key         smallint,                                 -- stable colour index across views
  source            text not null default 'ers_import'
                    check (source in ('ers_import','manual','paste')),
  imported_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, course_id, term_id)
);

alter table public.enrollments enable row level security;
create policy enrollments_all_own on public.enrollments
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_enrollments_user_term on public.enrollments (user_id, term_id);
create index idx_enrollments_course on public.enrollments (course_id);

select public.attach_updated_at('public.enrollments');


create type public.weekday as enum
  ('monday','tuesday','wednesday','thursday','friday','saturday','sunday');

create table public.schedule_blocks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  enrollment_id     uuid references public.enrollments(id) on delete cascade,
  title             text,                                     -- manual blocks only
  day               public.weekday not null,
  start_time        time not null,
  end_time          time not null,
  room              text,
  source            text not null default 'ers_import'
                    check (source in ('ers_import','manual','paste','announcement')),
  raw_schedule      text,
  parse_status      text not null default 'ok'
                    check (parse_status in ('ok','partial','failed')),
  prompt_attendance boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_time > start_time),
  -- A block is either a class or a labelled personal commitment; never neither.
  check (enrollment_id is not null or title is not null)
);

comment on column public.schedule_blocks.raw_schedule is
  'The original ERS string, so a parser fix can be replayed against old imports.';

alter table public.schedule_blocks enable row level security;
create policy blocks_all_own on public.schedule_blocks
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_blocks_user_day on public.schedule_blocks (user_id, day, start_time);
create index idx_blocks_enrollment on public.schedule_blocks (enrollment_id);

select public.attach_updated_at('public.schedule_blocks');


-- Re-sync remembers what a student already rejected, so the next diff does not
-- propose it again unless the underlying ERS value changes.
create table public.schedule_rejections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  term_id      uuid not null references public.terms(id) on delete cascade,
  change_kind  text not null,
  course_code  text not null,
  change_hash  text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, term_id, change_hash)
);

alter table public.schedule_rejections enable row level security;
create policy rejections_all_own on public.schedule_rejections
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
