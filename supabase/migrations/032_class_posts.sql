-- 032 — The shared tracker.
--
-- One row per announcement, plus one row per student who has touched it. The
-- rejected alternative was fan-out on write — a `deadlines` row per member —
-- which reads beautifully until "moved to Friday" has to chase thirty copies,
-- the copies drift, and there is nowhere to read a submission log from.
--
-- A class post is never copied into a student's private `deadlines` table. That
-- keeps one of this product's better properties intact: a student can always
-- tell which of their commitments they created and which the class did, and
-- `deadlines` stays exactly as private as it was before this feature existed.

create table public.class_posts (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups(id) on delete cascade,
  author_id       uuid references auth.users(id) on delete set null,
  -- Where it came from, when it came through the share sheet.
  submission_id   uuid references public.announcement_submissions(id) on delete set null,
  course_id       uuid references public.courses(id) on delete set null,
  kind            text not null default 'note'
                  check (kind in ('note','task','exam','quiz','suspension','room_change')),
  title           text not null check (char_length(title) between 1 and 140),
  detail          text check (char_length(detail) <= 2000),
  -- Set, and it appears in every member's tracker. Null, and it is a notice.
  due_at          timestamptz,
  requires_submission boolean not null default false,
  pinned          boolean not null default false,
  status          text not null default 'published'
                  check (status in ('published','hidden')),
  hidden_by       uuid references auth.users(id) on delete set null,
  edited_at       timestamptz,
  content_hash    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.class_posts.requires_submission is
  'Set at publish and never enableable afterwards — a rep who could flip it '
  'would be publishing a list about people who answered under different terms. '
  'Enforced by freeze_requires_submission, not by the UI.';

-- The same message pasted by five classmates is one post.
create unique index idx_class_posts_dedupe
  on public.class_posts (group_id, content_hash)
  where content_hash is not null;

create index idx_class_posts_group_due
  on public.class_posts (group_id, due_at) where status = 'published';

select public.attach_updated_at('public.class_posts');

create table public.class_post_states (
  post_id      uuid not null references public.class_posts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'open'
               check (status in ('open','done','submitted','dismissed')),
  submitted_at timestamptz,
  note         text check (char_length(note) <= 200),
  -- Personal. One student wanting three days' warning does not impose it on
  -- the other thirty.
  reminder_offsets integer[],
  updated_at   timestamptz not null default now(),
  primary key (post_id, user_id)
);

comment on table public.class_post_states is
  'Written lazily — the first time a student touches a post. No row means '
  '''open'', which keeps this table proportional to activity rather than to '
  'members × posts.';

select public.attach_updated_at('public.class_post_states');

create index idx_class_post_states_user on public.class_post_states (user_id);

/*
 * `submitted_at` is the database's to set.
 *
 * A client that could write it could backdate a submission mark, and the whole
 * value of the log is that the timestamp beside a name means what it says.
 */
create or replace function public.stamp_submitted_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'submitted' then
    if tg_op = 'INSERT' or old.status is distinct from 'submitted' then
      new.submitted_at := now();
    else
      new.submitted_at := old.submitted_at;
    end if;
  else
    new.submitted_at := null;
  end if;
  return new;
end $$;

create trigger class_post_states_stamp_submitted
  before insert or update on public.class_post_states
  for each row execute function public.stamp_submitted_at();

/*
 * Turning a log *on* after the fact is forbidden; turning it off is allowed and
 * simply hides it. See 12-CLASSROOMS-PLAN.md §8.
 */
create or replace function public.freeze_requires_submission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.requires_submission and not old.requires_submission then
    raise exception 'requires_submission cannot be enabled after publishing';
  end if;
  return new;
end $$;

create trigger class_posts_freeze_submission
  before update on public.class_posts
  for each row execute function public.freeze_requires_submission();

-- --- RLS ------------------------------------------------------------------

alter table public.class_posts       enable row level security;
alter table public.class_post_states enable row level security;

create policy class_posts_read on public.class_posts
  for select using (
    public.is_group_member(group_id)
    and (
      status = 'published'
      or author_id = (select auth.uid())
      or public.is_group_rep(group_id)
    )
  );

create policy class_posts_write on public.class_posts
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and public.is_group_member(group_id)
    and (
      public.is_group_rep(group_id)
      or exists (select 1 from public.groups g
                 where g.id = group_id
                   and g.who_can_post = 'anyone'
                   and g.archived_at is null)
    )
  );

-- An author may edit their own post; a rep may hide anyone's.
create policy class_posts_edit on public.class_posts
  for update using (author_id = (select auth.uid()) or public.is_group_rep(group_id))
  with check  (author_id = (select auth.uid()) or public.is_group_rep(group_id));

create policy class_posts_delete on public.class_posts
  for delete using (author_id = (select auth.uid()));

create policy states_all_own on public.class_post_states
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

/*
 * The single place in this product where one student sees another's state.
 *
 * Narrow on purpose: only on a post whose author explicitly asked for a log,
 * only while that post is published, and only to members of its classroom. It
 * is a self-declaration about one piece of work, never an aggregate — no screen
 * may total it across posts, which is a review criterion rather than a
 * preference (12-CLASSROOMS-PLAN.md §9.4).
 */
create policy states_read_class on public.class_post_states
  for select using (
    exists (
      select 1 from public.class_posts p
      where p.id = post_id
        and p.requires_submission
        and p.status = 'published'
        and public.is_group_member(p.group_id)
    )
  );

-- --- Grants ---------------------------------------------------------------

grant select, insert, update, delete on public.class_posts       to authenticated;
grant select, insert, update, delete on public.class_post_states to authenticated;

revoke execute on function public.stamp_submitted_at() from public, anon;
revoke execute on function public.freeze_requires_submission() from public, anon;
