import { createClient } from '@supabase/supabase-js'
import { freshnessOf, type Database } from '@onetup/core'
import { publicRoute } from '@/lib/api/handler'
import { errors } from '@/lib/api/errors'

/**
 * `GET /api/campus/places` — the one read that needs no account at all.
 *
 * Campus data is non-personal, and the highest-anxiety moment in a student's
 * year is arriving somewhere they have never been — which happens before they
 * would ever have signed up for anything (ADR-012). So this runs on a bare
 * anonymous client with no cookies: the response is identical for every caller,
 * which is what makes it safe to hand to a shared cache for an hour.
 */

const CATEGORIES = [
  'building',
  'gate',
  'printing',
  'food',
  'study',
  'service',
  'landmark',
] as const

type Category = (typeof CATEGORIES)[number]

function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

/** No cookies, so a signed-in student's own pending submissions can never leak
 * into a cached public response. */
function anonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

const handler = publicRoute(async (request) => {
  const url = new URL(request.url)
  const campus = url.searchParams.get('campus')?.trim() || 'manila'
  const requested = url.searchParams.get('category')?.trim()

  let category: Category | undefined
  if (requested) {
    if (!isCategory(requested)) {
      throw errors.validation(
        `There is no category called "${requested}". Try one of: ${CATEGORIES.join(', ')}.`,
      )
    }
    category = requested
  }

  let query = anonClient()
    .from('campus_places')
    .select(
      'id, category, name, description, lat, lng, building_code, floor, room_range_start, room_range_end, hours, price_min, price_max, price_unit, contact_phone, is_emergency, last_verified_at',
    )
    .eq('campus', campus)
    .eq('status', 'approved')
    .order('name')

  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) throw errors.internal({ cause: error.message })

  return {
    data: (data ?? []).map((place) => ({
      id: place.id,
      category: place.category,
      name: place.name,
      description: place.description,
      location: { lat: place.lat, lng: place.lng },
      building_code: place.building_code,
      floor: place.floor,
      room_range_start: place.room_range_start,
      room_range_end: place.room_range_end,
      hours: place.hours,
      price_min: place.price_min,
      price_max: place.price_max,
      price_unit: place.price_unit,
      contact_phone: place.contact_phone,
      is_emergency: place.is_emergency,
      last_verified_at: place.last_verified_at,
      // Never presented as current just because it is present: a price nobody
      // has confirmed carries that fact with it (PRD §8.5).
      freshness: freshnessOf(place.last_verified_at),
    })),
    attribution: 'Community-maintained. Verify prices before relying on them.',
  }
})

export async function GET(request: Request): Promise<Response> {
  const response = await handler(request)
  if (response.ok) response.headers.set('Cache-Control', 'public, max-age=3600')
  return response
}
