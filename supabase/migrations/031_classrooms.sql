-- 031 — Classrooms.
--
-- A classroom is a `groups` row with a block-section identity, not a new
-- species. `groups` already carries membership, roles, invite codes and RLS
-- that avoids the recursion trap, and `deadlines.group_id` already points at
-- it; adding a third membership concept beside it would mean three places to
-- get the same question wrong.
--
-- What is genuinely new is the block section — `BSCS-4B-M`, a cohort that takes
-- every subject together. `sections` (002) is per *course*, one row per subject
-- a section takes, and cannot represent that.
--
-- Nothing here grants sight of anyone's attendance or grades, and no policy in
-- this migration or the next may be extended to. 12-CLASSROOMS-PLAN.md §9.

-- --- The classroom shape --------------------------------------------------

alter table public.groups
  add column kind         text not null default 'study'
                          check (kind in ('study','classroom')),
  add column term_id      uuid references public.terms(id) on delete cascade,
  add column section_code text,
  add column program_code text,
  add column year_level   smallint check (year_level between 1 and 6),
  add column campus       text check (campus in ('M','T','C','V')),
  add column who_can_post text not null default 'anyone'
                          check (who_can_post in ('rep','anyone')),
  add column archived_at  timestamptz;

comment on column public.groups.section_code is
  'Canonical block section, ''BSCS-4B-M''. Written only through '
  'parseSectionCode in @onetup/core, so one section typed four ways is one '
  'classroom rather than four.';

comment on column public.groups.campus is
  'M Manila, T Taguig, C Cavite, V Visayas. Part of the identity, not a '
  'detail: Manila''s BSCS-4B and Taguig''s BSCS-4B are different cohorts.';

-- A classroom must carry its whole section identity; a study group must not be
-- allowed to half-carry one. The shape is enforced here rather than in a route,
-- because a route is one of several ways a row can arrive.
alter table public.groups
  add constraint groups_classroom_shape check (
    kind <> 'classroom'
    or (term_id is not null and section_code is not null and campus is not null)
  );

-- One live classroom per section per term. The database decides this, not a
-- client that remembered to check first; the create route turns the resulting
-- 23505 into a join request against the classroom that already exists.
create unique index idx_one_classroom_per_section
  on public.groups (term_id, section_code)
  where kind = 'classroom' and archived_at is null;

create index idx_groups_classroom_lookup
  on public.groups (term_id, section_code)
  where kind = 'classroom';

-- --- Who the rep is -------------------------------------------------------

/*
 * `owner` is not a separate column — it is a role, and it implies rep. There is
 * no fourth role, and nothing outside this feature reads these values.
 */
create or replace function public.is_group_rep(target_group uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = target_group
      and m.user_id = (select auth.uid())
      and m.role in ('owner','rep')
  );
$$;

-- A rep rotates the invite code, and the owner archives; 012 only let the
-- creator update the row. `is_group_rep` is true for the owner as well, so this
-- widens the policy by exactly one role.
create policy groups_update_rep on public.groups
  for update using (public.is_group_rep(id))
  with check (public.is_group_rep(id));

-- --- Membership -----------------------------------------------------------

-- 012 wrote the check inline, so Postgres named it group_members_role_check.
alter table public.group_members
  drop constraint group_members_role_check,
  add constraint group_members_role_check
    check (role in ('owner','rep','member'));

alter table public.group_members
  -- Denormalised from the parent group so "one classroom per term" can be a
  -- unique index rather than a trigger that fires too late to help.
  add column term_id uuid references public.terms(id) on delete cascade,
  -- Copied at join time. The submission log has to show a name, and `profiles`
  -- is own-row-only under RLS — which it stays. 12-CLASSROOMS-PLAN.md §8.
  add column display_name text;

create unique index idx_one_classroom_per_student_per_term
  on public.group_members (user_id, term_id)
  where term_id is not null;

/*
 * Both denormalised columns are filled by the database, never by the client.
 *
 * `security definer` is required: the trigger reads the joining student's
 * `profiles` row, and own-row RLS would otherwise hide it from a rep's approval
 * call — which is exactly the path that matters, because the rep is the one
 * inserting the membership row.
 */
create or replace function public.fill_membership_denormals()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select g.term_id into new.term_id
    from public.groups g where g.id = new.group_id and g.kind = 'classroom';
  select p.full_name into new.display_name
    from public.profiles p where p.id = new.user_id;
  return new;
end $$;

create trigger group_members_denormals
  before insert on public.group_members
  for each row execute function public.fill_membership_denormals();

/*
 * Name drift, closed at the source.
 *
 * A student who edits their name in `profiles` would otherwise appear under the
 * old one in every submission log for the rest of the term. Doing this in a
 * trigger rather than in the profile save path means it cannot be forgotten by
 * a second caller. No `security definer`: the rows updated are the student's
 * own, which `members_update_own` from 012 already allows.
 */
create or replace function public.sync_membership_display_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.full_name is distinct from old.full_name then
    update public.group_members set display_name = new.full_name where user_id = new.id;
  end if;
  return new;
end $$;

create trigger profiles_sync_display_name
  after update on public.profiles
  for each row execute function public.sync_membership_display_name();

-- --- Joining --------------------------------------------------------------

