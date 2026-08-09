import type { Metadata } from 'next'
import { CatchUpView } from '@/components/subjects/catch-up-view'

export const metadata: Metadata = { title: 'Catch up' }

export default function CatchUpPage() {
  return <CatchUpView />
}
