import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ClassPostDetail } from '@/components/classroom/class-post-detail'

export const metadata: Metadata = { title: 'Class post' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ClassPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()

  return <ClassPostDetail postId={id} />
}
