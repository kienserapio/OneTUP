-- 009 — Departure plans.
--
-- `adjustments` records each applied adjustment as {kind, minutes, reason}, and
-- `explanation` is templated from that list on the server. Keeping both means
-- the in-app copy and the notification copy cannot drift apart, and a student
-- can always see exactly why their alarm moved.

create table public.departure_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  plan_date       date not null,
  first_block_id  uuid references public.schedule_blocks(id) on delete cascade,
  route_id        uuid references public.commute_routes(id) on delete set null,
  class_start     timestamptz not null,
  arrive_by       timestamptz not null,
  leave_at        timestamptz not null,
  wake_at         timestamptz not null,
  base_minutes    smallint not null,
  peak_minutes    smallint not null default 0,
  weather_minutes smallint not null default 0,
  explanation     text,
  adjustments     jsonb not null default '[]'::jsonb,
  computed_at     timestamptz not null default now(),
  unique (user_id, plan_date)
);

alter table public.departure_plans enable row level security;
create policy plans_all_own on public.departure_plans
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index idx_plans_user_date on public.departure_plans (user_id, plan_date desc);
