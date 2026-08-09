-- 007 — Deadlines and subtasks.
--
-- Urgency is deliberately absent from this schema: it is recomputed on render,
-- because a stored urgency is wrong the moment the clock moves.

create type public.deadline_status as enum ('open','done','dismissed');

create table public.deadlines (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  enrollment_id    uuid references public.enrollments(id) on delete set null,
  -- Foreign key added in 012, once groups exist.
  group_id         uuid,
  title            text not null,
  notes            text,
  due_at           timestamptz not null,
  status           public.deadline_status not null default 'open',
  source           text not null default 'manual'
                   check (source in ('manual','announcement','photo','assistant','group')),
  -- Points at whatever produced this deadline, so it can always show where it
  -- came from — the receipt behind an automatically created item.
  source_ref       uuid,
  reminder_offsets integer[] not null default '{259200,86400,21600}',   -- 72h, 24h, 6h
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.deadlines enable row level security;
create policy deadlines_all_own on public.deadlines
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_deadlines_user_due on public.deadlines (user_id, due_at) where status = 'open';
create index idx_deadlines_enrollment on public.deadlines (enrollment_id);

select public.attach_updated_at('public.deadlines');


create table public.deadline_subtasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  deadline_id uuid not null references public.deadlines(id) on delete cascade,
  title       text not null,
  due_at      timestamptz,
  is_done     boolean not null default false,
  ordinal     smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.deadline_subtasks enable row level security;
create policy subtasks_all_own on public.deadline_subtasks
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_subtasks_deadline on public.deadline_subtasks (deadline_id, ordinal);

select public.attach_updated_at('public.deadline_subtasks');


-- Scheduled reminders. Kept server-side as well as client-side because Web Push
-- has to be dispatched by something that is awake when the student's app is not.
create table public.scheduled_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  entity      text not null,
  entity_id   uuid,
  fire_at     timestamptz not null,
  payload     jsonb not null default '{}'::jsonb,
  sent_at     timestamptz,
  cancelled_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, entity_id, fire_at)
);

alter table public.scheduled_notifications enable row level security;
create policy scheduled_notifications_all_own on public.scheduled_notifications
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_scheduled_pending on public.scheduled_notifications (fire_at)
  where sent_at is null and cancelled_at is null;
