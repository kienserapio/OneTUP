# OneTUP — Real commute routes on the map

**Status:** plan only. Nothing in this document is built.
**Date:** August 2026
**Depends on:** [02-ARD.md](02-ARD.md) (ADR-010, ADR-011), [04-DATA-MODEL.md](04-DATA-MODEL.md), [11-HANDOVER.md](11-HANDOVER.md) §6

The map draws straight lines between real stops. This document is how it stops
doing that, and — more importantly — where the underlying route and fare data
actually comes from, because that is the part that decides whether any of it is
worth showing.

---

## 1. What is wrong now

`components/map/route-map.tsx` draws `commute_legs.geometry`, a GeoJSON
LineString, where one exists. Almost none do. The comment in
`api/commute/routes/route.ts` says it plainly:

> The hubs carry the only real coordinates in the graph: leg geometry is
> crowdsourced and mostly still absent.

So the map falls back to a straight line between `from_hub` and `to_hub`, and
the component sets `approximate` to say so. That is honest, and the handover is
right that it must stay honest:

> Do not replace those with generated paths — a straight line presented as a
> route is a wrong answer about a real city.

This plan does not soften that rule. It replaces the straight lines with paths
that are genuinely traced from data, and keeps saying which is which.

---

## 2. The two problems, which are not the same problem

| | What is missing | Where the answer is |
|---|---|---|
| **Walking and driving legs** | The path a person takes between two points | A routing engine over OpenStreetMap. Solved, free, current. |
| **Jeep, bus, UV Express, rail legs** | The path the *vehicle* takes along its franchise route | Not a routing problem. A jeepney does not take the shortest path — it takes its route. §4. |

Conflating these is the mistake that produces a plausible, wrong map: routing a
jeepney leg with a car router draws the fastest way between two stops, which is
not the way the jeepney goes, and it will look completely convincing.

---

## 3. Walk and drive legs — a routing engine

### 3.1 The choice

| Option | Free | Notes |
|---|---|---|
| **Valhalla**, FOSSGIS public server | Yes, fair use | Full planet, multimodal costing, `X-Client-Id` header requested for apps. Good for development. <https://valhalla.openstreetmap.de/> |
| **OpenRouteService** | Free key, quota'd | Walk/cycle/drive, well documented, quota is per-day. |
| **OSRM demo server** | Yes, no SLA | Car profile only. Explicitly not for production. |
| **Self-hosted Valhalla or OSRM** | Yes, one VPS | A Philippines OSM extract from Geofabrik is small. One-time build, then unlimited, no rate limit, no dependency on someone else's uptime. |

**Recommendation: develop against the FOSSGIS Valhalla server, ship against a
self-hosted one.** The Philippines extract is a few hundred megabytes; a
1–2 GB VPS runs it. This is a background job, not a request-path dependency, so
it may be slow and it may be down without a student noticing.

### 3.2 The rule that matters

**Geometry is computed once and stored, never fetched at request time.** Three
reasons, in order of weight:

1. `commute_legs` is in the offline set. A path that needs a network call is a
   path a student does not have in the corridor where they need it.
2. The route comparison screen loads a dozen legs at once. A dozen routing calls
   on a screen open is a rate limit waiting to be hit.
3. A leg's path does not change between requests. Fetching it per request is
   paying repeatedly for an answer that was already known.

So: a script, or an admin-triggered job, walks legs with `geometry is null`,
asks the engine, writes the LineString back. `route-map.tsx` needs no change at
all — it already draws `geometry` when it is there.

---

## 4. Transit legs — where the route data actually is

This is the section to read before spending money or time on anything.

### 4.1 The public GTFS feed is a decade old

The obvious answer is "import the Metro Manila GTFS feed". It is the wrong
answer, and it is worth writing down why so nobody rediscovers it:

