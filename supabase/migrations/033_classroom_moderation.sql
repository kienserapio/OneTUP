-- 033 — Removing, promoting, and the stranded classroom.
--
-- 012's membership policies are all `user_id = auth.uid()`: a student may join
-- themselves, update themselves and leave. Every remaining ability in
-- 12-CLASSROOMS-PLAN.md §6 crosses that line — a rep promotes someone else, a
-- rep removes someone else, an owner hands the classroom over — so each one is
-- a `security definer` function with the role check inside it, rather than a
-- widened policy that would also let a member edit a member.
--
-- Two things here are corrections to what 031 and 032 left implicit:
--
--   * Leaving must take a student's submission marks with it. The plan says
--     they "cascade away", but no foreign key connects `class_post_states` to
--     `group_members`, so without the trigger below a leaver's ticks stay
--     visible in every log for the rest of the term (§9.6).
--   * The stranded classroom. Without a way past a dormant owner, one account
--     that stops opening the app holds a section for a semester (§6 step 6).

/*
 * A leaver's marks go with them, whether they left or were removed.
 *
 * `security definer` because the rows belong to the departing student and the
 * caller may be the rep who removed them.
 */
create or replace function public.purge_states_on_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.class_post_states s
   using public.class_posts p
   where s.post_id = p.id
     and s.user_id = old.user_id
     and p.group_id = old.group_id;
  return old;
end $$;

create trigger group_members_purge_states
  after delete on public.group_members
  for each row execute function public.purge_states_on_leave();

/*
 * Promote, demote, and hand over.
 *
 * `owner` is the one role the database keeps unique per classroom, because two
 * owners is a disagreement nobody can resolve. Handing it over is therefore one
 * statement pair inside one transaction, never an insert followed by a hope.
 */
create or replace function public.set_member_role(
  target_group uuid,
  target_user  uuid,
  new_role     text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_role text;
begin
  if new_role not in ('owner','rep','member') then
    raise exception 'unknown role';
  end if;

  select m.role into caller_role
    from public.group_members m
   where m.group_id = target_group and m.user_id = (select auth.uid());

  if caller_role is null then raise exception 'not permitted'; end if;

  -- A rep may make a rep; only the owner may hand the classroom over, and only
  -- the owner may take a rep's badge back.
  if new_role = 'owner' and caller_role <> 'owner' then
    raise exception 'not permitted';
  end if;
  if caller_role not in ('owner','rep') then
    raise exception 'not permitted';
  end if;
  if new_role = 'member' and caller_role <> 'owner' then
    raise exception 'not permitted';
  end if;

  if not exists (
    select 1 from public.group_members m
     where m.group_id = target_group and m.user_id = target_user
  ) then
    raise exception 'not a member';
  end if;

  -- The owner is never demoted by anyone but themselves handing over.
  if new_role <> 'owner' and exists (
    select 1 from public.group_members m
     where m.group_id = target_group and m.user_id = target_user and m.role = 'owner'
  ) then
    raise exception 'the owner cannot be demoted';
  end if;

  if new_role = 'owner' then
    update public.group_members set role = 'rep'
     where group_id = target_group and user_id = (select auth.uid());
  end if;

  update public.group_members set role = new_role
   where group_id = target_group and user_id = target_user;
end $$;

/*
 * Removal. A rep may remove a member; nobody may remove the owner, who leaves
 * by handing over first — otherwise a promoted rep could evict the person who
 * created the classroom.
 */
create or replace function public.remove_classroom_member(
  target_group uuid,
  target_user  uuid
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_group_rep(target_group) then raise exception 'not permitted'; end if;
  if target_user = (select auth.uid()) then raise exception 'use leave instead'; end if;

  if exists (
    select 1 from public.group_members m
     where m.group_id = target_group and m.user_id = target_user and m.role = 'owner'
  ) then
    raise exception 'the owner cannot be removed';
  end if;

  delete from public.group_members
   where group_id = target_group and user_id = target_user;
end $$;

/*
 * The stranded classroom.
 *
 * Owner activity is derived rather than tracked: the last post they wrote, the
 * last request they decided, and failing both, the day they created the
 * classroom. That needs no new column and no new write path, and it cannot
 * drift out of step with what actually happened.
 *
 * After sixty quiet days any rep may take the classroom over. The old owner
 * becomes a rep rather than being removed — they did not do anything wrong,
 * they stopped opening the app.
 */
create or replace function public.claim_classroom_ownership(target_group uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id     uuid;
  last_seen    timestamptz;
  caller       uuid := (select auth.uid());
begin
  select m.user_id, m.joined_at into owner_id, last_seen
    from public.group_members m
   where m.group_id = target_group and m.role = 'owner';

  if owner_id is null then raise exception 'no owner to claim from'; end if;
  if owner_id = caller then raise exception 'you already own this classroom'; end if;

  if not exists (
    select 1 from public.group_members m
     where m.group_id = target_group and m.user_id = caller and m.role = 'rep'
  ) then
    raise exception 'not permitted';
  end if;

  select greatest(
           last_seen,
           coalesce((select max(p.created_at) from public.class_posts p
                      where p.group_id = target_group and p.author_id = owner_id), last_seen),
           coalesce((select max(r.decided_at) from public.group_join_requests r
                      where r.group_id = target_group and r.decided_by = owner_id), last_seen)
         )
    into last_seen;

  if last_seen > now() - interval '60 days' then
    raise exception 'the owner has been active in the last 60 days';
  end if;

  update public.group_members set role = 'rep'
   where group_id = target_group and user_id = owner_id;
  update public.group_members set role = 'owner'
   where group_id = target_group and user_id = caller;
end $$;

revoke execute on function public.purge_states_on_leave() from public, anon;
revoke execute on function public.set_member_role(uuid, uuid, text) from public, anon;
grant  execute on function public.set_member_role(uuid, uuid, text) to authenticated;
revoke execute on function public.remove_classroom_member(uuid, uuid) from public, anon;
grant  execute on function public.remove_classroom_member(uuid, uuid) to authenticated;
revoke execute on function public.claim_classroom_ownership(uuid) from public, anon;
grant  execute on function public.claim_classroom_ownership(uuid) to authenticated;
