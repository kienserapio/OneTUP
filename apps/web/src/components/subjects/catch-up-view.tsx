'use client'

import { useCallback, useEffect, useState } from 'react'
import { addDays, manilaDate } from '@onetup/core'
import { loadCatchUp } from '@/lib/queries/subjects'
import { CATCH_UP_DAYS, type AttendanceGap } from '@/lib/queries/today'
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
 * It reaches back four weeks (`CATCH_UP_DAYS`) rather than one, and groups by
 * week because that is the unit a student actually lost: nobody misses "the
 * 14th", they miss "the week I had flu". The week headings carry their own
 * counts so a backlog can be worked through one week at a time instead of
 * reading as one undifferentiated wall of cards.
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

  const today = manilaDate(new Date())
  const weeks = groupByWeek(gaps)

  return (
    <>
      <NavBar
        title="Catch up"
        subtitle={
          gaps.length === 0
            ? `The past ${CATCH_UP_WEEKS} weeks`
            : `${gaps.length} class${gaps.length === 1 ? '' : 'es'} from the past ${CATCH_UP_WEEKS} weeks`
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
              title="Nothing to catch up on. Every class in the past four weeks has an answer."
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
              Reminders don&rsquo;t always arrive, especially on iPhone. Anything from the past
              four weeks that slipped through is here, newest first.
            </p>

            {weeks.map((week) => (
              <section key={week.start}>
                <SectionHeader>
                  {weekLabel(week.start, today)} &middot; {week.gaps.length} class
                  {week.gaps.length === 1 ? '' : 'es'}
                </SectionHeader>

                {week.days.map(([date, entries]) => (
                  <div key={date} className="mb-4 space-y-2 last:mb-0">
                    <p className="type-footnote px-1 text-[var(--label-secondary)]">
                      {relativeDate(date, today)}
                    </p>
                    {/* Two-up above lg: these cards are short and a 68rem column
                        of single ones is scrolling for its own sake. */}
                    <div className="grid gap-3 lg:grid-cols-2">
                      {entries.map((gap) => (
                        <AttendancePrompt
                          key={`${gap.block.id}-${gap.date}`}
                          block={gap.block}
                          sessionDate={gap.date}
                          standing={gap.standing}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </>
  )
}

const CATCH_UP_WEEKS = Math.round(CATCH_UP_DAYS / 7)

interface CatchUpWeek {
  /** The Monday the week begins on. */
  start: string
  gaps: AttendanceGap[]
  days: [string, AttendanceGap[]][]
}

/**
 * Weeks run Monday to Sunday because that is how a class schedule is read, not
 * because of any locale setting. `gaps` arrives newest first and both levels
 * keep that order.
 */
function groupByWeek(gaps: AttendanceGap[]): CatchUpWeek[] {
  const weeks = new Map<string, Map<string, AttendanceGap[]>>()

  for (const gap of gaps) {
    const start = weekStart(gap.date)
    let days = weeks.get(start)
    if (!days) {
      days = new Map()
      weeks.set(start, days)
    }
    const bucket = days.get(gap.date)
    if (bucket) bucket.push(gap)
    else days.set(gap.date, [gap])
  }

  return [...weeks.entries()].map(([start, days]) => ({
    start,
    days: [...days.entries()],
    gaps: [...days.values()].flat(),
  }))
}

function weekStart(date: string): string {
  // getUTCDay: 0 is Sunday, so Sunday is six days into its own week here.
  const offset = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
  return addDays(date, -offset)
}

function weekLabel(start: string, today: string): string {
  const current = weekStart(today)
  if (start === current) return 'This week'
  if (start === addDays(current, -7)) return 'Last week'
  const weeksBack = Math.round((Date.parse(current) - Date.parse(start)) / (7 * 86_400_000))
  return `${weeksBack} weeks ago`
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
