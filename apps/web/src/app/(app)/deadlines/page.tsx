import type { Metadata } from 'next'
import { DeadlinesView } from '@/components/deadlines/deadlines-view'

export const metadata: Metadata = { title: 'Deadlines' }

export default function DeadlinesPage() {
  return <DeadlinesView />
}
