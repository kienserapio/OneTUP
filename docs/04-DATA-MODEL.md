# OneTUP — Data Model & Schema

**Version 1.0 · August 2026 · PostgreSQL 15 (Supabase)**

---

## 1. Conventions

- All identifiers `snake_case`; tables plural.
- Primary keys are `uuid` defaulting to `gen_random_uuid()`.
- Every table carries `created_at timestamptz not null default now()`. Mutable tables also carry `updated_at`, maintained by trigger.
- User-owned tables carry `user_id uuid not null references auth.users(id) on delete cascade`.
- Times of day are stored as `time`; instants as `timestamptz`. **Application timezone is `Asia/Manila`**; all instants are stored in UTC and converted at the edge.
- Money is `numeric(8,2)`. Grades are `numeric(3,2)`.
- Soft delete is not used. Deletion is real, so that a student who deletes data has actually deleted it.

### 1.1 Global helpers

```sql
create extension if not exists "pgcrypto";
create extension if not exists "vector";

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Applied to every table with updated_at:
-- create trigger t_<table>_updated before update on <table>
--   for each row execute function set_updated_at();
```

---

## 2. Entity overview

```
auth.users
   └── profiles
         ├── enrollments ──── courses ──── terms
         │      ├── schedule_blocks
         │      ├── attendance_records
         │      ├── grades ──── grade_components
         │      └── evaluations ──── evaluation_answers
         ├── deadlines ──── deadline_subtasks
         ├── announcement_submissions
         ├── study_packs ──── flashcards ──── flashcard_reviews
         │                └── practice_questions
         ├── study_sessions
         ├── departure_plans
         ├── user_preferences
         ├── user_thresholds
         └── notification_subscriptions

reference (non-personal, shared):
   terms · courses · campus_places · commute_areas · commute_hubs
   commute_legs · commute_routes · route_legs · fare_rules · peak_bands
   sections · class_reps · announcements · knowledge_documents

operational:
   sync_jobs · ai_runs · audit_log · moderation_queue
```

---

## 3. Identity and preferences

### 3.1 `profiles`

```sql
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  student_number    text unique,
  full_name         text,
  program_code      text,
  year_level        smallint check (year_level between 1 and 6),
  section_label     text,
  campus            text not null default 'manila',
  locale            text not null default 'en' check (locale in ('en','fil')),
  onboarded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table profiles enable row level security;

create policy profiles_select_own on profiles
  for select using (auth.uid() = id);
create policy profiles_update_own on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_insert_own on profiles
  for insert with check (auth.uid() = id);
```

`student_number` is stored for display and for representative verification. It is **not** used as an authentication factor.

### 3.2 `user_preferences`

```sql
create table user_preferences (
  user_id                 uuid primary key references auth.users(id) on delete cascade,

  -- departure planning
  home_area_id            uuid references commute_areas(id),
  default_route_id        uuid references commute_routes(id),
  preparation_minutes     smallint not null default 45 check (preparation_minutes between 0 and 240),
  arrive_early_minutes    smallint not null default 15 check (arrive_early_minutes between 0 and 120),
  apply_peak_adjustment   boolean not null default true,
  apply_weather_adjustment boolean not null default true,
  weather_threshold_pct   smallint not null default 60,
  weather_buffer_minutes  smallint not null default 15,

  -- schedule
  day_start               time not null default '07:00',
  day_end                 time not null default '21:00',
  week_starts_monday      boolean not null default true,

  -- attendance
  default_allowed_absences smallint not null default 5,
  lates_per_absence        smallint not null default 3,
  attendance_prompt_delay  smallint not null default 5,

  -- notifications
  quiet_hours_start       time not null default '22:00',
  quiet_hours_end         time not null default '06:00',
  notification_settings   jsonb not null default '{}'::jsonb,

  updated_at              timestamptz not null default now()
);

alter table user_preferences enable row level security;
create policy prefs_all_own on user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 3.3 `user_thresholds`

```sql
create type threshold_scope as enum ('term','cumulative');
create type threshold_kind  as enum ('gwa','absence');

