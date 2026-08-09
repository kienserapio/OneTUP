-- 005 — Attendance.
--
-- The most sensitive table in the product alongside grades. There is no query
-- path, view, endpoint or role anywhere that returns attendance for more than
-- one student. Section aggregates are not a future feature; they are excluded
-- by design (PRD §8.1, TDD §4.5).

create type public.attendance_status as enum ('present','absent','late','excused');

create table public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  block_id      uuid references public.schedule_blocks(id) on delete set null,
  session_date  date not null,
  status        public.attendance_status not null,
  note          text,
  recorded_via  text not null default 'prompt'
                check (recorded_via in ('prompt','catchup','manual','assistant')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- One record per class meeting. This is also what makes an offline write
  -- replayed twice on reconnect idempotent rather than duplicated.
  unique (user_id, enrollment_id, session_date, block_id)
);

comment on type public.attendance_status is
  'excused is student-declared and excluded from every count, so an approved '
  'absence never inflates a cut total.';

alter table public.attendance_records enable row level security;
create policy attendance_all_own on public.attendance_records
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_attendance_user_enrollment
  on public.attendance_records (user_id, enrollment_id, session_date desc);
create index idx_attendance_user_date
  on public.attendance_records (user_id, session_date desc);

select public.attach_updated_at('public.attendance_records');
