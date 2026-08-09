import type { Metadata } from 'next'
import { GwaView } from '@/components/subjects/gwa-view'

export const metadata: Metadata = { title: 'GWA' }

export default function GwaPage() {
  return <GwaView />
}
