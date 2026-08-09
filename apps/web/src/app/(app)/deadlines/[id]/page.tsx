import type { Metadata } from 'next'
import { DeadlineEditor } from '@/components/deadlines/deadline-editor'

export const metadata: Metadata = { title: 'Deadline' }

export default async function DeadlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DeadlineEditor deadlineId={id} />
}
