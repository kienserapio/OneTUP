'use client'

import { useCallback, useEffect, useState } from 'react'
import { addDays, manilaDate } from '@onetup/core'
import { loadCatchUp } from '@/lib/queries/subjects'
import type { AttendanceGap } from '@/lib/queries/today'
import { syncNow } from '@/lib/offline/sync'
import { Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { IconCheck } from '@/components/ui/icon'
import { AttendancePrompt } from '@/components/today/attendance-prompt'
import { formatSessionDate } from '@/components/subjects/attendance-record-sheet'

/**
 * Catch-up.
 *
 * Push delivery is unreliable — on iOS it requires an installed PWA and still
 * misses — so a student who cannot backfill a week they were not prompted for
 * simply stops recording, and every number in the module goes stale. This
 * screen is what keeps the data honest when the notification never arrived.
 *
 * The list is loaded once and deliberately not refetched as answers come in:
 * <AttendancePrompt> keeps an Undo beside what it just recorded, and pulling the
 * row out from under it would take that back before a mistyped tap can be
 * fixed.
 */
export function CatchUpView() {
  const [gaps, setGaps] = useState<AttendanceGap[] | null>(null)

  const reload = useCallback(async () => {
    setGaps(await loadCatchUp(new Date()))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void syncNow().then(reload)
  }, [reload])

  if (!gaps) return <CatchUpSkeleton />

  const byDate = new Map<string, AttendanceGap[]>()
  for (const gap of gaps) {
    const bucket = byDate.get(gap.date)
    if (bucket) bucket.push(gap)
    else byDate.set(gap.date, [gap])
  }

  const today = manilaDate(new Date())

  return (
    <>
      <NavBar title="Catch up" subtitle="The past 7 days" back={{ href: '/subjects' }} />

      <div className="app-container stack pb-4">
        {gaps.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconCheck size={28} />}
              title="Nothing to catch up on. Every class in the past week has an answer."
              action={
                <ButtonLink href="/subjects" variant="plain">
                  Back to subjects
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <>
            <p className="type-footnote px-1 text-[var(--label-secondary)]">
              Reminders don&rsquo;t always arrive, especially on iPhone. Anything that slipped
              through is here.
            </p>

            {[...byDate.entries()].map(([date, entries]) => (
              <section key={date}>
                <SectionHeader>{relativeDate(date, today)}</SectionHeader>
                <div className="stack">
                  {entries.map((gap) => (
                    <AttendancePrompt
                      key={`${gap.block.id}-${gap.date}`}
                      block={gap.block}
                      sessionDate={gap.date}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </>
  )
}

function relativeDate(date: string, today: string): string {
  if (date === addDays(today, -1)) return `Yesterday · ${formatSessionDate(date)}`
  return formatSessionDate(date)
}

function CatchUpSkeleton() {
  return (
    <>
      <NavBar title="Catch up" back={{ href: '/subjects' }} />
      <div className="app-container stack" aria-busy="true" aria-label="Loading catch-up">
        <div className="skeleton h-32 rounded-[var(--radius-lg)]" />
        <div className="skeleton h-32 rounded-[var(--radius-lg)]" />
      </div>
    </>
  )
}
