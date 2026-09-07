import type { Metadata } from 'next'
import { PackCreate } from '@/components/study/pack-create'

export const metadata: Metadata = { title: 'New pack' }

export default function NewPackPage() {
  return <PackCreate />
}
