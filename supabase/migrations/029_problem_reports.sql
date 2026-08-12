-- 029 — Problem reports: the contact form behind /report.
--
-- Three decisions worth stating, because they are the security of this table:
--
--   * There is no insert policy, for any role. The form is open to signed-out
--     visitors, and an anonymous insert grant is an anonymous write endpoint —
--     every row arrives through the route handler on the service role, which is
--     the only place the rate limit and the honeypot are enforced. RLS with no
--     matching policy denies by default; that default is the point here.
--   * A student may read the reports they filed while signed in, and nothing
--     else. There is no "read all" policy, because this project has no admin
--     role to grant it to — triage happens in the Supabase dashboard, which
--     runs as the service role.
--   * `ip_hash` is a salted digest, never an address. It exists so the route
--     can count recent submissions from one source and for nothing else, and it
--     is unusable without the server-side salt.

create table public.problem_reports (
  id              uuid primary key default gen_random_uuid(),

  -- Null for a signed-out visitor. `set null` rather than `cascade`: deleting an
  -- account must not silently delete the bug report that account filed.
  user_id         uuid references auth.users(id) on delete set null,

  kind            text not null
                  check (kind in ('help','feedback','suggestion','issue','inquiry','other')),

  -- Bounded in the database as well as in the route. A length check here is
  -- what stops a body that skipped validation from becoming a storage problem.
  subject         text not null check (char_length(subject) between 3 and 120),
  message         text not null check (char_length(message) between 20 and 4000),

  full_name       text not null check (char_length(full_name) between 2 and 120),
  email           text check (email is null or char_length(email) between 5 and 254),

  -- Everything below is optional: a visitor who is not a student still has a
  -- right to report that something is broken.
  student_number  text check (student_number is null or student_number ~ '^[A-Za-z0-9-]{4,20}$'),
  section         text check (section is null or char_length(section) between 2 and 40),
  college         text check (college is null or char_length(college) between 2 and 120),

  status          text not null default 'new'
                  check (status in ('new','triaged','in_progress','resolved','closed')),

  -- Operational context, all bounded, none of it personal.
  ip_hash         text check (ip_hash is null or char_length(ip_hash) = 64),
  user_agent      text check (user_agent is null or char_length(user_agent) <= 200),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

comment on table public.problem_reports is
  'Contact form submissions from /report. Written only by the service role.';
comment on column public.problem_reports.ip_hash is
  'SHA-256 of (salt + client address). Rate limiting only. Never an address.';

alter table public.problem_reports enable row level security;

-- The only policy on this table. No insert, no update, no delete, for anyone
-- but the service role.
create policy reports_read_own on public.problem_reports
  for select using ((select auth.uid()) = user_id);

-- Triage order, and the lookup the route's rate limit does.
create index idx_reports_triage on public.problem_reports (status, created_at desc);
create index idx_reports_rate_limit on public.problem_reports (ip_hash, created_at desc);
create index idx_reports_user on public.problem_reports (user_id, created_at desc);

-- Grants. `anon` is deliberately absent: a signed-out visitor submits through
-- the route and never touches this table directly.
grant select on public.problem_reports to authenticated;
