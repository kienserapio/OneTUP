import type { Metadata } from 'next'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { TodayView } from '@/components/today/today-view'
import { firstName } from '@/lib/name'

export const metadata: Metadata = { title: 'Today' }

/**
 * The screen the app exists for.
 *
 * Only the greeting needs the server — everything else renders on the client
 * from IndexedDB, because a student in a corridor with no signal must still see
 * what is next (NFR-A1, NFR-P3).
 */
export default async function TodayPage() {
  const user = await currentUser()
  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id ?? '')
    .maybeSingle()

  return <TodayView firstName={firstName(profile?.full_name ?? null)} />
}