create table user_thresholds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        threshold_kind not null,
  label       text not null,
  scope       threshold_scope not null default 'term',
  comparator  text not null check (comparator in ('<=','>=','<','>')),
  value       numeric(5,2) not null,
  active      boolean not null default true,
  last_state  text check (last_state in ('clear','at_risk','breached')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table user_thresholds enable row level security;
create policy thresholds_all_own on user_thresholds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index idx_thresholds_user on user_thresholds(user_id) where active;
```

`last_state` prevents repeated notifications for a state already reported.

---

## 4. Academic core

### 4.1 `terms` — reference

```sql
create table terms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,            -- '2025-2026-2'
  label         text not null,                   -- '2nd Semester AY 2025–2026'
  academic_year text not null,
  ordinal       smallint not null,               -- 1, 2, 3 (summer)
  starts_on     date,
  ends_on       date,
  is_current    boolean not null default false,
  created_at    timestamptz not null default now()
);

create unique index idx_terms_current on terms(is_current) where is_current;

alter table terms enable row level security;
create policy terms_read_all on terms for select using (true);
```

Reference data: readable by everyone, writable only by service role.

### 4.2 `courses` — reference

```sql
create table courses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,                   -- 'CS 3105'
  title         text not null,
  lec_units     numeric(3,1) not null default 0,
  lab_units     numeric(3,1) not null default 0,
  units         numeric(3,1) not null,
  program_code  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (code, title)
);

alter table courses enable row level security;
create policy courses_read_all on courses for select using (true);
create policy courses_insert_auth on courses
  for insert to authenticated with check (true);
```

Authenticated users may insert because import discovers courses not yet in the catalog. They may not update or delete, which prevents one student's correction from corrupting the shared catalog. Corrections go through moderation.

### 4.3 `sections` — reference

```sql
create table sections (
  id          uuid primary key default gen_random_uuid(),
  term_id     uuid not null references terms(id),
  course_id   uuid not null references courses(id),
  label       text not null,                     -- 'BSCS 3-1'
  faculty_name text,
  created_at  timestamptz not null default now(),
  unique (term_id, course_id, label)
);

alter table sections enable row level security;
create policy sections_read_all on sections for select using (true);
create policy sections_insert_auth on sections
  for insert to authenticated with check (true);
```

### 4.4 `enrollments`

```sql
create table enrollments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  course_id          uuid not null references courses(id),
  section_id         uuid references sections(id),
  term_id            uuid not null references terms(id),
  faculty_name       text,
  allowed_absences   smallint,                   -- null = use preference default
  lates_per_absence  smallint,
  color_key          smallint,                   -- stable colour assignment index
  source             text not null default 'ers_import'
                     check (source in ('ers_import','manual','paste')),
  imported_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, course_id, term_id)
);

alter table enrollments enable row level security;
create policy enrollments_all_own on enrollments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index idx_enrollments_user_term on enrollments(user_id, term_id);
```

### 4.5 `schedule_blocks`

```sql
create type weekday as enum
  ('monday','tuesday','wednesday','thursday','friday','saturday','sunday');

create table schedule_blocks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  enrollment_id  uuid references enrollments(id) on delete cascade,
  title          text,                            -- for manual blocks
  day            weekday not null,
  start_time     time not null,
  end_time       time not null,
  room           text,
  source         text not null default 'ers_import'
                 check (source in ('ers_import','manual','paste','announcement')),
  raw_schedule   text,                            -- original ERS string
  parse_status   text not null default 'ok'
                 check (parse_status in ('ok','partial','failed')),
  prompt_attendance boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_time > start_time),
  check (enrollment_id is not null or title is not null)
);

alter table schedule_blocks enable row level security;
create policy blocks_all_own on schedule_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index idx_blocks_user_day on schedule_blocks(user_id, day, start_time);
create index idx_blocks_enrollment on schedule_blocks(enrollment_id);
```

`raw_schedule` is retained so a parser improvement can be re-run against historical imports without asking the student to re-import.

---

## 5. Attendance

```sql
create type attendance_status as enum ('present','absent','late','excused');

create table attendance_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  enrollment_id  uuid not null references enrollments(id) on delete cascade,
  block_id       uuid references schedule_blocks(id) on delete set null,
  session_date   date not null,
  status         attendance_status not null,
  note           text,
  recorded_via   text not null default 'prompt'
                 check (recorded_via in ('prompt','catchup','manual','assistant')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, enrollment_id, session_date, block_id)
);

