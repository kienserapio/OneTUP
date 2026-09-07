#!/usr/bin/env node
/**
 * Fills in the drawn path for walk legs that have none.
 *
 * `route-map.tsx` draws `commute_legs.geometry` when it is there and a dashed
 * straight line when it is not. The dashed line is honest — nobody has traced
 * this — but a walk between two known points is the one leg where the road
 * network *is* the answer, and a router knows it exactly. Transit corridors are
 * a different problem and are deliberately out of scope: a jeepney route is a
 * social fact, not a shortest path, and asking a router for one produces a
 * confident wrong line.
 *
 * **Geometry is computed once and stored, never fetched at request time.**
 * `commute_legs` is in the offline set, the comparison screen loads a dozen
 * legs at once, and a leg's path does not change between requests
 * (13-COMMUTE-ROUTING-PLAN.md §3.2). So this is a one-off maintenance pass, not
 * a service — which is why it needs no hosting and can politely use the FOSSGIS
 * public server.
 *
 * **The rule the whole thing turns on: an implausible path is discarded, not
 * stored.** A dashed line says "nobody knows"; a wrong line says "this is the
 * way" and is indistinguishable from a right one on a map. Every result is
 * checked against the crow-flies distance and against the leg's own stated
 * duration, and anything that fails is left null.
 *
 *   node scripts/route-walk-legs.mjs            # apply
 *   node scripts/route-walk-legs.mjs --dry-run  # report, write nothing
 *   node scripts/route-walk-legs.mjs --probe    # no database; check the pipeline
 *   node scripts/route-walk-legs.mjs --redo     # also re-route existing 'routed' legs
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import polyline from '@mapbox/polyline'
import simplify from '@turf/simplify'
import turfLength from '@turf/length'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The FOSSGIS public Valhalla instance. `valhalla.openstreetmap.de` answers 405
 * to a POST; the numbered host is the one that routes.
 *
 * It is a volunteer-run service. The client id, the courtesy delay between
 * requests and the small batch size are the price of using it, and they are not
 * optional.
 */
const VALHALLA = 'https://valhalla1.openstreetmap.de/route'
const CLIENT_ID = 'OneTUP'
const DELAY_MS = 1200

/** Valhalla returns polyline6, not the polyline5 most decoders assume. */
const POLYLINE_PRECISION = 6

/** Metres of deviation tolerated when thinning the path. About a lane width —
 *  invisible at the zoom a phone draws this at, and it removes most of the
 *  vertices a router emits for a gentle curve. */
const SIMPLIFY_TOLERANCE_DEG = 0.00003

/** An ordinary walking pace. Only used to sanity-check, never to compute. */
const WALK_KMH = 4.8

/**
 * The duration check is the one that does the work, because it compares the
 * routed path against a figure a person timed on foot. If a student says the
 * walk is thirty minutes and the router returns 2.2 km, those agree, and no
 * amount of geometry is going to say otherwise.
 */
const MAX_DURATION_RATIO = 2.5
const MIN_DURATION_RATIO = 0.25

/**
 * The detour ratio is a much blunter instrument and is deliberately set loose.
 *
 * The obvious value is 2 or 3, and it is wrong here. The first pair this script
 * was tested on — Ayala Bridge to TUP Manila, 579 m apart in a straight line —
 * routes 2.2 km, a ratio of 3.8, because the Pasig River is between them and
 * the only crossing is a bridge. That is a *correct* path. Manila is full of
 * them: rivers, walled campuses, gated subdivisions, esteros with one crossing
 * a kilometre away.
 *
 * So this is not a plausibility check. It is a "did somebody put a hub
 * coordinate in the wrong city" check, and 6 is comfortably above every
 * legitimate detour while still catching a path that has gone somewhere else
 * entirely.
 */
const MAX_DETOUR_RATIO = 6

/** Below this, the two hubs are effectively the same place and every ratio
 *  above becomes meaningless noise. */
const MIN_CROW_KM = 0.05

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const PROBE = args.has('--probe')
const REDO = args.has('--redo')

// --- Environment ----------------------------------------------------------

