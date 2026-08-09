import type { Metadata } from 'next'
import { supabaseServer } from '@/lib/supabase/server'
import { ScheduleView } from '@/components/schedule/schedule-view'

export const metadata: Metadata = { title: 'Schedule' }

/**
 * The week. Rendered on the client from IndexedDB, for the same reason Today is
 * — a timetable a student cannot open in a stairwell is not a timetable.
 *
 * The term label is the one thing the local store does not hold, so it comes
 * down with the server render rather than costing a fetch on the read path.
 */
export default async function SchedulePage() {
  const supabase = await supabaseServer()
  const { data: term } = await supabase
    .from('terms')
    .select('label')
    .eq('is_current', true)
    .maybeSingle()

  return <ScheduleView termLabel={term?.label ?? null} />
}
