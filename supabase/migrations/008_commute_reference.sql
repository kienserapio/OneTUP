-- 008 — Commute graph.
--
-- TUP is always one endpoint, which collapses general routing into hub-and-spoke
-- lookup (ADR-010). Legs are the atomic unit and are shared across routes, so a
-- fare change on "LRT-1 Monumento to Central Terminal" is one edit that reaches
-- every route using it.
--
-- Fares are stored as a base figure plus a rule reference, never as two numbers
-- (ADR-011). The student fare is computed at display time.

create table public.commute_areas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  city       text,
  lat        double precision,
  lng        double precision,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.commute_hubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  kind       text check (kind in ('rail_station','terminal','landmark','campus_gate')),
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now()
);

create table public.fare_rules (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,    -- 'puv_student_20','rail_matrix','flat','free'
  label        text not null,
  discount_pct numeric(5,2),
  matrix       jsonb,
  rounding     text not null default 'none'
               check (rounding in ('none','nearest_peso','up_quarter')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create type public.transport_mode as enum
  ('walk','jeep','bus','uv_express','rail','tricycle','taxi','tnvs');

create table public.commute_legs (
  id                   uuid primary key default gen_random_uuid(),
  mode                 public.transport_mode not null,
  corridor             text,                       -- matched against peak_bands
  from_hub_id          uuid references public.commute_hubs(id) on delete set null,
  to_hub_id            uuid references public.commute_hubs(id) on delete set null,
  from_label           text not null,
  to_label             text not null,
  base_fare            numeric(8,2) not null default 0 check (base_fare >= 0),
  fare_rule_code       text references public.fare_rules(code),
  duration_minutes     smallint not null check (duration_minutes > 0),
  peak_penalty_minutes smallint not null default 0,
  geometry             jsonb,                      -- GeoJSON LineString
  notes                text,
  status               text not null default 'approved'
                       check (status in ('pending','approved','flagged','retired')),
  submitted_by         uuid references auth.users(id) on delete set null,
  verified_count       integer not null default 0,
  last_verified_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.commute_routes (
  id               uuid primary key default gen_random_uuid(),
  area_id          uuid not null references public.commute_areas(id) on delete cascade,
  label            text,
  direction        text not null default 'inbound' check (direction in ('inbound','outbound')),
  status           text not null default 'approved'
                   check (status in ('pending','approved','flagged','retired')),
  submitted_by     uuid references auth.users(id) on delete set null,
  verified_count   integer not null default 0,
  last_verified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.route_legs (
  route_id uuid not null references public.commute_routes(id) on delete cascade,
  leg_id   uuid not null references public.commute_legs(id) on delete cascade,
  ordinal  smallint not null,
  primary key (route_id, ordinal)
);

create table public.peak_bands (
  id              uuid primary key default gen_random_uuid(),
  corridor        text not null,
  days            public.weekday[] not null,
  start_time      time not null,
  end_time        time not null,
  penalty_minutes smallint not null check (penalty_minutes >= 0),
  severity        text not null default 'moderate'
                  check (severity in ('light','moderate','heavy')),
  created_at      timestamptz not null default now()
);

-- One-tap verification. Confirming a route you just rode is what keeps the
-- crowdsourced data from going stale unnoticed.
create table public.route_verifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  route_id   uuid references public.commute_routes(id) on delete cascade,
  leg_id     uuid references public.commute_legs(id) on delete cascade,
  kind       text not null default 'confirm' check (kind in ('confirm','flag')),
  note       text,
  created_at timestamptz not null default now(),
  check (route_id is not null or leg_id is not null)
);

alter table public.commute_areas       enable row level security;
alter table public.commute_hubs        enable row level security;
alter table public.fare_rules          enable row level security;
alter table public.commute_legs        enable row level security;
alter table public.commute_routes      enable row level security;
alter table public.route_legs          enable row level security;
alter table public.peak_bands          enable row level security;
alter table public.route_verifications enable row level security;

-- Approved data is world-readable, including to signed-out visitors. Pending
-- contributions are visible only to whoever submitted them.
create policy legs_read on public.commute_legs for select
  using (status = 'approved' or submitted_by = (select auth.uid()));
create policy routes_read on public.commute_routes for select
  using (status = 'approved' or submitted_by = (select auth.uid()));

create policy legs_submit on public.commute_legs for insert to authenticated
  with check (submitted_by = (select auth.uid()) and status = 'pending');
create policy routes_submit on public.commute_routes for insert to authenticated
  with check (submitted_by = (select auth.uid()) and status = 'pending');

create policy legs_edit_own_pending on public.commute_legs for update to authenticated
  using (submitted_by = (select auth.uid()) and status = 'pending')
  with check (submitted_by = (select auth.uid()) and status = 'pending');

create policy areas_read on public.commute_areas for select using (true);
create policy hubs_read  on public.commute_hubs  for select using (true);
create policy rlegs_read on public.route_legs    for select using (true);
create policy fares_read on public.fare_rules    for select using (true);
create policy peaks_read on public.peak_bands    for select using (true);

create policy rlegs_submit on public.route_legs for insert to authenticated
  with check (exists (
    select 1 from public.commute_routes r
    where r.id = route_legs.route_id and r.submitted_by = (select auth.uid())
  ));

create policy verifications_read_own on public.route_verifications for select
  using ((select auth.uid()) = user_id);
create policy verifications_insert on public.route_verifications for insert to authenticated
  with check ((select auth.uid()) = user_id);

create index idx_legs_status on public.commute_legs (status);
create index idx_routes_area on public.commute_routes (area_id, direction) where status = 'approved';
create index idx_peak_corridor on public.peak_bands (corridor);

select public.attach_updated_at('public.fare_rules');
select public.attach_updated_at('public.commute_legs');
select public.attach_updated_at('public.commute_routes');

-- Preferences were created before these tables existed; wire them up now.
alter table public.user_preferences
  add constraint user_preferences_home_area_fk
    foreign key (home_area_id) references public.commute_areas(id) on delete set null,
  add constraint user_preferences_default_route_fk
    foreign key (default_route_id) references public.commute_routes(id) on delete set null;
