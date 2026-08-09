import { createClient } from '@supabase/supabase-js'
import type { Database } from '@onetup/core'
import { publicRoute } from '@/lib/api/handler'
import { errors } from '@/lib/api/errors'

/**
 * `GET /api/campus/rooms/:number` — which building is room 312 in?
 *
 * The answer is a guess of known strength, never a flat assertion. A room that
 * falls inside a range a student actually recorded is a different claim from a
 * room that merely shares a leading digit with one, and the client is told
 * which it got so it can present it accordingly (API spec §4.7).
 */

type Confidence = 'exact' | 'range_match' | 'prefix_guess'

const PLACE_COLUMNS =
  'id, category, name, lat, lng, building_code, floor, room_range_start, room_range_end'

type Place = {
  id: string
  category: string
  name: string
  lat: number
  lng: number
  building_code: string | null
  floor: string | null
  room_range_start: string | null
  room_range_end: string | null
}

function anonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** Integer-or-nothing. `'3A'` is not 3, and treating it as 3 is how a student
 * ends up on the wrong floor. */
function asInteger(value: string | null | undefined): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function sharedPrefixLength(a: string, b: string): number {
  let index = 0
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1
  return index
}

function findMatch(room: string, places: Place[]): { place: Place; confidence: Confidence } | null {
  const target = room.trim().toUpperCase()
  if (!target) return null

  // 1. The room number is itself an endpoint of a recorded range, or the whole
  //    query is a building code.
  const exact = places.find(
    (place) =>
      place.room_range_start?.trim().toUpperCase() === target ||
      place.room_range_end?.trim().toUpperCase() === target ||
      place.building_code?.trim().toUpperCase() === target,
  )
  if (exact) return { place: exact, confidence: 'exact' }

  // 2. Numeric containment, only where every side genuinely parses as an integer.
  const targetNumber = asInteger(target)
  if (targetNumber !== null) {
    const contained = places.find((place) => {
      const start = asInteger(place.room_range_start)
      const end = asInteger(place.room_range_end)
      if (start === null || end === null) return false
      const low = Math.min(start, end)
      const high = Math.max(start, end)
      return targetNumber >= low && targetNumber <= high
    })
    if (contained) return { place: contained, confidence: 'range_match' }
  }

  // 3. A guess. Longest shared leading run wins — a building code the room
  //    number starts with beats a single shared digit.
  let best: { place: Place; score: number } | null = null
  for (const place of places) {
    const candidates = [place.building_code, place.room_range_start, place.room_range_end]
    for (const candidate of candidates) {
      if (!candidate) continue
      const score = sharedPrefixLength(target, candidate.trim().toUpperCase())
      if (score > 0 && (!best || score > best.score)) best = { place, score }
    }
  }
  return best ? { place: best.place, confidence: 'prefix_guess' } : null
}

/** Metres between two campus points. Flat-earth is fine over 300 metres. */
function metresBetween(a: Place, b: Place): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng) * Math.cos(toRad((a.lat + b.lat) / 2))
  return Math.hypot(dLat, dLng) * R
}

/** A relaxed campus walking pace, rounded up — nobody is ever annoyed by
 * arriving a minute early. */
function walkMinutes(metres: number): number {
  return Math.max(1, Math.round(metres / 75))
}

export async function GET(
  request: Request,
  context: { params: Promise<{ number: string }> },
): Promise<Response> {
  const { number } = await context.params
  const room = decodeURIComponent(number ?? '').trim()

  const response = await publicRoute(async () => {
    if (!room || room.length > 24) {
      throw errors.validation('That does not look like a room number.')
    }

    const { data, error } = await anonClient()
      .from('campus_places')
      .select(PLACE_COLUMNS)
      .eq('campus', 'manila')
      .eq('status', 'approved')

    if (error) throw errors.internal({ cause: error.message })

    const places = (data ?? []) as Place[]
    const roomBearing = places.filter(
      (place) => place.room_range_start || place.room_range_end || place.building_code,
    )

    const match = findMatch(room, roomBearing)
    if (!match) {
      throw errors.notFound(
        `No building has claimed room ${room} yet. Room ranges come from students, so this fills in as people add them.`,
      )
    }

    const gates = places.filter((place) => place.category === 'gate')
    const nearest = gates.reduce<{ place: Place; metres: number } | null>((best, gate) => {
      const metres = metresBetween(match.place, gate)
      return !best || metres < best.metres ? { place: gate, metres } : best
    }, null)

    return {
      room,
      building: {
        code: match.place.building_code,
        name: match.place.name,
      },
      // Where a floor was not recorded, a three-digit room number's leading
      // digit is the campus-wide convention. It is a derivation, and
      // `confidence` is what says how much to lean on it.
      floor: match.place.floor ?? (/^\d{3,}$/.test(room) ? room[0] : null),
      nearest_gate: nearest
        ? { name: nearest.place.name, walk_minutes: walkMinutes(nearest.metres) }
        : null,
      confidence: match.confidence,
    }
  })(request)

  if (response.ok) response.headers.set('Cache-Control', 'public, max-age=3600')
  return response
}