alter table attendance_records enable row level security;
create policy attendance_all_own on attendance_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index idx_attendance_user_enrollment
  on attendance_records(user_id, enrollment_id, session_date desc);
```

### 5.1 Absence summary view

```sql
create view v_attendance_summary
with (security_invoker = true) as
select
  a.user_id,
  a.enrollment_id,
  count(*) filter (where a.status = 'absent')  as absent_count,
  count(*) filter (where a.status = 'late')    as late_count,
  count(*) filter (where a.status = 'excused') as excused_count,
  count(*) filter (where a.status = 'present') as present_count,
  coalesce(e.allowed_absences, p.default_allowed_absences)  as allowed,
  coalesce(e.lates_per_absence, p.lates_per_absence)        as lates_per_absence,
  count(*) filter (where a.status = 'absent')
    + floor(
        count(*) filter (where a.status = 'late')::numeric
        / nullif(coalesce(e.lates_per_absence, p.lates_per_absence), 0)
      ) as absence_units
from attendance_records a
join enrollments e on e.id = a.enrollment_id
join user_preferences p on p.user_id = a.user_id
group by a.user_id, a.enrollment_id, e.allowed_absences,
         p.default_allowed_absences, e.lates_per_absence, p.lates_per_absence;
```

`security_invoker = true` is essential — it makes the view respect the querying user's RLS rather than the view owner's. Without it, this view would leak every student's attendance.

---

## 6. Grades

```sql
create table grades (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  enrollment_id  uuid not null references enrollments(id) on delete cascade,
  value          numeric(3,2) check (value between 1.00 and 5.00),
  mark           text check (mark in ('INC','DRP','W','P','NP')),
  is_projected   boolean not null default false,
  recorded_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, enrollment_id),
  check (value is not null or mark is not null)
);

alter table grades enable row level security;
create policy grades_all_own on grades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

```sql
create table grade_components (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  enrollment_id  uuid not null references enrollments(id) on delete cascade,
  label          text not null,
  weight_pct     numeric(5,2) not null check (weight_pct > 0 and weight_pct <= 100),
  score_pct      numeric(5,2) check (score_pct >= 0),
  is_complete    boolean not null default false,
  ordinal        smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table grade_components enable row level security;
create policy components_all_own on grade_components
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index idx_components_enrollment on grade_components(enrollment_id, ordinal);
```

`score_pct` may exceed 100 to accommodate bonus points, hence the one-sided check.

### 6.1 GWA view

```sql
create view v_gwa
with (security_invoker = true) as
select
  e.user_id,
  e.term_id,
  round(sum(g.value * c.units) / nullif(sum(c.units), 0), 4) as gwa,
  sum(c.units)                                               as graded_units,
  count(*)                                                   as graded_courses,
  bool_or(g.is_projected)                                    as includes_projection
from enrollments e
join grades  g on g.enrollment_id = e.id
join courses c on c.id = e.course_id
where g.value is not null
group by e.user_id, e.term_id;
```

Cumulative GWA is the same aggregation without the `term_id` grouping. Both are also computed client-side from cached data so the figure is available offline.

---

## 7. Deadlines

```sql
create type deadline_status as enum ('open','done','dismissed');

create table deadlines (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  enrollment_id  uuid references enrollments(id) on delete set null,
  group_id       uuid references groups(id) on delete set null,
  title          text not null,
  notes          text,
  due_at         timestamptz not null,
  status         deadline_status not null default 'open',
  source         text not null default 'manual'
                 check (source in ('manual','announcement','photo','assistant','group')),
  source_ref     uuid,
  reminder_offsets integer[] not null default '{259200,86400,21600}',
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table deadlines enable row level security;
create policy deadlines_all_own on deadlines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index idx_deadlines_user_due on deadlines(user_id, due_at)
  where status = 'open';
```

`reminder_offsets` holds seconds before `due_at`. Defaults are 72h, 24h, 6h.

