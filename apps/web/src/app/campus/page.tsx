import type { Metadata } from 'next'
import type { CampusPlace } from '@onetup/core'
import { supabaseServer } from '@/lib/supabase/server'
import { CampusView } from '@/components/campus/campus-view'

/**
 * `/campus` — public, unauthenticated, and rendered on the server so the places
 * are in the HTML before any JavaScript runs.
 *
 * `campus_places` is the one table with an anonymous select policy, so this
 * query works identically for a visitor with no account and for a signed-in
 * student. Nothing on this page needs a session, and nothing on it asks for one.
 */

export const metadata: Metadata = {
  title: 'Campus map',
  description:
    'Rooms and the buildings they are in, gates, printing, food, and where to go when something is wrong at TUP Manila. No sign-up. Works on any phone.',
}

export default async function CampusPage() {
  let places: CampusPlace[] = []
  let loadFailed = false

  try {
    const supabase = await supabaseServer()
    const { data, error } = await supabase
      .from('campus_places')
      .select('*')
      .eq('campus', 'manila')
      .eq('status', 'approved')
      .order('category')
      .order('name')

    if (error) loadFailed = true
    else places = data ?? []
  } catch {
    // A missing environment or an unreachable database is a state this screen
    // draws, not an exception it throws at a visitor.
    loadFailed = true
  }

  return <CampusView places={places} loadFailed={loadFailed} />
}
