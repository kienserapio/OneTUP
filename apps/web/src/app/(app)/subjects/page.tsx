import type { Metadata } from 'next'
import { SubjectsView } from '@/components/subjects/subjects-view'

export const metadata: Metadata = { title: 'Subjects' }

/**
 * Renders on the client from IndexedDB, like Today: absence counts are checked
 * in corridors and stairwells, and a server round trip cannot answer there.
 */
export default function SubjectsPage() {
  return <SubjectsView />
}
