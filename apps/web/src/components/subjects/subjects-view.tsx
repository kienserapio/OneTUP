'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { computeGwa, formatGwa, formatTime12, formatWeekday } from '@onetup/core'
import { loadSubjects, type SubjectSummary, type SubjectsData } from '@/lib/queries/subjects'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Badge, Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { IconClock } from '@/components/ui/icon'
import { CutCount, StateDot } from '@/components/subjects/attendance-meter'

/**
 * Subjects.
 *
 * One row per enrolled course, and the row answers the two questions a student
 * actually opens this screen with: how close am I to the absence limit, and
 * what am I sitting at. Everything else is a tap away.
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

  const gwa = computeGwa(
    data.subjects.map((subject) => ({
      enrollmentId: subject.enrollmentId,
      code: subject.code,
      units: subject.units,
      value: subject.grade?.isProjected ? null : (subject.grade?.value ?? null),
      mark: subject.grade?.mark ?? null,
    })),
  )

  return (
    <>
      <NavBar title="Subjects" subtitle={data.termLabel ?? undefined} />

      <div className="app-container stack pb-4">
        {data.catchUpCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition(spring.ui)}
          >
            <Card className="flex items-center gap-3">
              <IconClock size={22} className="shrink-0 text-[var(--label-secondary)]" />
              <p className="type-subheadline flex-1">
                {data.catchUpCount} class{data.catchUpCount === 1 ? '' : 'es'} from the past week
                still need an answer.
              </p>
              <ButtonLink href="/subjects/catch-up" size="sm" variant="plain">
                Catch up
              </ButtonLink>
            </Card>
          </motion.div>
        )}

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
            <section>
              <SectionHeader>This term</SectionHeader>
              <ListGroup>
                {data.subjects.map((subject) => (
                  <SubjectRow key={subject.enrollmentId} subject={subject} />
                ))}
              </ListGroup>
            </section>

            <ListGroup>
              <ListRow
                href="/subjects/gwa"
                title="GWA and targets"
                subtitle={
                  gwa.gwa === null
                    ? 'No grades in yet'
                    : `Across ${gwa.gradedUnits} unit${gwa.gradedUnits === 1 ? '' : 's'}`
                }
                trailing={<span className="type-body type-data">{formatGwa(gwa.gwa)}</span>}
              />
            </ListGroup>
          </>
        )}
      </div>
    </>
  )
}

function SubjectRow({ subject }: { subject: SubjectSummary }) {
  return (
    <ListRow
      href={`/subjects/${subject.enrollmentId}`}
      leading={<StateDot state={subject.attendance.state} />}
      title={
        <span className="flex items-baseline gap-2">
          <span className="type-data font-medium">{subject.code}</span>
          <span className="truncate text-[var(--label-secondary)]">{subject.title}</span>
        </span>
      }
      subtitle={
        <span className="flex items-baseline gap-1.5">
          <CutCount summary={subject.attendance} />
          <span>cuts</span>
          {subject.next && (
            <span className="truncate">
              · {describeNext(subject.next)}
            </span>
          )}
        </span>
      }
      trailing={<GradeCell subject={subject} />}
    />
  )
}

function GradeCell({ subject }: { subject: SubjectSummary }) {
  const grade = subject.grade

  if (grade?.mark) {
    return <Badge tone="neutral">{grade.mark}</Badge>
  }

  if (grade?.value === null || grade?.value === undefined) {
    return <span className="type-data text-[var(--label-tertiary)]">—</span>
  }

  return (
    <span className="flex items-baseline gap-1.5">
      {grade.isProjected && <span className="type-caption-2 text-[var(--label-tertiary)]">est.</span>}
      <span className="type-body type-data">{grade.value.toFixed(2)}</span>
    </span>
  )
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
        <div className="skeleton h-16 rounded-[var(--radius-lg)]" />
        <div className="skeleton h-64 rounded-[var(--radius-lg)]" />
      </div>
    </>
  )
}
