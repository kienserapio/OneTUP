'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import {
  type DeparturePlanRow,
  describeTimeLeft,
  formatTime12,
  formatWeekday,
  urgencyOf,
} from '@onetup/core'
import { loadToday, type TodayData } from '@/lib/queries/today'
import { readAll } from '@/lib/offline/db'
import { useNow } from '@/lib/hooks/use-local'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import {
  IconAlarm,
  IconAnnouncement,
  IconCampus,
  IconChevronRight,
  IconClock,
  IconCommute,
  IconSettings,
  IconWarning,
} from '@/components/ui/icon'
import { AttendancePrompt } from '@/components/today/attendance-prompt'

/**
 * Today.
 *
 * The order of the cards is the argument: what is happening now, what you have
 * to answer, what is about to be due, then everything else. A student who opens
 * this, sees what they need, and closes it in eight seconds is the success
 * case — so nothing here is designed to hold attention.
 */
export function TodayView() {
  const now = useNow(30_000)
  const [data, setData] = useState<TodayData | null>(null)
  const [plan, setPlan] = useState<DeparturePlanRow | null>(null)

  const reload = useCallback(async () => {
    const next = await loadToday(new Date())
    setData(next)
    const plans = await readAll<DeparturePlanRow & { id: string }>('departure_plans')
    setPlan(plans.find((p) => p.plan_date === next.date) ?? null)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload, now])

  useEffect(() => {
    void syncNow().then(reload)
  }, [reload])

  if (!data) return <TodaySkeleton />

  const dateLabel = `${formatWeekday(data.weekday)}, ${formatDate(data.date)}`

  return (
    <>
      <NavBar title="Today" subtitle={dateLabel} />

      <div className="app-container stack pb-4">
        {plan && <DepartureCard plan={plan} />}

        <NowNext data={data} />

        {data.pendingAttendance.length > 0 && (
          <section>
            <SectionHeader>Were you there?</SectionHeader>
            <div className="stack">
              {data.pendingAttendance.map((block) => (
                <AttendancePrompt
                  key={block.id}
                  block={block}
                  sessionDate={data.date}
                  onRecorded={reload}
                />
              ))}
            </div>
          </section>
        )}

        {(data.overdue.length > 0 || data.dueSoon.length > 0) && (
          <section>
            <SectionHeader
              action={
                <Link href="/deadlines" className="type-footnote text-[var(--accent)]">
                  All deadlines
                </Link>
              }
            >
              Due soon
            </SectionHeader>
            <ListGroup>
              {[...data.overdue, ...data.dueSoon].slice(0, 5).map((deadline) => {
                const urgency = urgencyOf({ dueAt: deadline.due_at, status: 'open' }, now)
                return (
                  <ListRow
                    key={deadline.id}
                    href={`/deadlines/${deadline.id}`}
                    title={deadline.title}
                    subtitle={describeTimeLeft(deadline.due_at, now)}
                    leading={
                      <span
                        aria-hidden
                        className="block size-2.5 rounded-full"
                        style={{ background: urgencyColor(urgency) }}
                      />
                    }
                  />
                )
              })}
            </ListGroup>
          </section>
        )}

        {data.attendanceWarnings.length > 0 && (
          <section>
            <SectionHeader>Watch your cuts</SectionHeader>
            <ListGroup>
              {data.attendanceWarnings.map((warning) => (
                <ListRow
                  key={warning.code}
                  href="/subjects"
                  leading={
                    <IconWarning
                      size={20}
                      style={{ color: attendanceColor(warning.state) }}
                    />
                  }
                  title={<span className="type-data">{warning.code}</span>}
                  subtitle={
                    warning.remaining === 0
                      ? 'At the limit for this subject'
                      : `${warning.remaining} absence${warning.remaining === 1 ? '' : 's'} left`
                  }
                />
              ))}
            </ListGroup>
          </section>
        )}

        {data.catchUp.length > 0 && (
          <Card className="flex items-center gap-3">
            <IconClock size={22} className="shrink-0 text-[var(--label-secondary)]" />
            <p className="type-subheadline flex-1">
              {data.catchUp.length} class{data.catchUp.length === 1 ? '' : 'es'} from the past week
              still need an answer.
            </p>
            <ButtonLink href="/subjects/catch-up" size="sm" variant="plain">
              Catch up
            </ButtonLink>
          </Card>
        )}

        {data.gaps.length > 0 && (
          <section>
            <SectionHeader>Free today</SectionHeader>
            <ListGroup>
              {data.gaps.map((gap) => (
                <ListRow
                  key={`${gap.startTime}-${gap.endTime}`}
                  title={
                    <span className="type-data">
                      {formatTime12(gap.startTime)} – {formatTime12(gap.endTime)}
                    </span>
                  }
                  subtitle={describeGap(gap.minutes, gap.after, gap.before)}
                />
              ))}
            </ListGroup>
          </section>
        )}

        {data.blocks.length === 0 && (
          <Card>
            <EmptyState
              title="No schedule yet. Import it from ERS, or paste it in — either works."
              action={
                <ButtonLink href="/schedule/import" variant="accent">
                  Bring in your schedule
                </ButtonLink>
              }
            />
          </Card>
        )}

        <Elsewhere />
      </div>
    </>
  )
}

