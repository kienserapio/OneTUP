import type { Metadata } from 'next'
import { ScheduleView } from '@/components/schedule/schedule-view'

export const metadata: Metadata = { title: 'Schedule' }

/**
 * The week. Rendered on the client from IndexedDB, for the same reason Today is
 * — a timetable a student cannot open in a stairwell is not a timetable.
 */
export default function SchedulePage() {
  return <ScheduleView />
}