create table public.group_join_requests (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected','withdrawn')),
  -- The claim, frozen at request time. A profile edited afterwards must not
  -- change what the rep was actually looking at when they decided.
  claimed_student_number text,
  claimed_full_name      text,
  claimed_section_code   text,
  message     text check (char_length(message) <= 200),
  decided_by  uuid references auth.users(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (group_id, user_id)
);

comment on table public.group_join_requests is
  'A request to join a classroom. The rep decides on a claim, not on evidence: '
  'nothing here is verified against the registrar, because nothing can be '
  '(07-AUTH-ERS.md §3). What protects a class is that a fake section stays '
  'empty — the invite link comes from the group chat the class already trusts.';

create index idx_join_requests_group_pending
  on public.group_join_requests (group_id) where status = 'pending';

create index idx_join_requests_user on public.group_join_requests (user_id);

alter table public.group_join_requests enable row level security;

create policy join_requests_read_own on public.group_join_requests
  for select using (user_id = (select auth.uid()));
create policy join_requests_read_rep on public.group_join_requests
  for select using (public.is_group_rep(group_id));
create policy join_requests_create on public.group_join_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy join_requests_withdraw on public.group_join_requests
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'withdrawn');

/*
 * Approval cannot be a plain update: admitting a member is an insert *for
 * another user*, and `members_join` in 012 requires `user_id = auth.uid()`.
 * Doing it here also makes the membership row and the decision one transaction,
 * so a classroom can never hold a decided request with nobody admitted.
 */
create or replace function public.decide_join_request(request uuid, approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.group_join_requests;
begin
  select * into r from public.group_join_requests where id = request for update;
  if not found                           then raise exception 'join request not found'; end if;
  if not public.is_group_rep(r.group_id) then raise exception 'not permitted';          end if;
  if r.status <> 'pending'               then raise exception 'already decided';        end if;

  if approve then
    begin
      insert into public.group_members (group_id, user_id, role)
      values (r.group_id, r.user_id, 'member')
      on conflict (group_id, user_id) do nothing;
    exception when unique_violation then
      -- idx_one_classroom_per_student_per_term. The student joined another
      -- section between asking and being approved; the rep gets a sentence
      -- rather than a constraint name.
      raise exception 'already in a classroom this term';
    end;
  end if;

  update public.group_join_requests
     set status     = case when approve then 'approved' else 'rejected' end,
         decided_by = (select auth.uid()),
         decided_at = now()
   where id = request;
end $$;

/*
 * The invite landing, for someone who is not a member yet.
 *
 * `groups_read` from 012 shows a group to its members and its creator and to
 * nobody else, which is correct and stays. This is the one narrow window
 * through it: a code-holder sees the section code, the campus, how many people
 * are in and who the rep is — enough to recognise their own class — and
 * nothing else. No member list, no posts, no ids beyond the group's own.
 */
create or replace function public.classroom_by_invite(code text)
returns table (
  id           uuid,
  section_code text,
  campus       text,
  term_id      uuid,
  term_label   text,
  member_count bigint,
  rep_name     text,
  archived     boolean
)
language sql security definer stable set search_path = '' as $$
  select g.id,
         g.section_code,
         g.campus,
         g.term_id,
         t.label,
         (select count(*) from public.group_members m where m.group_id = g.id),
         (select m.display_name from public.group_members m
           where m.group_id = g.id and m.role = 'owner' limit 1),
         g.archived_at is not null
    from public.groups g
    left join public.terms t on t.id = g.term_id
   where g.invite_code = code
     and g.kind = 'classroom';
$$;

-- --- Grants ---------------------------------------------------------------
--
-- A `security definer` function is executable by `public` by default, which
-- would hand `anon` the ability to approve members into a classroom. Every
-- function in this feature revokes and re-grants explicitly; 023 is the
-- precedent for where such grants live.

revoke execute on function public.decide_join_request(uuid, boolean) from public, anon;
grant  execute on function public.decide_join_request(uuid, boolean) to authenticated;
revoke execute on function public.is_group_rep(uuid) from public, anon;
grant  execute on function public.is_group_rep(uuid) to authenticated;
revoke execute on function public.classroom_by_invite(text) from public, anon;
grant  execute on function public.classroom_by_invite(text) to authenticated;
revoke execute on function public.fill_membership_denormals() from public, anon;
revoke execute on function public.sync_membership_display_name() from public, anon;

grant select, insert, update on public.group_join_requests to authenticated;

-- --- Canonicalise what is already stored ----------------------------------
--
-- `profiles.section_label` predates this migration and pre-fills the create
-- form, so it is brought to the same canonical form the parser produces. The
-- pattern is `parseSectionCode` written as SQL, deliberately identical: strip
-- everything that is not alphanumeric, uppercase, then split. A row that does
-- not parse is left exactly as the student typed it rather than mangled.

with parsed as (
  select id,
         regexp_match(
           upper(regexp_replace(section_label, '[^A-Za-z0-9]', '', 'g')),
           '^([A-Z]{2,10})([1-6])([A-Z0-9])([MTCV])$'
         ) as parts
    from public.profiles
   where section_label is not null
)
update public.profiles p
   set section_label = parsed.parts[1] || '-' || parsed.parts[2] || parsed.parts[3]
                       || '-' || parsed.parts[4]
  from parsed
 where parsed.id = p.id
   and parsed.parts is not null
   and p.section_label is distinct from
       (parsed.parts[1] || '-' || parsed.parts[2] || parsed.parts[3] || '-' || parsed.parts[4]);