```sql
create table deadline_subtasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  deadline_id  uuid not null references deadlines(id) on delete cascade,
  title        text not null,
  due_at       timestamptz,
  is_done      boolean not null default false,
  ordinal      smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table deadline_subtasks enable row level security;
create policy subtasks_all_own on deadline_subtasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## 8. Announcements

```sql
create type announcement_type as enum
  ('exam','quiz','deadline','room_change','suspension','schedule_change','general');
create type trust_level as enum ('official','verified','community');

create table announcements (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid references courses(id),
  section_id      uuid references sections(id),
  term_id         uuid references terms(id),
  is_university_wide boolean not null default false,
  type            announcement_type not null default 'general',
  summary         text not null,
  detail          text,
  event_date      date,
  event_time      time,
  trust           trust_level not null default 'community',
  submitted_by    uuid references auth.users(id) on delete set null,
  confirmations   integer not null default 1,
  disputes        integer not null default 0,
  is_hidden       boolean not null default false,
  content_hash    text not null,
  extraction      jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table announcements enable row level security;

-- Read: university-wide, or matching one of the reader's enrollments
create policy announcements_read on announcements
  for select using (
    not is_hidden and (
      is_university_wide
      or exists (
        select 1 from enrollments e
        where e.user_id = auth.uid()
          and e.course_id = announcements.course_id
          and e.term_id   = announcements.term_id
      )
    )
  );

-- Insert: only into a course the submitter is enrolled in
create policy announcements_insert on announcements
  for insert to authenticated with check (
    submitted_by = auth.uid()
    and not is_university_wide
    and exists (
      select 1 from enrollments e
      where e.user_id = auth.uid()
        and e.course_id = announcements.course_id
    )
  );

create index idx_announcements_course on announcements(course_id, created_at desc);
create index idx_announcements_hash on announcements(content_hash);
```

The insert policy is the key defence: a student cannot publish into a section they are not in. University-wide announcements are service-role only.

```sql
create table announcement_confirmations (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  is_dispute      boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table announcement_confirmations enable row level security;
create policy confirmations_all_own on announcement_confirmations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

```sql
create table class_reps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  section_id  uuid not null references sections(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected','revoked')),
  basis       text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index idx_one_active_rep on class_reps(section_id)
  where status = 'approved';

alter table class_reps enable row level security;
create policy reps_read_own on class_reps
  for select using (auth.uid() = user_id);
create policy reps_apply on class_reps
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
```

The partial unique index enforces one approved representative per section at the database level.

---

## 9. Commute

```sql
create table commute_areas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  city       text,
  centroid   point,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table commute_hubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  kind       text check (kind in ('rail_station','terminal','landmark','campus_gate')),
  location   point not null,
  created_at timestamptz not null default now()
);

create table fare_rules (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,   -- 'puv_student_20','rail_matrix','flat','free'
  label        text not null,
  discount_pct numeric(5,2),
  matrix       jsonb,
  notes        text,
  updated_at   timestamptz not null default now()
);

create type transport_mode as enum
  ('walk','jeep','bus','uv_express','rail','tricycle','taxi','tnvs');

create table commute_legs (
  id                   uuid primary key default gen_random_uuid(),
  mode                 transport_mode not null,
  from_hub_id          uuid references commute_hubs(id),
  to_hub_id            uuid references commute_hubs(id),
  from_label           text not null,
  to_label             text not null,
  base_fare            numeric(8,2) not null default 0,
  fare_rule_code       text references fare_rules(code),
  duration_minutes     smallint not null,
  peak_penalty_minutes smallint not null default 0,
  geometry             jsonb,               -- GeoJSON LineString
  notes                text,
  status               text not null default 'approved'
                       check (status in ('pending','approved','flagged','retired')),
  submitted_by         uuid references auth.users(id) on delete set null,
  verified_count       integer not null default 0,
  last_verified_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table commute_routes (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references commute_areas(id) on delete cascade,
  label       text,
  direction   text not null default 'inbound' check (direction in ('inbound','outbound')),
  status      text not null default 'approved'
              check (status in ('pending','approved','flagged','retired')),
  submitted_by uuid references auth.users(id) on delete set null,
  verified_count integer not null default 0,
  last_verified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table route_legs (
  route_id  uuid not null references commute_routes(id) on delete cascade,
  leg_id    uuid not null references commute_legs(id) on delete cascade,
  ordinal   smallint not null,
  primary key (route_id, ordinal)
);

create table peak_bands (
  id               uuid primary key default gen_random_uuid(),
  corridor         text not null,
  days             weekday[] not null,
  start_time       time not null,
  end_time         time not null,
  penalty_minutes  smallint not null,
  severity         text not null default 'moderate'
                   check (severity in ('light','moderate','heavy')),
  created_at       timestamptz not null default now()
);
```

RLS for commute reference tables:

```sql
alter table commute_areas  enable row level security;
alter table commute_hubs   enable row level security;
alter table commute_legs   enable row level security;
alter table commute_routes enable row level security;
alter table route_legs     enable row level security;
alter table fare_rules     enable row level security;
alter table peak_bands     enable row level security;

-- Approved data is world-readable; pending data only to its submitter
create policy legs_read on commute_legs for select using (
  status = 'approved' or submitted_by = auth.uid()
);
create policy routes_read on commute_routes for select using (
  status = 'approved' or submitted_by = auth.uid()
);
create policy legs_submit on commute_legs for insert to authenticated
  with check (submitted_by = auth.uid() and status = 'pending');
create policy routes_submit on commute_routes for insert to authenticated
  with check (submitted_by = auth.uid() and status = 'pending');

-- The rest are read-only reference
create policy areas_read on commute_areas for select using (true);
create policy hubs_read  on commute_hubs  for select using (true);
create policy rlegs_read on route_legs    for select using (true);
create policy fares_read on fare_rules    for select using (true);
create policy peaks_read on peak_bands    for select using (true);
```

### 9.1 `departure_plans`

```sql
create table departure_plans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  plan_date          date not null,
  first_block_id     uuid references schedule_blocks(id) on delete cascade,
  route_id           uuid references commute_routes(id),
  class_start        timestamptz not null,
  arrive_by          timestamptz not null,
  leave_at           timestamptz not null,
  wake_at            timestamptz not null,
  base_minutes       smallint not null,
  peak_minutes       smallint not null default 0,
  weather_minutes    smallint not null default 0,
  explanation        text,
  adjustments        jsonb not null default '[]'::jsonb,
  computed_at        timestamptz not null default now(),
  unique (user_id, plan_date)
);

alter table departure_plans enable row level security;
create policy plans_all_own on departure_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

`adjustments` records each applied adjustment as `{kind, minutes, reason}`, which is what the templated explanation is built from.

---

## 10. Campus

```sql
create type place_category as enum
  ('building','gate','printing','food','study','service','landmark');

create table campus_places (
  id               uuid primary key default gen_random_uuid(),
  campus           text not null default 'manila',
  category         place_category not null,
  name             text not null,
  description      text,
  location         point not null,
  building_code    text,
  floor            text,
  room_range_start text,
  room_range_end   text,
  hours            jsonb,
  price_min        numeric(8,2),
  price_max        numeric(8,2),
  price_unit       text,
  contact_phone    text,
  tour_scene_url   text,
  status           text not null default 'approved'
                   check (status in ('pending','approved','flagged','retired')),
  submitted_by     uuid references auth.users(id) on delete set null,
  verified_count   integer not null default 0,
  last_verified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table campus_places enable row level security;

-- Public read, including anonymous
create policy places_read_public on campus_places
  for select using (status = 'approved');
create policy places_submit on campus_places
  for insert to authenticated
  with check (submitted_by = auth.uid() and status = 'pending');

create index idx_places_category on campus_places(campus, category)
  where status = 'approved';
```

`campus_places` is the one user-facing table readable anonymously, because campus data is non-personal and serving it without an account is a product requirement (ADR-012).

Room lookup uses `room_range_start`/`room_range_end` with a numeric comparison where both parse as integers, falling back to a prefix match otherwise.

---

## 11. Study

```sql
create table study_packs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  enrollment_id  uuid references enrollments(id) on delete set null,
  title          text not null,
  source_name    text,
  source_path    text,                      -- Supabase Storage path
  summary        text,
  key_concepts   jsonb,
  status         text not null default 'processing'
                 check (status in ('processing','ready','failed')),
  model_used     text,
  prompt_version text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table study_chunks (
  id         uuid primary key default gen_random_uuid(),
  pack_id    uuid not null references study_packs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  ordinal    smallint not null,
  content    text not null,
  embedding  vector(384)
);

create table flashcards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  pack_id         uuid not null references study_packs(id) on delete cascade,
  source_chunk_id uuid references study_chunks(id) on delete set null,
  front           text not null,
  back            text not null,
  -- SM-2 state
  ease_factor     numeric(4,2) not null default 2.5,
  interval_days   integer not null default 0,
  repetitions     integer not null default 0,
  due_on          date not null default current_date,
  lapses          integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table flashcard_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  quality      smallint not null check (quality between 0 and 5),
  reviewed_at  timestamptz not null default now()
);

create table practice_questions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  pack_id         uuid not null references study_packs(id) on delete cascade,
  source_chunk_id uuid references study_chunks(id) on delete set null,
  question        text not null,
  answer          text not null,
  explanation     text,
  difficulty      text check (difficulty in ('easy','medium','hard')),
  created_at      timestamptz not null default now()
);

create table study_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  enrollment_id  uuid references enrollments(id) on delete set null,
  pack_id        uuid references study_packs(id) on delete set null,
  mode           text not null check (mode in
                 ('pomodoro','flashcards','blurt','feynman','practice_test','cram')),
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  duration_seconds integer,
  score          numeric(5,2),
  created_at     timestamptz not null default now()
);
```

All six tables carry the same policy shape:

```sql
alter table study_packs        enable row level security;
alter table study_chunks       enable row level security;
alter table flashcards         enable row level security;
alter table flashcard_reviews  enable row level security;
alter table practice_questions enable row level security;
alter table study_sessions     enable row level security;

