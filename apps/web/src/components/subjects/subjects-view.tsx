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
import { IconClock, IconGrades, IconSubjects, IconWarning, IconImport } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { Row, RowPill } from '@/components/ui/row'
import { AttendanceMeter, CutCount } from '@/components/subjects/attendance-meter'
import { GwaRing } from '@/components/subjects/gwa-ring'
import { StatCard } from '@/components/subjects/stat-card'

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
        info={
          <InfoTip title="Subjects">
            Your GWA, your load, and how close each subject is to its absence limit. Tap a subject
            for its attendance history and grade.
          </InfoTip>
        }
        trailing={
          <ButtonLink href="/subjects/gwa" size="sm" variant="plain">
            GWA
          </ButtonLink>
        }
      />

      <div className="app-container stack pb-4">
        {data.subjects.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconTile Icon={IconSubjects} tone="crimson" variant="solid" size={56} />}
              title="No subjects yet. Import your schedule and they'll show up here."
              action={
                <ButtonLink
                  href="/schedule/import"
                  variant="accent"
                  leading={<IconImport size={18} />}
                >
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
                icon={<IconTile Icon={IconGrades} tone="gray" size={28} />}
                visual={<GwaRing value={data.cumulative.gwa} />}
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
                label="Units"
                icon={<IconTile Icon={IconSubjects} tone="gray" size={28} />}
                value={data.termUnits}
                note={`${data.subjects.length} subject${data.subjects.length === 1 ? '' : 's'}`}
              />

              <StatCard
                label="At risk"
                icon={
                  <IconTile
                    Icon={IconWarning}
                    tone={atRisk.length > 0 ? 'crimson' : 'green'}
                    size={28}
                  />
                }
                value={atRisk.length}
                tone={atRisk.length > 0 ? attendanceTone(worst) : undefined}
                note={atRisk.length === 0 ? 'All inside the limit' : 'Near the absence limit'}
              />
            </motion.div>

            {data.catchUpCount > 0 && (
              <Row
                as="div"
                href="/subjects/catch-up"
                leading={<IconTile Icon={IconClock} tone="gray" size={40} />}
                title={`${data.catchUpCount} to catch up`}
                detail="From the past 4 weeks"
                unread
              />
            )}

            <section>
              <SectionHeader
                action={
                  <span className="text-[0.8125rem] font-semibold tabular-nums text-[var(--label-tertiary)]">
                    {data.subjects.length}
                  </span>
                }
              >
                This term
              </SectionHeader>
              <SubjectGrid subjects={data.subjects} />
            </section>
          </>
        )}
      </div>
    </>
  )
}

/**
 * Every subject its own floating card: a single column on a phone, two-up
 * above `lg`. The gap does the separating; there are no hairlines.
 */
function SubjectGrid({ subjects }: { subjects: SubjectSummary[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3">
      {subjects.map((subject, index) => (
        <motion.li
          key={subject.enrollmentId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transition(spring.ui), delay: Math.min(index, 8) * 0.03 }}
        >
          <SubjectRow subject={subject} />
        </motion.li>
      ))}
    </ul>
  )
}

function SubjectRow({ subject }: { subject: SubjectSummary }) {
  const { attendance, grade } = subject

  return (
    <Link
      href={`/subjects/${subject.enrollmentId}` as never}
      className="row row-interactive !flex-col !items-stretch !gap-3 !p-4 lg:h-full"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <IconTile Icon={IconSubjects} tone="gray" size={40} />
          <span className="min-w-0">
            <span className="block truncate text-[0.9688rem] font-semibold">{subject.title}</span>
            <span className="block text-[0.75rem] font-semibold tabular-nums tracking-[0.02em] text-[var(--label-tertiary)]">
              {subject.code}
            </span>
          </span>
        </span>
        <GradeCell subject={subject} />
      </div>

      <AttendanceMeter summary={attendance} />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="flex items-baseline gap-1.5 text-[0.8125rem] text-[var(--label-secondary)]">
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
        <RowPill icon={<IconClock size={12} />}>
          {subject.next ? describeNext(subject.next) : 'No class'}
        </RowPill>
      </div>
    </Link>
  )
}

function GradeCell({ subject }: { subject: SubjectSummary }) {
  const grade = subject.grade

  if (grade?.mark) return <Badge tone="neutral">{grade.mark}</Badge>

  if (grade?.value === null || grade?.value === undefined) {
    return <span className="text-[1.25rem] font-bold text-[var(--label-tertiary)]">—</span>
  }

  return (
    <span
      className="shrink-0 rounded-full px-3 py-1 text-[1rem] font-bold tabular-nums"
      style={{ background: 'var(--tone-crimson-tint)', color: 'var(--tone-crimson-ink)' }}
    >
      {grade.value.toFixed(2)}
    </span>
  )
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
          <div className="skeleton col-span-2 h-32 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
        </div>
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-28 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      </div>
    </>
  )
}
