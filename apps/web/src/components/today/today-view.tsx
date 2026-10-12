'use client'

import { type ComponentType, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { type DeparturePlanRow, describeTimeLeft } from '@onetup/core'
import { loadToday, type TodayData, type TrackerItem } from '@/lib/queries/today'
import { readAll } from '@/lib/offline/db'
import { useNow } from '@/lib/hooks/use-local'
import { syncNow } from '@/lib/offline/sync'
import { Card, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import {
  IconAttendance,
  IconCelebrate,
  IconClassroom,
  IconDeadlines,
  IconGrades,
  IconImport,
  IconSchedule,
  IconSubjects,
  IconWarning,
  type IconProps,
} from '@/components/ui/icon'
import { Watermark } from '@/components/ui/watermark'
import { IconTile, type Tone } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { Row, RowList, RowPill } from '@/components/ui/row'
import { AttendancePrompt } from '@/components/today/attendance-prompt'
import { SuspensionCard } from '@/components/today/suspension-card'
import { UpNextCard } from '@/components/today/up-next-card'
import { DepartureCard } from '@/components/today/departure-card'
import { WeekStrip } from '@/components/today/week-strip'

/**
 * Today.
 *
 * A greeting and the week at a glance, the one card that says where to be
 * next, then a single feed of whatever needs an answer — overdue work, things
 * due soon, subjects near their cut limit, classes not yet logged — and three
 * numbers at the foot for the rest of the app. A student who opens this, sees
 * what they need and closes it in eight seconds is the success case, so
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

  return (
    <div className="app-container stack pb-6 pt-4">
      <header>
        <h2 className="text-[2rem] font-bold leading-[1.1] tracking-[-0.03em]">
          {greeting()}
          {firstName ? (
            <>
              ,<br />
              <span className="text-[var(--accent)]">{firstName}</span>
            </>
          ) : null}
        </h2>
        <p className="sr-only">{summarise(data, now)}</p>
        <p aria-hidden className="mt-2 text-[0.9375rem] font-medium text-[var(--label-secondary)]">
          {headline(data, now)}
        </p>
      </header>

      {data.overview.hasSchedule && <WeekStrip week={data.week} />}

      {/* Above everything below the strip, because it changes what the rest of
          the day means — but it never changes a record on its own. */}
      {data.advisory && (
        <SuspensionCard
          advisory={data.advisory}
          blocks={data.blocks}
          sessionDate={data.date}
          standings={data.standings}
          onRecorded={reload}
        />
      )}

      {/* Gated on whether a schedule exists at all, not on whether one exists
          today — `blocks` is only this weekday's classes, and a Sunday is not
          a missing timetable. Without one, the import takes Up Next's place:
          it is the one button that makes the rest of the app work. */}
      {data.overview.hasSchedule ? <UpNextCard data={data} /> : <AddSchedule />}

      {data.pendingAttendance.length > 0 && (
        <section>
          <SectionHeader
            info={
              <InfoTip title="Attendance">
                Tap how each class went. Three lates count as one absence, and you get a warning
                before a subject reaches its limit.
              </InfoTip>
            }
          >
            Were you there?
          </SectionHeader>
          <div className="stack">
            {data.pendingAttendance.map((block) => (
              <AttendancePrompt
                key={block.id}
                block={block}
                sessionDate={data.date}
                standing={block.enrollmentId ? data.standings[block.enrollmentId] : null}
                onRecorded={reload}
              />
            ))}
          </div>
        </section>
      )}

      {plan && <DepartureCard plan={plan} />}

      <NeedsYou data={data} now={now} />

      {data.overview.hasSchedule && <Stats overview={data.overview} />}
    </div>
  )
}

/**
 * Everything that wants an answer, in one list.
 *
 * Overdue first, then due soon, then cuts, then the catch-up count — the order
 * a student would triage them in. Separate sections for each used to make the
 * screen a stack of headings with one row under each.
 */
function NeedsYou({ data, now }: { data: TodayData; now: Date }) {
  const urgent = [...data.overdue, ...data.dueSoon]
  const shown = urgent.slice(0, 5)
  const nothing = urgent.length === 0 && data.attendanceWarnings.length === 0 && data.catchUp.length === 0

  return (
    <section>
      <SectionHeader
        action={
          urgent.length > 0 ? (
            <Link href="/deadlines" className="type-footnote font-semibold text-[var(--accent)]">
              See all
            </Link>
          ) : undefined
        }
        info={
          <InfoTip title="Needs you">
            Anything overdue or due in the next 48 hours, subjects close to their absence limit,
            and classes you have not logged yet.
          </InfoTip>
        }
      >
        Needs you
      </SectionHeader>

      {nothing ? (
        <Row
          as="div"
          leading={<IconTile Icon={IconCelebrate} tone="green" size={36} />}
          title="You're all caught up"
          detail="Nothing due, no cuts to watch."
        />
      ) : (
        <RowList label="Needs you" className="row-list-glass">
          {shown.map((item) => (
            <DueRow key={`${item.source}-${item.id}`} item={item} now={now} />
          ))}

          {data.attendanceWarnings.map((warning) => (
            <Row
              key={warning.code}
              href="/subjects"
              leading={
                <IconTile Icon={IconWarning} tone={attendanceTone(warning.state)} size={36} />
              }
              title={<span className="type-data">{warning.code}</span>}
              meta={
                <RowPill tone={warning.remaining === 0 ? 'crimson' : undefined}>
                  {warning.remaining === 0
                    ? 'At the absence limit'
                    : `${warning.remaining} absence${warning.remaining === 1 ? '' : 's'} left`}
                </RowPill>
              }
            />
          ))}

          {data.catchUp.length > 0 && (
            <Row
              href="/subjects/catch-up"
              leading={<IconTile Icon={IconAttendance} tone="gray" size={36} />}
              title={`${data.catchUp.length} class${data.catchUp.length === 1 ? '' : 'es'} to log`}
              detail="From the past 4 weeks"
            />
          )}
        </RowList>
      )}
    </section>
  )
}

