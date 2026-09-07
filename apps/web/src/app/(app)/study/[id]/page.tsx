import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PackDetail } from '@/components/study/pack-detail'

export const metadata: Metadata = { title: 'Pack' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // `/study/anything` is not a pack that is missing, it is a URL that does not
  // exist. Rendering the empty state for it would tell a student their pack was
  // deleted when they simply mistyped.
  if (!UUID.test(id)) notFound()

  return <PackDetail packId={id} />
}
