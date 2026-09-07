import type { Metadata } from 'next'
import { ReviewSession } from '@/components/study/review-session'

export const metadata: Metadata = { title: 'Review' }

export default function ReviewPage() {
  return <ReviewSession />
}