function DueRow({ item, now }: { item: TrackerItem; now: Date }) {
  const overdue = Date.parse(item.dueAt) < now.getTime()
  return (
    <Row
      href={item.href}
      leading={
        <IconTile
          Icon={item.source === 'class' ? IconClassroom : IconDeadlines}
          tone={item.source === 'class' ? 'gray' : 'crimson'}
          size={36}
        />
      }
      title={item.title}
      meta={
        <>
          <RowPill tone={overdue ? 'crimson' : undefined}>{describeTimeLeft(item.dueAt, now)}</RowPill>
          {item.sectionCode && <RowPill>{item.sectionCode}</RowPill>}
        </>
      }
    />
  )
}

/**
 * The rest of the app in three numbers. Each is a door, not a report: tap it
 * to open the screen it comes from.
 */
function Stats({ overview }: { overview: TodayData['overview'] }) {
  const stats: {
    href: string
    value: string
    label: string
    Icon: ComponentType<IconProps>
    alert?: boolean
  }[] = [
    {
      href: '/subjects/gwa',
      Icon: IconGrades,
      value: overview.gwa === null ? '—' : overview.gwa.toFixed(2),
      label: 'GWA',
    },
    { href: '/subjects', Icon: IconSubjects, value: String(overview.subjects), label: 'Subjects' },
    {
      href: '/deadlines',
      Icon: IconDeadlines,
      value: String(overview.openDeadlines),
      label: overview.overdue > 0 ? `Open · ${overview.overdue} late` : 'Open tasks',
      alert: overview.overdue > 0,
    },
  ]

  return (
    <nav aria-label="At a glance" className="grid grid-cols-3 gap-2.5">
      {stats.map((stat) => (
        <Link
          key={stat.href}
          href={stat.href as never}
          className="card-glass flex min-h-[5.5rem] flex-col items-start justify-end gap-1 px-4 py-3.5 transition-transform duration-150 active:scale-[0.97]"
        >
          <Watermark Icon={stat.Icon} size={64} />
          <span
            className="text-[1.5rem] font-bold leading-none tabular-nums tracking-[-0.03em]"
            style={{ color: stat.alert ? 'var(--accent)' : 'var(--label)' }}
          >
            {stat.value}
          </span>
          <span className="truncate text-[0.75rem] font-medium text-[var(--label-secondary)]">
            {stat.label}
          </span>
        </Link>
      ))}
    </nav>
  )
}

function AddSchedule() {
  return (
    <Card className="card-glass flex flex-col items-center gap-4 px-5 py-7 text-center">
      <IconTile Icon={IconSchedule} tone="blue" variant="solid" size={64} />
      <div>
        <p className="flex items-center justify-center gap-1.5 text-[1.1875rem] font-semibold">
          Add your schedule
          <InfoTip title="Two ways in">
            Sign in to ERS once and OneTUP reads your schedule, or copy the table from ERS and
            paste it. You check everything before it is saved.
          </InfoTip>
        </p>
        <p className="type-subheadline mt-1 text-[var(--label-secondary)]">
          Everything here builds on it.
        </p>
      </div>
      <ButtonLink href="/schedule/import" variant="accent" block leading={<IconImport size={18} />}>
        Bring in your schedule
      </ButtonLink>
    </Card>
  )
}

function TodaySkeleton() {
  return (
    <div className="app-container stack pt-4" aria-busy="true" aria-label="Loading today">
      <div className="skeleton h-20 w-64 rounded-[var(--radius-sm)]" />
      <div className="skeleton h-16 rounded-[var(--radius-lg)]" />
      <div className="skeleton h-44 rounded-[var(--radius-xl)]" />
      <div className="skeleton h-16 rounded-[var(--radius-lg)]" />
      <div className="skeleton h-16 rounded-[var(--radius-lg)]" />
    </div>
  )
}

/** The day in a few words, under the greeting. */
function headline(data: TodayData, now: Date): string {
  const parts: string[] = []
  if (data.overview.hasSchedule) {
    const remaining = data.blocks.filter((block) => block.endTime > currentTime(now)).length
    parts.push(
      remaining === 0 ? 'No classes left today' : `${remaining} class${remaining === 1 ? '' : 'es'} left`,
    )
  }
  const due = data.overdue.length + data.dueSoon.length
  if (due > 0) parts.push(`${due} due soon`)
  return parts.length > 0 ? parts.join(' · ') : 'Here is your day.'
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

/** A cut warning's state, as the tone its glyph is painted in. */
function attendanceTone(state: string): Tone {
  switch (state) {
    case 'at_limit':
      return 'crimson'
    case 'warning':
    case 'caution':
      return 'crimson'
    default:
      return 'green'
  }
}

