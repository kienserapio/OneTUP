import type { Metadata } from 'next'
import type { CampusPlace } from '@onetup/core'
import { supabaseServer } from '@/lib/supabase/server'
import { CampusView } from '@/components/campus/campus-view'

/**
 * `/campus` — the campus, and there is only one of it.
 *
 * The 3D tour is the campus map, not a companion to one: TUPniverse's 360°
 * capture of TUP Manila, hosted on Panoee, with room lookup, the place list and
 * the emergency numbers floating over it.
 *
 * Public, unauthenticated, and rendered on the server so the places are in the
 * HTML before any JavaScript runs. `campus_places` is the one table with an
 * anonymous select policy, so this query works identically for a visitor with
 * no account and for a signed-in student. Nothing on this page needs a session,
 * and nothing on it asks for one (ADR-012).
 */

export const metadata: Metadata = {
  title: 'Campus',
  description:
    'Walk the TUP Manila campus in 360°, find which building a room is in, and get the numbers to call when something is wrong. No sign-up. Works on any phone.',
}

export default async function CampusPage({
  searchParams,
}: {
  searchParams: Promise<{ scene?: string }>
}) {
  const { scene } = await searchParams

  let places: CampusPlace[] = []
  let loadFailed = false
  let signedIn = false

  try {
    const supabase = await supabaseServer()

    const [placesResult, userResult] = await Promise.all([
      supabase
        .from('campus_places')
        .select('*')
        .eq('campus', 'manila')
        .eq('status', 'approved')
        .order('category')
        .order('name'),
      // Only ever used to decide whether to offer the correction form; nothing
      // on this page is gated on it.
      supabase.auth.getUser(),
    ])

    if (placesResult.error) loadFailed = true
    else places = placesResult.data ?? []

    signedIn = Boolean(userResult.data.user)
  } catch {
    // A missing environment or an unreachable database is a state this screen
    // draws, not an exception it throws at a visitor.
    loadFailed = true
  }

  const linked = places.filter((place) => place.tour_scene_url)

  /* A scene id from the query string is only honoured when it is one we linked,
   * so the page cannot be used to frame arbitrary third-party content. */
  const known = new Set(linked.map((place) => place.tour_scene_url))
  const startScene = scene && known.has(scene) ? scene : (linked[0]?.tour_scene_url ?? null)

  return (
    <CampusView
      places={places}
      loadFailed={loadFailed}
      signedIn={signedIn}
      tourBaseUrl={process.env.NEXT_PUBLIC_CAMPUS_TOUR_URL ?? null}
      startScene={startScene}
    />
  )
}
