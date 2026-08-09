-- 011 — Announcements and class representatives.
--
-- The insert policy is the load-bearing defence here: a student cannot publish
-- into a course they are not enrolled in, whatever the client sends.
-- University-wide announcements are service-role only.

create type public.announcement_type as enum
  ('exam','quiz','deadline','room_change','suspension','schedule_change','general');
create type public.trust_level as enum ('official','verified','community');

create table public.announcements (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid references public.courses(id) on delete set null,
  section_id         uuid references public.sections(id) on delete set null,
  term_id            uuid references public.terms(id) on delete set null,
  is_university_wide boolean not null default false,
  type               public.announcement_type not null default 'general',
  summary            text not null check (char_length(summary) <= 140),
  detail             text,
  event_date         date,
  event_time         time,
  trust              public.trust_level not null default 'community',
  submitted_by       uuid references auth.users(id) on delete set null,
  confirmations      integer not null default 1,
  disputes           integer not null default 0,
  is_hidden          boolean not null default false,
  content_hash       text not null,
  extraction         jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- Read: university-wide, or matching one of the reader's own enrollments.
create policy announcements_read on public.announcements
  for select using (
    not is_hidden and (
      is_university_wide
      or exists (
        select 1 from public.enrollments e
        where e.user_id = (select auth.uid())
          and e.course_id = announcements.course_id
          and e.term_id   = announcements.term_id
      )
    )
  );

-- Insert: only into a course the submitter is actually enrolled in, and never
-- university-wide — that path belongs to the service role alone.
create policy announcements_insert on public.announcements
  for insert to authenticated with check (
    submitted_by = (select auth.uid())
    and not is_university_wide
    and exists (
      select 1 from public.enrollments e
      where e.user_id = (select auth.uid())
        and e.course_id = announcements.course_id
    )
  );

-- A submitter may correct their own post; nobody may edit anyone else's.
create policy announcements_update_own on public.announcements
  for update to authenticated
  using (submitted_by = (select auth.uid()))
  with check (submitted_by = (select auth.uid()) and not is_university_wide);

create index idx_announcements_course on public.announcements (course_id, created_at desc);
create index idx_announcements_hash on public.announcements (content_hash);
create index idx_announcements_recent on public.announcements (created_at desc)
  where not is_hidden;

select public.attach_updated_at('public.announcements');


create table public.announcement_confirmations (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  is_dispute      boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.announcement_confirmations enable row level security;
create policy confirmations_all_own on public.announcement_confirmations
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


create table public.class_reps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  section_id  uuid not null references public.sections(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected','revoked')),
  basis       text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- One approved representative per section, enforced by the database.
create unique index idx_one_active_rep on public.class_reps (section_id) where status = 'approved';

alter table public.class_reps enable row level security;
create policy reps_read_own on public.class_reps
  for select using ((select auth.uid()) = user_id);
create policy reps_apply on public.class_reps
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');


-- Everything a student shared, before it became (or failed to become) a post.
-- Kept separately from `announcements` so a rejected proposal never appears in
-- anyone's feed, and so a student's own submissions are theirs to delete.
create table public.announcement_submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  raw_content   text,
  image_path    text,
  source        text not null default 'paste'
                check (source in ('share_target','paste','image','webhook','admin')),
  content_hash  text not null,
  extraction    jsonb,
  status        text not null default 'proposed'
                check (status in ('proposed','published','discarded','duplicate')),
  announcement_id uuid references public.announcements(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.announcement_submissions enable row level security;
create policy submissions_all_own on public.announcement_submissions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_submissions_hash on public.announcement_submissions (content_hash, created_at desc);

select public.attach_updated_at('public.announcement_submissions');


-- Confirmations and disputes are counted by the database, so the tallies cannot
-- drift from the rows that produced them. Two disputes outweighing the
-- confirmations hides the post pending moderation — enough to stop small-scale
-- misinformation without putting a moderator in the loop for the normal case.
create or replace function public.recount_announcement_votes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.announcement_id, old.announcement_id);
  confirms integer;
  disputes integer;
begin
  select
    count(*) filter (where not is_dispute),
    count(*) filter (where is_dispute)
  into confirms, disputes
  from public.announcement_confirmations
  where announcement_id = target;

  update public.announcements a
  set confirmations = greatest(1, confirms),
      disputes      = disputes,
      is_hidden     = (disputes >= 2 and disputes > confirms)
  where a.id = target;

  return null;
end $$;

create trigger t_announcement_votes
  after insert or update or delete on public.announcement_confirmations
  for each row execute function public.recount_announcement_votes();
