-- 002 — Shared academic reference data: terms, the course catalog, sections.
--
-- These carry no personal data, so they are world-readable. Writes are narrow:
-- an authenticated student may *insert* a course or section, because an import
-- routinely discovers ones the catalog has never seen. Nobody may update or
-- delete, so one student's correction cannot corrupt the shared catalog —
-- corrections go through moderation instead.

create table public.terms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,             -- '2025-2026-2'
  label         text not null,                    -- '2nd Semester AY 2025-2026'
  academic_year text not null,
  ordinal       smallint not null check (ordinal between 1 and 3),
  starts_on     date,
  ends_on       date,
  is_current    boolean not null default false,
  created_at    timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on > starts_on)
);

-- At most one current term, enforced by the database rather than by discipline.
create unique index idx_terms_current on public.terms (is_current) where is_current;

alter table public.terms enable row level security;
create policy terms_read_all on public.terms for select using (true);


create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,                    -- 'CS 3105'
  title         text not null,
  lec_units     numeric(3,1) not null default 0,
  lab_units     numeric(3,1) not null default 0,
  units         numeric(3,1) not null,
  program_code  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (code, title)
);

create index idx_courses_code on public.courses (code);

alter table public.courses enable row level security;
create policy courses_read_all on public.courses for select using (true);
create policy courses_insert_auth on public.courses
  for insert to authenticated with check (true);

select public.attach_updated_at('public.courses');


create table public.sections (
  id           uuid primary key default gen_random_uuid(),
  term_id      uuid not null references public.terms(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  label        text not null,                     -- 'BSCS 3-1'
  faculty_name text,
  created_at   timestamptz not null default now(),
  unique (term_id, course_id, label)
);

create index idx_sections_term_course on public.sections (term_id, course_id);

alter table public.sections enable row level security;
create policy sections_read_all on public.sections for select using (true);
create policy sections_insert_auth on public.sections
  for insert to authenticated with check (true);
