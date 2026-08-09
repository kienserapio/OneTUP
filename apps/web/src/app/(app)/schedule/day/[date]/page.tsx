import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isDateOnly } from '@onetup/core'
import { DayView } from '@/components/schedule/day-view'

export const metadata: Metadata = { title: 'Day' }

export default async function ScheduleDayPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params

  // A hand-typed or stale URL falls back to the week rather than rendering a
  // day built from a date the whole schedule layer would reject.
  if (!isDateOnly(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    redirect('/schedule')
  }

  return <DayView date={date} />
}