create policy packs_all_own      on study_packs        for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy chunks_all_own     on study_chunks       for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy cards_all_own      on flashcards         for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy reviews_all_own    on flashcard_reviews  for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy questions_all_own  on practice_questions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy sessions_all_own   on study_sessions     for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create index idx_cards_due on flashcards(user_id, due_on) where due_on <= current_date;
create index idx_chunks_embedding on study_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

---

## 12. Faculty evaluation

```sql
create table evaluation_instruments (
  id         uuid primary key default gen_random_uuid(),
  term_id    uuid references terms(id),
  version    text not null,
  questions  jsonb not null,     -- [{id, text, ordinal, scale_min, scale_max}]
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);

create table evaluations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  instrument_id uuid not null references evaluation_instruments(id),
  faculty_name  text not null,
  comment_bullets text,
  comment_final   text,
  status        text not null default 'draft'
                check (status in ('draft','complete','exported')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, enrollment_id, instrument_id)
);

create table evaluation_answers (
  evaluation_id uuid not null references evaluations(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  question_id   text not null,
  value         smallint not null check (value between 1 and 5),
  updated_at    timestamptz not null default now(),
  primary key (evaluation_id, question_id)
);

alter table evaluation_instruments enable row level security;
alter table evaluations            enable row level security;
alter table evaluation_answers     enable row level security;

create policy instruments_read on evaluation_instruments for select using (true);
create policy evals_all_own    on evaluations       for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy answers_all_own  on evaluation_answers for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
```

