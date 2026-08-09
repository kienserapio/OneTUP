import type { Metadata } from 'next'
import { DeadlineEditor } from '@/components/deadlines/deadline-editor'

export const metadata: Metadata = { title: 'New deadline' }

export default function NewDeadlinePage() {
  return <DeadlineEditor />
}
