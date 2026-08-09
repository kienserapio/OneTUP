import type { Metadata } from 'next'
import { TodayView } from '@/components/today/today-view'

export const metadata: Metadata = { title: 'Today' }

/**
 * The screen the app exists for.
 *
 * It renders entirely on the client from IndexedDB. That is not a performance
 * shortcut — it is the requirement: a student in a concrete corridor with no
 * signal must still see what is next, and a server round trip cannot deliver
 * that (NFR-A1, NFR-P3).
 */
export default function TodayPage() {
  return <TodayView />
}