`comment_bullets` preserves the student's original input; `comment_final` holds the version they approved. Both are kept so the student can always revert.

---

## 13. Groups

```sql
create table groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  enrollment_ref uuid references courses(id),
  created_by    uuid not null references auth.users(id) on delete cascade,
  invite_code   text unique not null default encode(gen_random_bytes(6), 'hex'),
  created_at    timestamptz not null default now()
);

create table group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table groups        enable row level security;
alter table group_members enable row level security;

create policy groups_read on groups for select using (
  exists (select 1 from group_members m
          where m.group_id = groups.id and m.user_id = auth.uid())
);
create policy members_read on group_members for select using (
  exists (select 1 from group_members m
          where m.group_id = group_members.group_id and m.user_id = auth.uid())
);
```

Group membership grants visibility of shared deadlines and, with per-student consent, free-block availability. It **never** grants visibility of grades or attendance.

---

## 14. Knowledge base

```sql
create table knowledge_documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null,     -- 'curriculum','policy','calendar','org','faq'
  program_code text,
  source_url  text,
  source_note text,
  content     text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references knowledge_documents(id) on delete cascade,
  ordinal      smallint not null,
  content      text not null,
  embedding    vector(384)
);

alter table knowledge_documents enable row level security;
alter table knowledge_chunks    enable row level security;
create policy kb_docs_read   on knowledge_documents for select using (is_active);
create policy kb_chunks_read on knowledge_chunks    for select using (true);

create index idx_kb_embedding on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

Every chunk retains a path back to `source_url`, which is what allows the assistant to cite rather than assert.

---

## 15. Operational tables

```sql
create table sync_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('schedule_import','schedule_resync')),
  status       text not null default 'queued'
               check (status in ('queued','running','succeeded','failed')),
  parser_version text,
  rows_parsed  smallint,
  rows_failed  smallint,
  error_code   text,
  error_detail text,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table sync_jobs enable row level security;