/**
 * The current or next class. Given a choice, a student would rather know where
 * to be than what they just left, so "now" gives way to "next" the moment a
 * class ends.
 */
function NowNext({ data }: { data: TodayData }) {
  const block = data.now
  const next = data.next

  if (!block && !next) {
    return (
      <Card>
        <p className="type-body text-[var(--label-secondary)]">
          Nothing scheduled for the rest of the week.
        </p>
      </Card>
    )
  }

  if (block) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition(spring.ui)}>
        <Card className="relative overflow-hidden">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1"
            style={{ background: 'var(--accent)' }}
          />
          <p className="type-section-header" style={{ color: 'var(--accent)' }}>
            Right now
          </p>
          <h2 className="type-title-2 mt-1">{block.label}</h2>
          {block.courseTitle && (
            <p className="type-subheadline text-[var(--label-secondary)]">{block.courseTitle}</p>
          )}
          <p className="type-data mt-3 text-[var(--label-secondary)]">
            {formatTime12(block.startTime)} – {formatTime12(block.endTime)}
            {block.room ? ` · ${block.room}` : ''}
          </p>
        </Card>
      </motion.div>
    )
  }

  const minutes = next!.minutesUntil
  return (
    <Card>
      <p className="type-section-header">{next!.isToday ? 'Next' : 'Next class'}</p>
      <h2 className="type-title-2 mt-1">{next!.block.label}</h2>
      {next!.block.courseTitle && (
        <p className="type-subheadline text-[var(--label-secondary)]">
          {next!.block.courseTitle}
        </p>
      )}
      <p className="type-data mt-3 text-[var(--label-secondary)]">
        {next!.isToday
          ? `in ${formatDuration(minutes)} · ${formatTime12(next!.block.startTime)}`
          : `${formatWeekday(next!.block.day, 'short')} ${formatTime12(next!.block.startTime)}`}
        {next!.block.room ? ` · ${next!.block.room}` : ''}
      </p>
    </Card>
  )
}

/**
 * The departure plan. The explanation is templated server-side from the
 * adjustments that actually fired, so this card and the wake-alarm
 * notification can never tell the student two different stories.
 */
function DepartureCard({ plan }: { plan: DeparturePlanRow }) {
  return (
    <Link href="/commute/plan" className="block">
      <Card className="flex items-start gap-3">
        <IconAlarm size={24} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
        <div className="min-w-0 flex-1">
          <p className="type-headline">
            <span className="type-data">Leave by {formatInstant(plan.leave_at)}</span>
          </p>
          <p className="type-subheadline text-[var(--label-secondary)]">
            <span className="type-data">Wake at {formatInstant(plan.wake_at)}</span>
          </p>
          {plan.explanation && (
            <p className="type-footnote mt-2 text-[var(--label-secondary)]">{plan.explanation}</p>
          )}
        </div>
        <IconChevronRight size={18} className="mt-1 shrink-0 text-[var(--label-tertiary)]" />
      </Card>
    </Link>
  )
}

/**
 * The four modules that do not earn a tab.
 *
 * The tab bar holds the things a student opens every day; these are the ones
 * they open when something specific happens — a beadle posts, a route changes,
 * a room needs finding. Keeping them one interaction deeper is what stops the
 * tab bar from becoming a menu.
 */
function Elsewhere() {
  return (
    <section>
      <SectionHeader>Elsewhere</SectionHeader>
      <ListGroup>
        <ListRow
          href="/announcements"
          leading={<IconAnnouncement size={21} />}
          title="Announcements"
          subtitle="What your beadle posted"
        />
        <ListRow
          href="/commute"
          leading={<IconCommute size={21} />}
          title="Commute"
          subtitle="Routes, fares and when to leave"
        />
        <ListRow
          href="/campus"
          leading={<IconCampus size={21} />}
          title="Campus map"
          subtitle="Rooms, gates, printing"
        />
        <ListRow
          href="/settings"
          leading={<IconSettings size={21} />}
          title="Settings"
        />
      </ListGroup>
    </section>
  )
}

function TodaySkeleton() {
  return (
    <>
      <NavBar title="Today" />
      <div className="app-container stack" aria-busy="true" aria-label="Loading today">
        <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
        <div className="skeleton h-40 rounded-[var(--radius-lg)]" />
        <div className="skeleton h-24 rounded-[var(--radius-lg)]" />
      </div>
    </>
  )
}

function urgencyColor(urgency: string): string {
  switch (urgency) {
    case 'overdue':
    case 'critical':
      return 'var(--danger)'
    case 'urgent':
      return 'var(--warning)'
    case 'soon':
      return 'var(--caution)'
    case 'upcoming':
      return 'var(--info)'
    default:
      return 'var(--label-tertiary)'
  }
}

function attendanceColor(state: string): string {
  switch (state) {
    case 'at_limit':
      return 'var(--danger)'
    case 'warning':
      return 'var(--warning)'
    case 'caution':
      return 'var(--caution)'
    default:
      return 'var(--ok)'
  }
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
}

function formatInstant(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

function describeGap(minutes: number, after: string | null, before: string | null): string {
  const length = formatDuration(minutes)
  if (after && before) return `${length} between ${after} and ${before}`
  if (before) return `${length} before ${before}`
  if (after) return `${length} after ${after}`
  return length
}
