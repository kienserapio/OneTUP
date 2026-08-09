import type { Metadata } from 'next'
import { DeparturePlanView } from '@/components/commute/departure-plan-view'

export const metadata: Metadata = { title: 'Wake-up plan' }

export default function DeparturePlanPage() {
  return <DeparturePlanView />
}
