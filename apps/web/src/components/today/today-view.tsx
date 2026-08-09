'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  type DeparturePlanRow,
  describeTimeLeft,
  formatTime12,
  urgencyOf,
} from '@onetup/core'
import { loadToday, type TodayData } from '@/lib/queries/today'
import { readAll } from '@/lib/offline/db'
import { useNow } from '@/lib/hooks/use-local'
import { syncNow } from '@/lib/offline/sync'
import { Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import {
  IconAnnouncement,
  IconAsk,
  IconCampus,
  IconCheck,
  IconClock,
  IconCommute,
  IconDeadlines,
  IconWarning,
} from '@/components/ui/icon'
import { AttendancePrompt } from '@/components/today/attendance-prompt'
import { UpNextCard } from '@/components/today/up-next-card'
import { DepartureCard } from '@/components/today/departure-card'

/**
 * Today.
 *
 * The order is the argument: where you have to be, what you owe an answer to,
 * what is about to be due, then everything else. A student who opens this, sees
 * what they need and closes it in eight seconds is the success case — so
 * nothing here is designed to hold attention.
 */
export function TodayView({ firstName }: { firstName: string | null }) {
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

  const urgent = [...data.overdue, ...data.dueSoon]

  return (
    <div className="app-container stack pb-6 pt-5">
      <header>
        <h2 className="type-large-title">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </h2>
        <p className="type-body mt-1 text-[var(--label-secondary)]">{summarise(data, now)}</p>
      </header>

      <UpNextCard data={data} />

      <QuickActions />

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

      {plan && <DepartureCard plan={plan} />}

      {data.blocks.length > 0 && (
        <section>
          <SectionHeader
            action={
              <Link href="/schedule" className="type-footnote text-[var(--accent)]">
                Full week
              </Link>
            }
          >
            Rest of your day
          </SectionHeader>
          <ListGroup>
            {data.blocks.map((block) => {
              const done = block.endTime <= currentTime(now)
              return (
                <ListRow
                  key={block.id}
                  href={`/schedule/day/${data.date}`}
                  leading={
                    <span
                      aria-hidden
                      className="block size-2.5 rounded-full"
                      style={{ background: done ? 'var(--separator-opaque)' : 'var(--accent)' }}
                    />
                  }
                  title={
                    <span className={done ? 'opacity-55' : undefined}>
                      <span className="type-data">{block.label}</span>
                      {block.courseTitle ? ` · ${block.courseTitle}` : ''}
                    </span>
                  }
                  subtitle={
                    <span className="type-data">
                      {formatTime12(block.startTime)} – {formatTime12(block.endTime)}
                      {block.room ? ` · ${block.room}` : ''}
                    </span>
                  }
                />
              )
            })}
          </ListGroup>
        </section>
      )}

      {urgent.length > 0 && (
        <section>
          <SectionHeader
            action={
              <Link href="/deadlines" className="type-footnote text-[var(--accent)]">
                See all
              </Link>
            }
          >
            Due soon
          </SectionHeader>
          <ListGroup>
            {urgent.slice(0, 5).map((deadline) => (
              <ListRow
                key={deadline.id}
                href={`/deadlines/${deadline.id}`}
                title={deadline.title}
                subtitle={describeTimeLeft(deadline.due_at, now)}
                leading={
                  <span
                    aria-hidden
                    className="block size-2.5 rounded-full"
                    style={{
                      background: urgencyColor(
                        urgencyOf({ dueAt: deadline.due_at, status: 'open' }, now),
                      ),
                    }}
                  />
                }
              />
            ))}
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
                leading={<IconWarning size={20} style={{ color: attendanceColor(warning.state) }} />}
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
        <Card className="flex items-center gap-3 p-4">
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
    </div>
  )
}

/**
 * The six things a student reaches for without navigating. Each is one tap from
 * here because the alternative is three, and three is why people stop bothering.
 */
function QuickActions() {
  const actions = [
    { href: '/subjects/catch-up', label: 'Log attendance', Icon: IconCheck },
    { href: '/deadlines/new', label: 'Add a deadline', Icon: IconDeadlines },
    { href: '/commute/plan', label: 'Plan my trip', Icon: IconCommute },
    { href: '/announcements/new', label: 'Share news', Icon: IconAnnouncement },
    { href: '/campus', label: 'Find a room', Icon: IconCampus },
    { href: '/ask', label: 'Ask OneTUP', Icon: IconAsk },
  ]

  return (
    <nav aria-label="Quick actions" className="grid grid-cols-3 gap-2.5">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href as never}
          className="card flex min-h-[5.5rem] flex-col items-center justify-center gap-2 px-2 py-3 text-center transition-colors"
        >
          <action.Icon size={22} style={{ color: 'var(--accent)' }} />
          <span className="type-caption-1 font-medium leading-tight">{action.label}</span>
        </Link>
      ))}
    </nav>
  )
}

function TodaySkeleton() {
  return (
    <div className="app-container stack pt-5" aria-busy="true" aria-label="Loading today">
      <div className="skeleton h-12 w-64 rounded-[var(--radius-sm)]" />
      <div className="skeleton h-44 rounded-[var(--radius-xl)]" />
      <div className="skeleton h-24 rounded-[var(--radius-md)]" />
      <div className="skeleton h-32 rounded-[var(--radius-md)]" />
    </div>
  )
}

/** Filipino greeting by time of day — both languages are first-class here. */
function greeting(): string {
  const hour = Number(
    new Date().toLocaleString('en-PH', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }),
  )
  if (hour < 12) return 'Magandang umaga'
  if (hour < 18) return 'Magandang hapon'
  return 'Magandang gabi'
}

/**
 * One sentence naming what is actually different about today. Generic
 * encouragement would be noise; this is the reason to read the screen.
 */
function summarise(data: TodayData, now: Date): string {
  const parts: string[] = []

  const remaining = data.blocks.filter((block) => block.endTime > currentTime(now)).length
  parts.push(
    remaining === 0
      ? 'No classes left today'
      : `${remaining} class${remaining === 1 ? '' : 'es'} left`,
  )

  const due = data.overdue.length + data.dueSoon.length
  if (due > 0) parts.push(`${due} thing${due === 1 ? '' : 's'} due within 48 hours`)

  const tight = data.attendanceWarnings.filter((w) => w.remaining <= 1).length
  if (tight > 0) parts.push(`${tight} subject${tight === 1 ? '' : 's'} near the absence limit`)

  return `${parts.join(', ')}.`
}

function currentTime(now: Date): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(11, 16)
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

function describeGap(minutes: number, after: string | null, before: string | null): string {
  const length = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60 || ''}`.trim()
  if (after && before) return `${length} between ${after} and ${before}`
  if (before) return `${length} before ${before}`
  if (after) return `${length} after ${after}`
  return length
}
