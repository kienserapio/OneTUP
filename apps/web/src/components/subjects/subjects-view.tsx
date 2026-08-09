'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import {
  type AttendanceState,
  computeGwa,
  formatGwa,
  formatTime12,
  formatWeekday,
} from '@onetup/core'
import { loadSubjects, type SubjectSummary, type SubjectsData } from '@/lib/queries/subjects'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { IconClock } from '@/components/ui/icon'
import { AttendanceMeter, CutCount } from '@/components/subjects/attendance-meter'
import { StatCard } from '@/components/subjects/stat-card'
import { cx } from '@/lib/cx'

/**
 * Subjects.
 *
 * The screen opens with the three numbers a student came to check — where their
 * GWA stands, what they are carrying, and how many subjects are close to the
 * absence limit — and only then the per-subject detail. On a phone that detail
 * is a single dense list; on a desktop the same rows become a two-up card grid,
 * because a 68rem column stretched into one list is wasted width, not density.
 *
 * This screen shows one student's record — their own. There is no path from
 * here, or from anywhere in the product, to anyone else's (TDD §4.5).
 */
export function SubjectsView() {
  const [data, setData] = useState<SubjectsData | null>(null)

  const reload = useCallback(async () => {
    setData(await loadSubjects(new Date()))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void syncNow().then(reload)
  }, [reload])

  if (!data) return <SubjectsSkeleton />

  const term = computeGwa(
    data.subjects.map((subject) => ({
      enrollmentId: subject.enrollmentId,
      code: subject.code,
      units: subject.units,
      value: subject.grade?.isProjected ? null : (subject.grade?.value ?? null),
      mark: subject.grade?.mark ?? null,
    })),
  )

  const atRisk = data.subjects.filter((subject) => isAtRisk(subject.attendance.state))
  const worst = atRisk.reduce<AttendanceState>(
    (state, subject) => (subject.attendance.state === 'at_limit' ? 'at_limit' : state),
    'warning',
  )

  return (
    <>
      <NavBar
        title="Subjects"
        subtitle={data.termLabel ?? undefined}
        trailing={
          <ButtonLink href="/subjects/gwa" size="sm" variant="plain">
            GWA and targets
          </ButtonLink>
        }
      />

      <div className="app-container stack pb-4">
        {data.subjects.length === 0 ? (
          <Card>
            <EmptyState
              title="No subjects yet. Import your schedule and they'll show up here."
              action={
                <ButtonLink href="/schedule/import" variant="accent">
                  Bring in your schedule
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition(spring.ui)}
              className="grid grid-cols-2 gap-3 lg:grid-cols-4"
            >
              <StatCard
                className="col-span-2"
                label="Cumulative GWA"
                value={formatGwa(data.cumulative.gwa)}
                emphasis
                href="/subjects/gwa"
                note={
                  data.cumulative.gwa === null
                    ? 'No grades recorded yet'
                    : `Over ${data.cumulative.gradedUnits} graded unit${
                        data.cumulative.gradedUnits === 1 ? '' : 's'
                      }${term.gwa === null ? '' : ` · ${formatGwa(term.gwa)} this term`}`
                }
              />

              <StatCard
                label="Units this term"
                value={data.termUnits}
                note={`${data.subjects.length} subject${data.subjects.length === 1 ? '' : 's'}`}
              />

              <StatCard
                label="At risk"
                value={atRisk.length}
                tone={atRisk.length > 0 ? attendanceTone(worst) : undefined}
                note={
                  atRisk.length === 0
                    ? 'Every subject is inside its limit'
                    : `Near or at the absence limit`
                }
              />
            </motion.div>

            {data.catchUpCount > 0 && (
              <Card className="flex flex-wrap items-center gap-3">
                <IconClock size={22} className="shrink-0 text-[var(--label-secondary)]" />
                <p className="type-subheadline flex-1">
                  {data.catchUpCount} class{data.catchUpCount === 1 ? '' : 'es'} from the past week
                  still need an answer.
                </p>
                <ButtonLink href="/subjects/catch-up" size="sm" variant="plain">
                  Catch up
                </ButtonLink>
              </Card>
            )}

            <section>
              <SectionHeader>This term</SectionHeader>
              <SubjectGrid subjects={data.subjects} />
            </section>
          </>
        )}
      </div>
    </>
  )
}