- [`sakayph/gtfs`](https://github.com/sakayph/gtfs) — six commits, a modified
  copy of DOTC data released for the 2013 Philippine Transit App Challenge.
- The same feed in the [Mobility Database](https://mobilitydatabase.org/feeds/gtfs/mdb-1269)
  carries a service date range of **29 November 2013 – 29 May 2014** and is
  marked **deprecated**.

Metro Manila's routes have been through the PUV modernisation programme, a
pandemic, route consolidations and franchise reissues since then. A 2013 feed
will draw confident, wrong lines. Its `shapes.txt` is not usable as-is, and its
fares are not usable at all.

**Do not import fares from any GTFS feed.** `fare_rules` already holds LTFRB
matrices as rules rather than figures (ADR-011), which is both more correct and
more maintainable than anything a stale feed carries.

### 4.2 OpenStreetMap route relations are the live source

What *is* current is OSM. Metro Manila jeepney, UV Express and bus routes are
mapped as route relations by an active local community, tagged the way LTFRB
names them — `[endpoint] – [endpoint] via [roads]`:

- <https://wiki.openstreetmap.org/wiki/Metro_Manila/Jeepney_and_UV_Express_routes>
- <https://wiki.openstreetmap.org/wiki/Metro_Manila/Bus_routes>
- <https://wiki.openstreetmap.org/wiki/Philippines/Public_transport/PTNA/PH-00-Metro_Manila-Routes>

A route relation contains the ordered ways the vehicle actually travels. Joined
end to end, that *is* the LineString this feature wants — and unlike a routing
engine's answer, it is the real path rather than a plausible one.

Coverage is uneven. Some routes are complete, some are partial, some are
missing. That is fine, because the app already has a state for it: a leg with no
geometry renders as a dashed straight line and says it is approximate.

### 4.3 Getting it

Overpass, once, per corridor — not at request time:

```
[out:json];
relation
  ["type"="route"]
  ["route"~"^(bus|share_taxi|minibus|train|subway)$"]
  (14.35,120.90,14.78,121.15);   // Metro Manila bounding box
out geom;
```

Then, per leg: pick the relation whose name matches the leg's corridor, clip the
geometry to the segment between `from_hub` and `to_hub` (nearest point on the
line to each), and store that. Clipping is the fiddly part and is where
`@turf/nearest-point-on-line` and `@turf/line-slice` earn their place.

**This is a human-in-the-loop job, not an automatic one.** Matching a leg to a
relation by name is a guess; a person confirming the guess is what makes it
data. `route_verifications` already exists for exactly this kind of
confirmation, and `commute_legs.status` already has `pending`.

---

## 5. Schema

One column, one enum-shaped check:

```sql
-- 0xx_leg_geometry_source.sql
alter table public.commute_legs
  add column geometry_source text
    check (geometry_source in ('traced','osm_relation','routed'));

comment on column public.commute_legs.geometry_source is
  'Where the path came from. traced = a student walked it. osm_relation = '
  'clipped from an OpenStreetMap route relation. routed = a routing engine '
  'over OSM, valid for walk and drive legs and for nothing else. Null with a '
  'geometry is a path of unknown provenance and should be treated as absent.';
```

The map reads it to decide what to say. A `routed` walk leg is a real path. An
`osm_relation` jeep leg is a real path. Anything else is a straight line, and
the existing `approximate` state already handles that honestly.

No other schema change. `geometry` is already `jsonb`, already offline, already
rendered.

---

## 6. What this does not become

**Not a general trip planner.** ADR-010 is still right: TUP is always one
endpoint, which collapses routing into hub-and-spoke lookup. Nothing here
replaces the curated `commute_routes` graph with a solver.

OpenTripPlanner 2 would give true multimodal itineraries, and it is the obvious
"do it properly" answer — but it needs a current GTFS feed, which §4.1 says does
not exist for Metro Manila, and it wants [several gigabytes of
heap](https://docs.opentripplanner.org/en/latest/System-Requirements/) plus a
JVM host. Building a GTFS feed for TUP's corridors out of OSM relations, and
*then* running OTP2, is a real option — but it is a second project, and the
curated graph is more accurate for the ten corridors students actually use.

---

## 7. Fares — the data you actually have to find

Geometry is a solved problem with a known source. Fares are not, and this is
where a person has to do the work.

`fare_rules` already models fares correctly: a base figure plus a rule, with the
student discount computed at display time so a student can see when a discount
is being denied to them at the door. What it needs is **current values**, which
come from:

| What | Source | Shape it goes in |
|---|---|---|
| Jeep and bus minimum fare, and the per-km increment | LTFRB fare matrix orders, published as memorandum circulars | `fare_rules.matrix`, plus `commute_legs.base_fare` per leg |
| Student discount | LTFRB — 20% on PUVs | `fare_rules` `puv_student_20`, already seeded |
| LRT-1, LRT-2, MRT-3 | The operators' own station-to-station matrices | `fare_rules.matrix` keyed by station pair, `rail_matrix` code already exists |
| P2P and premium bus | Operator, per route | Per-leg `base_fare`, `flat` rule |

Two things to get right when you collect these:

1. **Record the circular number and its date** in `fare_rules.notes`. A fare
   with no provenance cannot be checked when someone says it is wrong, and PUV
   fares move.
2. **Per leg, not per route.** A leg is shared across routes by design, so one
   fare edit reaches every route using it. Entering fares route-by-route
   undoes that and guarantees drift.

`route_verifications` is the maintenance path: a student who just rode a leg
confirms or flags it in one tap, and `last_verified_at` is what tells you which
figures have gone quiet.

---

## 8. Libraries

| Need | Package | Why |
|---|---|---|
| Decode an engine's encoded polyline | `@mapbox/polyline` | Valhalla and OSRM both return encoded polylines by default |
| Clip a relation's line to a leg | `@turf/nearest-point-on-line`, `@turf/line-slice` | Import per function; `@turf/turf` pulls in the whole library |
| Simplify before storing | `@turf/simplify` | A full relation is thousands of points; the map needs tens |
| Length and sanity checks | `@turf/length` | A clipped segment far longer than the leg's duration implies is a bad match |

Leaflet stays. It is already lazy-loaded for NFR-P6 and it draws a dozen
polylines without complaint. MapLibre GL and vector tiles become worth the
weight only if the map ever draws hundreds of routes at once, which this plan
does not do.

---

## 9. Build order

Each phase is useful alone, and the first one is a weekend.

### Phase 1 — Walk legs (~2 days)

- [ ] `geometry_source` column and its comment
- [ ] A script: for every `walk` leg with null geometry, ask Valhalla, simplify,
      store with `geometry_source = 'routed'`
- [ ] Nothing in the app changes; the map picks the paths up on the next sync

### Phase 2 — One corridor of transit legs (~3 days)

- [ ] Overpass query for the corridor, cached to a file
- [ ] A matching script that proposes leg → relation pairs for a person to
      confirm, clips, simplifies, stores with `geometry_source = 'osm_relation'`
- [ ] Confirm the drawn path against a student who rides it

### Phase 3 — The rest of the corridors (~1 week, mostly not code)

- [ ] Repeat Phase 2 per corridor
- [ ] `last_verified_at` surfaced in the commute screen, so a stale leg looks
      stale rather than looking like every other leg

### Phase 4 — Fares (~ongoing, and the real work)

- [ ] Current LTFRB matrix into `fare_rules`, with the circular number in `notes`
- [ ] Rail matrices per operator
- [ ] Per-leg `base_fare` review against a real ride
- [ ] A staleness gate: `10-FUTURE-ENHANCEMENTS.md` §7 already says no
      autonomous departure change from a route older than 30 days. The same
      figure should mark a fare as unverified in the UI.

---

## 10. Things that will bite

- **A routed jeepney leg.** The single most likely mistake in this plan. Guard
  it in the script: `mode` must be `walk`, `taxi`, `tnvs` or `tricycle` before a
  routing engine is allowed to answer.
- **The 2013 GTFS feed.** It is the first search result for "Metro Manila GTFS"
  and it looks authoritative. §4.1.
- **A clipped segment that ran the wrong way.** A route relation has direction;
  clipping between two hubs in the wrong order returns the complement of the
  path. Check the length against `duration_minutes` before storing.
- **Fares entered per route.** §7.
- **A path that is real but stale.** OSM relations are edited; a stored clip is
  a snapshot. Re-run the match once a term rather than trusting it forever.
- **Calling the routing engine from the browser.** It would work, and it would
  break the offline promise and leak every student's origin area to a third
  party. It belongs in a job.
