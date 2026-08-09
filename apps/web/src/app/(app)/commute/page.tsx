import type { Metadata } from 'next'
import { CommuteView } from '@/components/commute/commute-view'

export const metadata: Metadata = { title: 'Commute' }

export default function CommutePage() {
  return <CommuteView />
}