create policy sync_read_own on sync_jobs for select using (auth.uid() = user_id);
```

**`sync_jobs` never contains credentials.** `error_detail` is sanitised before write, and a CI test asserts that no credential-shaped value can reach it.

```sql
create table ai_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  capability     text not null,
  model          text not null,
  prompt_version text not null,
  input_hash     text not null,
  cache_hit      boolean not null default false,
  input_tokens   integer,
  output_tokens  integer,
  latency_ms     integer,
  status         text not null check (status in ('ok','invalid_output','error','refused')),
  error_code     text,
  created_at     timestamptz not null default now()
);

alter table ai_runs enable row level security;
create policy ai_runs_read_own on ai_runs for select using (auth.uid() = user_id);

create index idx_ai_runs_cache on ai_runs(capability, input_hash, prompt_version);
```

`ai_runs` records metadata only. Prompt and completion content are never stored.

```sql
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  actor       text not null default 'user' check (actor in ('user','system','assistant')),
  reason      text,
  reversible  boolean not null default true,
  reverted_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table audit_log enable row level security;
create policy audit_read_own on audit_log for select using (auth.uid() = user_id);

create index idx_audit_user on audit_log(user_id, created_at desc);
```

`reason` is what powers the receipt shown beside any automated action — "Added because your beadle posted this at 11:42 PM."

```sql
create table moderation_queue (
  id           uuid primary key default gen_random_uuid(),
  entity       text not null,
  entity_id    uuid not null,
  reason       text not null,
  reported_by  uuid references auth.users(id) on delete set null,
  status       text not null default 'open'
               check (status in ('open','resolved','dismissed')),
  resolved_by  uuid references auth.users(id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table moderation_queue enable row level security;
create policy moderation_insert on moderation_queue
  for insert to authenticated with check (reported_by = auth.uid());
```

```sql
create table notification_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth_key   text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, endpoint)
);

alter table notification_subscriptions enable row level security;
create policy subs_all_own on notification_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## 16. Migration order

```
001_extensions
002_reference_terms_courses_sections
003_profiles_preferences_thresholds
004_enrollments_schedule_blocks
005_attendance
006_grades_components
007_deadlines_subtasks
008_commute_reference
009_departure_plans
010_campus_places
011_announcements_reps
012_groups
013_study
014_evaluations
015_knowledge_base
016_operational
017_views
018_indexes
019_seed_reference
```

Each migration creates its tables **and** their RLS policies in the same file. A table is never committed without a policy.

---

## 17. Schema-level safeguards

### 17.1 RLS coverage test

```sql
-- Must return zero rows. Run in CI on every migration.
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity;
```

### 17.2 Policy existence test

```sql
-- Every RLS-enabled table must have at least one policy.
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policy p where p.polrelid = c.oid
  );
```

### 17.3 View safety

Every view over user data must be created with `security_invoker = true`. A view without it runs with the definer's privileges and silently bypasses RLS — the single most likely way this schema could leak data.

```sql
-- Must return zero rows.
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and coalesce(
        (select option_value from pg_options_to_table(c.reloptions)
         where option_name = 'security_invoker'), 'false') <> 'true';
```

### 17.4 Cross-user access test

For each user-owned table, the integration suite authenticates as user A and attempts to read, update, and delete a row owned by user B. All must fail. This runs on every migration, not only on the tables changed.
