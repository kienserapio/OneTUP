import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isDateOnly } from '@onetup/core'
import { DayView } from '@/components/schedule/day-view'

export const metadata: Metadata = { title: 'Day' }

export default async function ScheduleDayPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params

  // `/schedule/day/tuesday` is not a day this app has; it is a URL that does not
  // exist. Silently redirecting to the week hid that, and a student who mistyped
  // a date was left wondering why the screen ignored them.
  if (!isDateOnly(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    notFound()
  }

  return <DayView date={date} />
}