/**
 * One list on a phone, a two-up grid above `lg`.
 *
 * Deliberately one DOM tree rather than a mobile copy and a desktop copy: the
 * separators, radius and border move to the breakpoint instead, so there is
 * only ever one focusable row per subject.
 */
function SubjectGrid({ subjects }: { subjects: SubjectSummary[] }) {
  return (
    <ul
      className={cx(
        'squircle overflow-hidden rounded-[var(--radius-md)] border border-[var(--separator)]',
        'divide-y divide-[var(--separator)]',
        'lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:overflow-visible',
        'lg:rounded-none lg:border-0',
      )}
    >
      {subjects.map((subject) => (
        <li
          key={subject.enrollmentId}
          className="squircle lg:rounded-[var(--radius-md)] lg:border lg:border-[var(--separator)]"
        >
          <SubjectRow subject={subject} />
        </li>
      ))}
    </ul>
  )
}

function SubjectRow({ subject }: { subject: SubjectSummary }) {
  const { attendance, grade } = subject

  return (
    <Link
      href={`/subjects/${subject.enrollmentId}` as never}
      className="flex min-h-[var(--target-min)] flex-col gap-2.5 px-4 py-3.5 lg:h-full"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="type-headline type-data shrink-0">{subject.code}</span>
          <span className="type-subheadline truncate text-[var(--label-secondary)]">
            {subject.title}
          </span>
        </span>
        <GradeCell subject={subject} />
      </div>

      <AttendanceMeter summary={attendance} />

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="type-footnote flex items-baseline gap-1.5 text-[var(--label-secondary)]">
          <CutCount summary={attendance} />
          <span>
            {attendance.allowed > 0
              ? `absence${attendance.absenceUnits === 1 ? '' : 's'} used`
              : 'no limit set'}
          </span>
          {grade?.isProjected && grade.value !== null && (
            <span className="type-caption-2 text-[var(--label-tertiary)]">· grade expected</span>
          )}
        </span>
        <span className="type-footnote type-data text-[var(--label-secondary)]">
          {subject.next ? describeNext(subject.next) : 'No class scheduled'}
        </span>
      </div>
    </Link>
  )
}

function GradeCell({ subject }: { subject: SubjectSummary }) {
  const grade = subject.grade

  if (grade?.mark) return <Badge tone="neutral">{grade.mark}</Badge>

  if (grade?.value === null || grade?.value === undefined) {
    return <span className="type-headline type-data text-[var(--label-tertiary)]">—</span>
  }

  return <span className="type-headline type-data shrink-0">{grade.value.toFixed(2)}</span>
}

/** Warning and at-limit are the two states a student can still act on. */
function isAtRisk(state: AttendanceState): boolean {
  return state === 'warning' || state === 'at_limit'
}

function attendanceTone(state: AttendanceState): string {
  return state === 'at_limit' ? 'var(--danger)' : 'var(--warning)'
}

function describeNext(next: NonNullable<SubjectSummary['next']>): string {
  const time = formatTime12(next.startTime)
  return next.isToday ? `Today ${time}` : `${formatWeekday(next.day, 'short')} ${time}`
}

function SubjectsSkeleton() {
  return (
    <>
      <NavBar title="Subjects" />
      <div className="app-container stack" aria-busy="true" aria-label="Loading subjects">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="skeleton col-span-2 h-28 rounded-[var(--radius-md)]" />
          <div className="skeleton h-28 rounded-[var(--radius-md)]" />
          <div className="skeleton h-28 rounded-[var(--radius-md)]" />
        </div>
        <div className="skeleton h-64 rounded-[var(--radius-md)]" />
      </div>
    </>
  )
}
