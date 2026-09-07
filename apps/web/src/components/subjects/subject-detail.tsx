'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  type AttendanceRecord,
  type AttendanceStatus,
  describeAttendance,
  formatTime12,
  formatWeekday,
  isPassing,
} from '@onetup/core'
import {
  clearGrade,
  deleteAttendanceRecord,
  loadSubjectDetail,
  saveEnrollmentLimits,
  saveGrade,
  updateAttendanceRecord,
  type SubjectDetail as SubjectDetailData,
} from '@/lib/queries/subjects'
import { readOne } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import { cx } from '@/lib/cx'
import { spring, transition } from '@/design/motion'
import { Badge, Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { Button, ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { NotFoundView } from '@/components/app/not-found-view'
import { AttendanceMeter, attendanceColor } from '@/components/subjects/attendance-meter'
import { StatCard } from '@/components/subjects/stat-card'
import {
  AttendanceRecordSheet,
  formatSessionDate,
} from '@/components/subjects/attendance-record-sheet'
import { ComponentEditor } from '@/components/subjects/component-editor'
import { GradeSheet } from '@/components/subjects/grade-sheet'
import { LimitsSheet } from '@/components/subjects/limits-sheet'

/**
 * One subject, in full.
 *
 * The strip across the top carries the two numbers that can change a decision —
 * absences spent and the grade — and everything below it is the evidence for
 * them. Above `lg` that evidence splits: attendance and its history on the
 * left, the grade and its components on the right, so a student comparing a
 * quiz weight against a cut count is not scrolling between them.
 */
export function SubjectDetail({ enrollmentId }: { enrollmentId: string }) {
  const [data, setData] = useState<SubjectDetailData | null>(null)
  const [missing, setMissing] = useState(false)
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null)
  const [gradeOpen, setGradeOpen] = useState(false)
  const [limitsOpen, setLimitsOpen] = useState(false)

  const reload = useCallback(async () => {
    const next = await loadSubjectDetail(enrollmentId, new Date())
    if (!next) setMissing(true)
    setData(next)
  }, [enrollmentId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void syncNow().then(reload)
  }, [reload])

  if (missing && !data) {
    return (
      <>
        <NavBar title="Subject" back={{ href: '/subjects', label: 'Subjects' }} />
        <div className="app-container">
          <Card padded={false}>
            <NotFoundView
              title="That subject isn't here"
              message="It is not in your enrolment for this term any more. Your other subjects are untouched."
              actions={
                <ButtonLink href="/subjects" variant="accent">
                  Back to Subjects
                </ButtonLink>
              }
            />
          </Card>
        </div>
      </>
    )
  }

  if (!data) return <DetailSkeleton />

  const { attendance, grade } = data
  const failing = grade?.value !== null && grade?.value !== undefined && !isPassing(grade.value)

  return (
    <>
      <NavBar
        title={data.code}
        subtitle={data.title}
        back={{ href: '/subjects', label: 'Subjects' }}
        trailing={
          <Button size="sm" variant="plain" onClick={() => setLimitsOpen(true)}>
            Limits
          </Button>
        }
      />

      <div className="app-container stack pb-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition(spring.ui)}
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <StatCard
            className="col-span-2"
            label="Absences used"
            value={
              <>
                <span style={{ color: attendanceColor(attendance.state) }}>
                  {attendance.absenceUnits}
                </span>
                <span className="text-[var(--label-tertiary)]">
                  {attendance.allowed > 0 ? ` / ${attendance.allowed}` : ''}
                </span>
              </>
            }
            emphasis
            note={describeAttendance(attendance)}
          />

          <StatCard
            label="Grade"
            value={
              grade?.mark ? (
                <Badge tone="neutral">{grade.mark}</Badge>
              ) : grade?.value === null || grade?.value === undefined ? (
                <span className="text-[var(--label-tertiary)]">—</span>
              ) : (
                grade.value.toFixed(2)
              )
            }
            tone={failing ? 'var(--danger)' : undefined}
            note={`${data.units} unit${data.units === 1 ? '' : 's'}${
              grade?.isProjected && grade.value !== null ? ' · expected' : ''
            }`}
          />

          <StatCard
            label="Meets"
            value={data.meetings.length}
            note={
              data.meetings.length === 0
                ? 'No blocks in your schedule'
                : describeMeetings(data.meetings)
            }
          />
        </motion.div>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="stack">
            <Card className="stack">
              <div className="flex items-baseline justify-between gap-3">
                <p className="type-section-header">Attendance</p>
                <span className="type-footnote text-[var(--label-secondary)]">
                  {data.allowedAbsencesOverride === null
                    ? `Your default of ${data.defaults.allowedAbsences}`
                    : `${data.allowedAbsencesOverride} set for this subject`}
                </span>
              </div>

              <AttendanceMeter summary={attendance} />

              {/* Cancelled only earns a column once there is one to show. A
                  permanent zero on a term with no suspensions is a column of
                  nothing taking width from four that matter. */}
              <dl className={cx('grid gap-2', attendance.cancelled > 0 ? 'grid-cols-5' : 'grid-cols-4')}>
                <Tally label="Present" value={attendance.present} />
                <Tally label="Absent" value={attendance.absent} color="var(--danger)" />
                <Tally label="Late" value={attendance.late} color="var(--warning)" />
                <Tally label="Excused" value={attendance.excused} color="var(--info)" />
                {attendance.cancelled > 0 && (
                  <Tally
                    label="Cancelled"
                    value={attendance.cancelled}
                    color="var(--label-secondary)"
                  />
                )}
              </dl>

              {attendance.late > 0 && Number.isFinite(attendance.latesUntilNextUnit) && (
                <p className="type-footnote text-[var(--label-secondary)]">
                  {data.limits.latesPerAbsence} lates make one absence, so{' '}
                  {attendance.latesUntilNextUnit} more would tip you into another.
                </p>
              )}

              {attendance.excused > 0 && (
                <p className="type-footnote text-[var(--label-secondary)]">
                  Excused absences are recorded but never counted against your limit.
                </p>
              )}
            </Card>

            <section>
              <SectionHeader>History</SectionHeader>
              {data.records.length === 0 ? (
                <Card>
                  <EmptyState title="Nothing recorded yet. Answers from the Today prompt land here." />
                </Card>
              ) : (
                <ListGroup>
                  {data.records.map((record) => (
                    <ListRow
                      key={record.id}
                      onClick={() => setEditingRecord(record)}
                      title={
                        <span className="type-data">{formatSessionDate(record.session_date)}</span>
                      }
                      subtitle={record.note ?? undefined}
                      trailing={
                        <span
                          className="type-footnote font-medium"
                          style={{ color: STATUS_COLOR[record.status] }}
                        >
                          {STATUS_LABEL[record.status]}
                        </span>
                      }
                    />
                  ))}
                </ListGroup>
              )}
            </section>
          </div>

          <div className="stack">
            <Card className="stack">
              <div className="flex items-center justify-between gap-3">
                <p className="type-section-header">Grade</p>
                <Button size="sm" variant="plain" onClick={() => setGradeOpen(true)}>
                  {grade && (grade.value !== null || grade.mark !== null) ? 'Change' : 'Set grade'}
                </Button>
              </div>

              {grade?.mark ? (
                <p className="type-footnote text-[var(--label-secondary)]">
                  A {grade.mark} has no number to average, so {data.code} and its {data.units} unit
                  {data.units === 1 ? '' : 's'} are left out of your GWA.
                </p>
              ) : grade?.isProjected && grade.value !== null ? (
                <p className="type-footnote text-[var(--label-secondary)]">
                  Recorded as what you expect, not what you got. It counts in the projection only.
                </p>
              ) : grade?.value === null || grade?.value === undefined ? (
                <p className="type-footnote text-[var(--label-secondary)]">
                  Nothing recorded. Until there is, {data.code} sits outside your GWA.
                </p>
              ) : (
                <p className="type-footnote text-[var(--label-secondary)]">
                  Counted in your GWA across {data.units} unit{data.units === 1 ? '' : 's'}.
                </p>
              )}
            </Card>

            <ComponentEditor
              enrollmentId={enrollmentId}
              components={data.components}
              onChanged={() => void reload()}
            />
          </div>
        </div>
      </div>

      <GradeSheet
        open={gradeOpen}
        onClose={() => setGradeOpen(false)}
        code={data.code}
        units={data.units}
        value={grade?.value ?? null}
        mark={grade?.mark ?? null}
        isProjected={grade?.isProjected ?? false}
        onSave={async (next) => {
          await saveGrade({
            existing: grade,
            enrollmentId,
            value: next.value,
            mark: next.mark,
            isProjected: next.isProjected,
          })
          await reload()
        }}
        onClear={
          grade
            ? async () => {
                await clearGrade(grade)
                await reload()
              }
            : undefined
        }
      />

      <LimitsSheet
        open={limitsOpen}
        onClose={() => setLimitsOpen(false)}
        code={data.code}
        defaults={data.defaults}
        allowedAbsences={data.allowedAbsencesOverride}
        latesPerAbsence={data.latesPerAbsenceOverride}
        onSave={async (next) => {
          // The queued update carries the whole enrolment row so the optimistic
          // copy in the local store stays a complete record.
          const enrollment = await readOne<{ id: string }>('enrollments', enrollmentId)
          if (!enrollment) return
          await saveEnrollmentLimits(enrollment, next)
          await reload()
        }}
      />

      <AttendanceRecordSheet
        open={editingRecord !== null}
        onClose={() => setEditingRecord(null)}
        record={editingRecord}
        onSave={async (changes) => {
          if (!editingRecord) return
          await updateAttendanceRecord(editingRecord, changes)
          await reload()
        }}
        onDelete={async () => {
          if (!editingRecord) return
          await deleteAttendanceRecord(editingRecord.id)
          await reload()
        }}
      />
    </>
  )
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
  cancelled: 'Cancelled',
}

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  present: 'var(--ok)',
  absent: 'var(--danger)',
  late: 'var(--warning)',
  excused: 'var(--info)',
  // Deliberately grey. A cancelled class is not an outcome the student caused,
  // and giving it a colour would put it in the same visual language as one.
  cancelled: 'var(--label-secondary)',
}

function Tally({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <dt className="type-caption-2 text-[var(--label-secondary)]">{label}</dt>
      <dd className="type-headline type-data" style={color ? { color } : undefined}>
        {value}
      </dd>
    </div>
  )
}

function describeMeetings(meetings: SubjectDetailData['meetings']): string {
  return meetings
    .map((meeting) => `${formatWeekday(meeting.day, 'short')} ${formatTime12(meeting.startTime)}`)
    .join(', ')
}

function DetailSkeleton() {
  return (
    <>
      <NavBar title="Subject" back={{ href: '/subjects', label: 'Subjects' }} />
      <div className="app-container stack" aria-busy="true" aria-label="Loading subject">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="skeleton col-span-2 h-28 rounded-[var(--radius-md)]" />
          <div className="skeleton h-28 rounded-[var(--radius-md)]" />
          <div className="skeleton h-28 rounded-[var(--radius-md)]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-56 rounded-[var(--radius-md)]" />
          <div className="skeleton h-40 rounded-[var(--radius-md)]" />
        </div>
      </div>
    </>
  )
}
