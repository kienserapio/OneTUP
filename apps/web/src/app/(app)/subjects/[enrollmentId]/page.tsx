import type { Metadata } from 'next'
import { SubjectDetail } from '@/components/subjects/subject-detail'

export const metadata: Metadata = { title: 'Subject' }

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>
}) {
  const { enrollmentId } = await params
  return <SubjectDetail enrollmentId={enrollmentId} />
}
