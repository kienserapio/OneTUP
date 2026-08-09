-- 012 — Groups.
--
-- Membership grants visibility of shared deadlines and, with per-student
-- consent, free-block availability. It never grants visibility of grades or
-- attendance — there is no policy anywhere that would allow it.

create table public.groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  course_id      uuid references public.courses(id) on delete set null,
  created_by     uuid not null references auth.users(id) on delete cascade,
  invite_code    text unique not null default encode(gen_random_bytes(6), 'hex'),
  created_at     timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  shares_availability boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

-- A security-definer helper avoids the infinite recursion that a policy on
-- group_members querying group_members would otherwise cause.
create or replace function public.is_group_member(target_group uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = target_group and m.user_id = (select auth.uid())
  );
$$;

create policy groups_read on public.groups
  for select using (public.is_group_member(id) or created_by = (select auth.uid()));
create policy groups_create on public.groups
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy groups_update_owner on public.groups
  for update using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy members_read on public.group_members
  for select using (public.is_group_member(group_id));
create policy members_join on public.group_members
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy members_leave on public.group_members
  for delete using (user_id = (select auth.uid()));
create policy members_update_own on public.group_members
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index idx_group_members_user on public.group_members (user_id);

-- Deadlines were created before groups existed; wire up the reference now.
alter table public.deadlines
  add constraint deadlines_group_fk
    foreign key (group_id) references public.groups(id) on delete set null;
