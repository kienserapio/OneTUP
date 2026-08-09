-- 010 — Campus places.
--
-- The one user-facing table readable with no account at all. Campus data is
-- non-personal, and the highest-anxiety moment in a student's year is arriving
-- somewhere they have never been — which happens before they would ever have
-- signed up for anything (ADR-012).

create type public.place_category as enum
  ('building','gate','printing','food','study','service','landmark');

create table public.campus_places (
  id               uuid primary key default gen_random_uuid(),
  campus           text not null default 'manila',
  category         public.place_category not null,
  name             text not null,
  description      text,
  lat              double precision not null,
  lng              double precision not null,
  building_code    text,
  floor            text,
  room_range_start text,
  room_range_end   text,
  hours            jsonb,
  price_min        numeric(8,2),
  price_max        numeric(8,2),
  price_unit       text,
  contact_phone    text,
  is_emergency     boolean not null default false,
  tour_scene_url   text,
  status           text not null default 'approved'
                   check (status in ('pending','approved','flagged','retired')),
  submitted_by     uuid references auth.users(id) on delete set null,
  verified_count   integer not null default 0,
  last_verified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.campus_places enable row level security;

-- Anonymous read is intentional and is the only place it appears in this schema.
create policy places_read_public on public.campus_places
  for select using (status = 'approved');
create policy places_read_own_pending on public.campus_places
  for select to authenticated using (submitted_by = (select auth.uid()));
create policy places_submit on public.campus_places
  for insert to authenticated
  with check (submitted_by = (select auth.uid()) and status = 'pending');

create index idx_places_category on public.campus_places (campus, category)
  where status = 'approved';
create index idx_places_rooms on public.campus_places (room_range_start, room_range_end)
  where status = 'approved';

select public.attach_updated_at('public.campus_places');


create table public.place_corrections (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references public.campus_places(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  field      text not null,
  proposed   text not null,
  note       text,
  status     text not null default 'open' check (status in ('open','applied','rejected')),
  created_at timestamptz not null default now()
);

alter table public.place_corrections enable row level security;
create policy corrections_insert on public.place_corrections
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy corrections_read_own on public.place_corrections
  for select using (user_id = (select auth.uid()));