function loadEnv() {
  const env = {}
  try {
    for (const line of readFileSync(resolve(root, '.env'), 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      env[t.slice(0, eq).trim()] = t
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
    }
  } catch {
    /* --probe needs no environment at all. */
  }
  return env
}

const env = loadEnv()

// --- Valhalla -------------------------------------------------------------

/**
 * One pedestrian route. Returns the decoded coordinates and Valhalla's own
 * distance, or null when it cannot route between the two points — which is a
 * real answer, not an error: some hub pairs genuinely have no walking path.
 */
async function routeWalk(from, to) {
  const response = await fetch(VALHALLA, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': CLIENT_ID,
      'User-Agent': `${CLIENT_ID} (github.com/kienserapio/OneTUP)`,
    },
    body: JSON.stringify({
      locations: [
        { lat: from.lat, lon: from.lng },
        { lat: to.lat, lon: to.lng },
      ],
      costing: 'pedestrian',
      directions_options: { units: 'kilometers' },
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) throw new Error(`Valhalla HTTP ${response.status}`)
  const body = await response.json()
  const shape = body?.trip?.legs?.[0]?.shape
  if (!shape) return null

  /* `polyline.decode` yields [lat, lng]; GeoJSON wants [lng, lat]. Getting this
   * backwards puts every path in the Indian Ocean, which is at least obvious. */
  const coordinates = polyline
    .decode(shape, POLYLINE_PRECISION)
    .map(([lat, lng]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))])

  return { coordinates, valhallaKm: Number(body.trip.summary.length) }
}

// --- Geometry -------------------------------------------------------------

function lineString(coordinates) {
  return { type: 'LineString', coordinates }
}

function thin(coordinates) {
  if (coordinates.length < 4) return coordinates
  const simplified = simplify(
    { type: 'Feature', properties: {}, geometry: lineString(coordinates) },
    { tolerance: SIMPLIFY_TOLERANCE_DEG, highQuality: true, mutate: true },
  )
  return simplified.geometry.coordinates
}

function kilometresOf(coordinates) {
  return turfLength({ type: 'Feature', properties: {}, geometry: lineString(coordinates) }, {
    units: 'kilometers',
  })
}

function crowKilometres(from, to) {
  return kilometresOf([
    [from.lng, from.lat],
    [to.lng, to.lat],
  ])
}

/**
 * Whether a routed path is believable enough to store.
 *
 * Returns a reason string when it is not, so the run can say *why* a leg was
 * left alone rather than only that it was.
 */
export function rejectionReason({ routedKm, crowKm, durationMinutes }) {
  if (!Number.isFinite(routedKm) || routedKm <= 0) return 'routed length is zero'

  if (crowKm >= MIN_CROW_KM) {
    const detour = routedKm / crowKm
    if (detour > MAX_DETOUR_RATIO) {
      return `path is ${detour.toFixed(1)}× the straight line (limit ${MAX_DETOUR_RATIO})`
    }
  }

  if (durationMinutes > 0) {
    const impliedKm = (durationMinutes * WALK_KMH) / 60
    const ratio = routedKm / impliedKm
    if (ratio > MAX_DURATION_RATIO) {
      return `${routedKm.toFixed(2)}km is ${ratio.toFixed(1)}× the ${durationMinutes}-minute walk on file`
    }
    if (ratio < MIN_DURATION_RATIO) {
      return `${routedKm.toFixed(2)}km is only ${ratio.toFixed(2)}× the ${durationMinutes}-minute walk on file`
    }
  }

  return null
}

// --- Supabase (PostgREST over fetch — no client library needed) -----------

