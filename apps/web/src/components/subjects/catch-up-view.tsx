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
      <NavBar
        title="Catch up"
        subtitle={
          gaps.length === 0
            ? 'The past 7 days'
            : `${gaps.length} class${gaps.length === 1 ? '' : 'es'} from the past 7 days`
        }
        back={{ href: '/subjects', label: 'Subjects' }}
        trailing={
          gaps.length > 0 ? (
            <ButtonLink href="/subjects" size="sm" variant="plain">
              Done for now
            </ButtonLink>
          ) : undefined
        }
      />

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
              through is here, newest first.
            </p>

            {[...byDate.entries()].map(([date, entries]) => (
              <section key={date}>
                <SectionHeader>{relativeDate(date, today)}</SectionHeader>
                {/* Two-up above lg: these cards are short and a 68rem column of
                    single ones is scrolling for its own sake. */}
                <div className="grid gap-3 lg:grid-cols-2">
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
      <NavBar title="Catch up" back={{ href: '/subjects', label: 'Subjects' }} />
      <div className="app-container stack" aria-busy="true" aria-label="Loading catch-up">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="skeleton h-32 rounded-[var(--radius-md)]" />
          <div className="skeleton h-32 rounded-[var(--radius-md)]" />
        </div>
      </div>
    </>
  )
}
