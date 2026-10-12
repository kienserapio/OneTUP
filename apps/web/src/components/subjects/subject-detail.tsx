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
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { Row, RowList } from '@/components/ui/row'
import { Button, ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { NotFoundView } from '@/components/app/not-found-view'
import { AttendanceMeter, attendanceColor } from '@/components/subjects/attendance-meter'
import { StatCard } from '@/components/subjects/stat-card'
import { IconAttendance, IconGrades, IconSchedule, IconBack } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
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
                <ButtonLink href="/subjects" variant="accent" leading={<IconBack size={18} />}>
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
            icon={<IconTile Icon={IconAttendance} tone="gray" size={28} />}
            visual={
              /* With no limit the meter falls back to the same sentence as the
                 note, so it would only say it twice. */
              attendance.allowed > 0 ? <AttendanceMeter summary={attendance} /> : undefined
            }
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
            icon={<IconTile Icon={IconGrades} tone="gray" size={28} />}
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
            icon={<IconTile Icon={IconSchedule} tone="blue" size={28} />}
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
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <IconTile Icon={IconAttendance} tone="gray" size={32} />
                  <p className="type-section-header">Attendance</p>
                  {attendance.excused > 0 && (
                    <InfoTip title="Excused">
                      Excused absences are recorded but never counted against your limit.
                    </InfoTip>
                  )}
                </span>
                <span className="type-footnote text-[var(--label-secondary)]">
                  {data.allowedAbsencesOverride === null
                    ? `Default ${data.defaults.allowedAbsences}`
                    : `${data.allowedAbsencesOverride} for this subject`}
                </span>
              </div>

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

            </Card>

            <section>
              <SectionHeader>History</SectionHeader>
              {data.records.length === 0 ? (
                <Card>
                  <EmptyState title="Nothing recorded yet. Answers from the Today prompt land here." />
                </Card>
              ) : (
                <RowList label="Attendance history">
                  {data.records.map((record) => (
                    <Row
                      key={record.id}
                      onClick={() => setEditingRecord(record)}
                      leading={
                        <span
                          aria-hidden
                          className="block size-2.5 rounded-full"
                          style={{ background: STATUS_COLOR[record.status] }}
                        />
                      }
                      title={<span className="tabular-nums">{formatSessionDate(record.session_date)}</span>}
                      detail={record.note ?? undefined}
                      trailing={
                        <span
                          className="rounded-full px-2.5 py-1 text-[0.75rem] font-semibold"
                          style={{
                            color: STATUS_COLOR[record.status],
                            background: `color-mix(in srgb, ${STATUS_COLOR[record.status]} 12%, transparent)`,
                          }}
                        >
                          {STATUS_LABEL[record.status]}
                        </span>
                      }
                    />
                  ))}
                </RowList>
              )}
            </section>
          </div>

          <div className="stack">
            <Card className="stack">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <IconTile Icon={IconGrades} tone="gray" size={32} />
                  <p className="type-section-header">Grade</p>
                </span>
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

/** One count on a tinted tile of its own status colour — the number first,
 * the word under it. */
function Tally({ label, value, color }: { label: string; value: number; color?: string }) {
  // No coloured wells: the count is plain ink, and a small dot carries the
  // status colour so five tallies do not read as five competing badges.
  const tint = color ?? 'var(--ok)'
  return (
    <div className="flex flex-col-reverse items-center py-1">
      <dt className="flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--label-secondary)]">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: tint }} />
        {label}
      </dt>
      <dd className="text-[1.375rem] font-bold tabular-nums">{value}</dd>
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
          <div className="skeleton col-span-2 h-28 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-56 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-40 rounded-[var(--radius-lg)]" />
        </div>
      </div>
    </>
  )
}
