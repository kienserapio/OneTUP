-- 003 — Identity, preferences, thresholds.
--
-- The first user-owned tables, and therefore the first place RLS matters. Every
-- policy here is `auth.uid() = <owner column>` with no administrative override:
-- there is deliberately no role that can read another student's rows.

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  student_number text unique,
  full_name      text,
  program_code   text,
  year_level     smallint check (year_level between 1 and 6),
  section_label  text,
  campus         text not null default 'manila',
  locale         text not null default 'en' check (locale in ('en','fil')),
  onboarded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.profiles.student_number is
  'Display and class-representative verification only. Never an auth factor.';

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.profiles
  for delete using ((select auth.uid()) = id);

select public.attach_updated_at('public.profiles');


create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Departure planning. The commute foreign keys are added in 008, once those
  -- tables exist; the columns live here so preferences stay in one place.
  home_area_id             uuid,
  default_route_id         uuid,
  preparation_minutes      smallint not null default 45  check (preparation_minutes between 0 and 240),
  arrive_early_minutes     smallint not null default 15  check (arrive_early_minutes between 0 and 120),
  apply_peak_adjustment    boolean  not null default true,
  apply_weather_adjustment boolean  not null default true,
  weather_threshold_pct    smallint not null default 60  check (weather_threshold_pct between 0 and 100),
  weather_buffer_minutes   smallint not null default 15  check (weather_buffer_minutes between 0 and 120),

  -- Schedule
  day_start          time not null default '07:00',
  day_end            time not null default '21:00',
  week_starts_monday boolean not null default true,
  check (day_end > day_start),

  -- Attendance
  default_allowed_absences smallint not null default 5 check (default_allowed_absences >= 0),
  lates_per_absence        smallint not null default 3 check (lates_per_absence > 0),
  attendance_prompt_delay  smallint not null default 5 check (attendance_prompt_delay between 0 and 180),

  -- Notifications
  quiet_hours_start     time  not null default '22:00',
  quiet_hours_end       time  not null default '06:00',
  notification_settings jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
create policy prefs_all_own on public.user_preferences
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

select public.attach_updated_at('public.user_preferences');


create type public.threshold_scope as enum ('term','cumulative');
create type public.threshold_kind  as enum ('gwa','absence');
create type public.threshold_state as enum ('clear','at_risk','breached');

create table public.user_thresholds (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       public.threshold_kind not null,
  label      text not null,
  scope      public.threshold_scope not null default 'term',
  comparator text not null check (comparator in ('<=','>=','<','>')),
  value      numeric(5,2) not null,
  active     boolean not null default true,
  last_state public.threshold_state,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.user_thresholds.last_state is
  'Stops a notification repeating for a state the student has already been told about.';

alter table public.user_thresholds enable row level security;
create policy thresholds_all_own on public.user_thresholds
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_thresholds_user on public.user_thresholds (user_id) where active;

select public.attach_updated_at('public.user_thresholds');


-- New accounts get a profile and a preference row immediately, so no code path
-- anywhere has to cope with them being absent.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, student_number, full_name)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'student_number', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
