-- 037 — Where a leg's drawn path came from.
--
-- `commute_legs.geometry` has been a nullable GeoJSON LineString since 008, and
-- `route-map.tsx` has always drawn it when present and a dashed straight line
-- when it is not. What was never recorded is *where a present geometry came
-- from* — and that turns out to matter more than it sounds.
--
-- A path traced by a student who rides the route every day and a path computed
-- by a router are different kinds of claim. The first can be wrong about the
-- road and right about the journey (a jeepney that cuts through a village the
-- router will not route through); the second is right about the road and knows
-- nothing about the journey. Without this column the two are indistinguishable
-- on a map, and there is no way to re-run a routing pass over exactly the legs
-- a script filled in without overwriting somebody's hand-traced line.
--
-- 13-COMMUTE-ROUTING-PLAN.md §9 Phase 1.

alter table public.commute_legs
  add column if not exists geometry_source text
    check (geometry_source in ('routed', 'osm_relation', 'manual'));

comment on column public.commute_legs.geometry_source is
  'How this leg''s geometry was produced. routed: computed by a routing engine '
  'from the two hub coordinates — accurate about the road network, and only '
  'ever written for walk legs, where the road network is the whole answer. '
  'osm_relation: traced from an OpenStreetMap route relation. manual: drawn or '
  'corrected by a person. Null with a geometry present means it predates this '
  'column; null with no geometry means the map draws a dashed straight line, '
  'which is the honest rendering of "nobody has traced this yet".';

-- Finding the legs a routing pass should look at. The pass is rare, but it
-- scans the whole table when it runs and this keeps it from doing so blindly.
create index if not exists idx_legs_geometry_source
  on public.commute_legs (mode, geometry_source);