function restHeaders() {
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!env.SUPABASE_URL || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.')
    console.error('Nothing else here needs them — try --probe to check the routing pipeline.')
    process.exit(1)
  }
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function rest(path, init = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders(), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`)
  }
  return response.status === 204 ? null : response.json()
}

// --- The pass -------------------------------------------------------------

async function probe() {
  console.log('Probe: routing a known pair, no database touched.\n')

  // Two points either side of TUP Manila, far enough apart to have a real path.
  const from = { lat: 14.5878, lng: 120.9896, name: 'Ayala Bridge' }
  const to = { lat: 14.5905, lng: 120.9942, name: 'TUP Manila' }

  const routed = await routeWalk(from, to)
  if (!routed) {
    console.error('No route returned. The pipeline cannot be verified.')
    process.exit(1)
  }

  const thinned = thin(routed.coordinates)
  const routedKm = kilometresOf(thinned)
  const crowKm = crowKilometres(from, to)

  console.log(`  ${from.name} → ${to.name}`)
  console.log(`  points        ${routed.coordinates.length} → ${thinned.length} after simplify`)
  console.log(`  Valhalla      ${routed.valhallaKm.toFixed(3)} km`)
  console.log(`  measured      ${routedKm.toFixed(3)} km  (should match Valhalla closely)`)
  console.log(`  straight line ${crowKm.toFixed(3)} km  (detour ${(routedKm / crowKm).toFixed(2)}×)`)
  console.log(`  first point   ${JSON.stringify(thinned[0])}   [lng, lat] — Manila is ~[120.99, 14.59]`)

  console.log('\n  The judgement, against three different stated durations:')
  for (const minutes of [30, 5, 240]) {
    const reason = rejectionReason({ routedKm, crowKm, durationMinutes: minutes })
    console.log(`    ${String(minutes).padStart(3)} min on file → ${reason ?? 'ACCEPTED'}`)
  }

  console.log('\n  And against a coordinate in the wrong place entirely:')
  const wrong = rejectionReason({ routedKm: 40, crowKm: 0.6, durationMinutes: 30 })
  console.log(`    40km path over a 600m gap → ${wrong ?? 'ACCEPTED (this is a bug)'}`)

  const drift = Math.abs(routedKm - routed.valhallaKm)
  if (drift > 0.15) {
    console.error(`\nMeasured length is ${drift.toFixed(3)} km off Valhalla's own. Decode is wrong.`)
    process.exit(1)
  }
  console.log('\nPipeline is sound: route, decode, simplify, measure, judge.')
}

async function run() {
  const hubs = await rest('commute_hubs?select=id,name,lat,lng')
  const byHub = new Map(hubs.map((hub) => [hub.id, hub]))

  const filter = REDO ? 'geometry_source=in.(routed)' : 'geometry=is.null'
  const legs = await rest(
    `commute_legs?select=id,from_label,to_label,duration_minutes,from_hub_id,to_hub_id&mode=eq.walk&${filter}`,
  )

  console.log(`${legs.length} walk leg(s) to consider.${DRY_RUN ? ' Dry run — nothing will be written.' : ''}\n`)

  let written = 0
  let skipped = 0
  let rejected = 0

  for (const leg of legs) {
    const label = `${leg.from_label} → ${leg.to_label}`
    const from = byHub.get(leg.from_hub_id)
    const to = byHub.get(leg.to_hub_id)

    /* A leg with no hubs on both ends has no coordinates to route between.
     * That is a data gap, not a failure, and the dashed line is correct. */
    if (!from || !to) {
      console.log(`  skip    ${label} — ${!from ? 'no start hub' : 'no end hub'}`)
      skipped += 1
      continue
    }

    try {
      const routed = await routeWalk(from, to)
      if (!routed) {
        console.log(`  skip    ${label} — no walking route between those points`)
        skipped += 1
        continue
      }

      const coordinates = thin(routed.coordinates)
      const routedKm = kilometresOf(coordinates)
      const crowKm = crowKilometres(from, to)
      const reason = rejectionReason({
        routedKm,
        crowKm,
        durationMinutes: leg.duration_minutes ?? 0,
      })

      if (reason) {
        /* Left null on purpose. A dashed line is honest; a wrong line is not,
         * and on a map the two look identical. */
        console.log(`  reject  ${label} — ${reason}`)
        rejected += 1
        continue
      }

      if (!DRY_RUN) {
        await rest(`commute_legs?id=eq.${leg.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            geometry: lineString(coordinates),
            geometry_source: 'routed',
          }),
        })
      }

      console.log(`  ok      ${label} — ${routedKm.toFixed(2)}km, ${coordinates.length} points`)
      written += 1
    } catch (error) {
      console.log(`  error   ${label} — ${error.message}`)
      skipped += 1
    }

    await new Promise((done) => setTimeout(done, DELAY_MS))
  }

  console.log(
    `\n${written} written, ${rejected} rejected as implausible, ${skipped} skipped.` +
      (rejected > 0 ? '\nRejected legs keep their dashed line, which is the correct rendering.' : ''),
  )
}

/* Only when run directly. `rejectionReason` is imported by the tests, and an
 * import that starts routing every leg in the database would be a memorable
 * way to find that out. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await (PROBE ? probe() : run())
}
