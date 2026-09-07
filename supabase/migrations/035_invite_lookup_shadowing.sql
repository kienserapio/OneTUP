-- 035 — The invite lookup was comparing the wrong two things.
--
-- `classroom_by_invite(code text)` is a SQL-language function, and in one of
-- those a parameter name is shadowed by any column of the same name that is in
-- scope. The query joins `public.terms`, which has a `code` column, so
--
--     where g.invite_code = code
--
-- silently became `where g.invite_code = t.code` — an invite code compared
-- against a term code. No error, no warning, and every invite link resolved to
-- nothing.
--
-- Renaming the parameter fixes it and, more usefully, removes the trap: there
-- is no `invite` column anywhere in the schema. The old signature is dropped
-- rather than left beside the new one, so nothing can call the broken shape.

drop function if exists public.classroom_by_invite(text);

create or replace function public.classroom_by_invite(invite text)
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
   where g.invite_code = classroom_by_invite.invite
     and g.kind = 'classroom';
$$;

revoke execute on function public.classroom_by_invite(text) from public, anon;
grant  execute on function public.classroom_by_invite(text) to authenticated;
