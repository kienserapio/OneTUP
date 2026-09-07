-- 036 — Suspension advisories.
--
-- The decision this whole feature turns on: **an advisory never cancels a class
-- by itself.** A signal-1 announcement suspends face-to-face classes and half
-- the faculty then move the session online, so "no classes today" and "classes
-- are online today" are both true statements about the same announcement, and
-- only the student and their professor know which one applies to them.
--
-- Auto-marking those sessions `cancelled` would delete a class that happened,
-- in the student's own attendance record, on a day they attended it. So this
-- migration stores what was announced and nothing about what it means.
-- 15-SUSPENSIONS-PLAN.md §1.

-- --- How a session was actually held --------------------------------------

alter table public.attendance_records
  add column if not exists delivery_mode text
    check (delivery_mode in ('f2f', 'online'));

comment on column public.attendance_records.delivery_mode is
  'How the session was actually held, when it differs from normal. Null means '
  'as scheduled. Set by the student, never inferred: a suspension announcement '
  'is exactly as likely to move a class online as to call it off. '
  'Present-online is a present — it changes no count. What it buys is a '
  'student reconstructing a term two months later being able to see why a week '
  'looks odd, which is the same reason 030 added cancelled.';

-- --- Where a cancelled record came from ------------------------------------
--
-- `suspension` is a distinct provenance from `prompt`. One means the student
-- answered a question about one class; the other means they told the app that a
-- whole day was called off. When somebody is reconstructing a term later, "all
-- five of these came from one tap on a typhoon advisory" is exactly the context
-- that explains an odd-looking week — which is the entire reason this column
-- exists.

alter table public.attendance_records
  drop constraint if exists attendance_records_recorded_via_check;

alter table public.attendance_records
  add constraint attendance_records_recorded_via_check
  check (recorded_via in ('prompt', 'catchup', 'manual', 'assistant', 'suspension'));

-- --- The advisories themselves --------------------------------------------

create table if not exists public.suspension_advisories (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('national', 'ncr', 'city', 'university')),
  -- Null for a national or university-wide notice; the city name for an LGU one.
  city          text,
  effective_on  date not null,
  level         text check (level in
                ('signal_1', 'signal_2', 'signal_3', 'signal_4', 'signal_5',
                 'flood', 'holiday', 'other')),
  headline      text not null check (char_length(headline) between 1 and 200),
  source_url    text,
  source        text not null check (source in ('pagasa', 'lgu', 'university', 'student')),
  created_at    timestamptz not null default now(),
  -- One advisory per scope, place, day and level. The same typhoon announced
  -- twice is one row, which is what stops a card appearing twice on Today.
  unique (scope, city, effective_on, level)
);

comment on table public.suspension_advisories is
  'What was announced, and nothing about what it means for any one student. '
  'Read-only reference: everyone selects, only the service role writes. There '
  'is no student data here, so there is no per-user clause to write.';

create index if not exists idx_advisories_effective
  on public.suspension_advisories (effective_on desc);

alter table public.suspension_advisories enable row level security;

-- One permissive select policy and no per-user clause, because there is no
-- user in this table. Writes are absent on purpose: nothing but the service
-- role should be able to tell every student in the country that class is off.
create policy advisories_read_all on public.suspension_advisories
  for select using (true);

-- A correct policy without a GRANT yields "permission denied", which is what
-- the campus map hit on its first anonymous load. 022 is the precedent; this
-- migration carries its own grants for the same reason 031 and 032 do.
grant select on public.suspension_advisories to anon, authenticated;
grant select, insert, update, delete on public.suspension_advisories to service_role;
