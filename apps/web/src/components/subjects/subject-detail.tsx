'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { Badge, Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { Button } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { AttendanceMeter, attendanceColor } from '@/components/subjects/attendance-meter'
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
 * The order is the argument again: the number that can cost a student the
 * subject sits above the number that sets their GWA, and the raw history sits
 * below both — it is evidence for the counts, not the point of the screen.
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
          <Card>
            <EmptyState title="That subject isn't in your enrolment any more." />
          </Card>
        </div>
      </>
    )
  }

  if (!data) return <DetailSkeleton />

  const { attendance, grade } = data

  return (
    <>
      <NavBar
        title={data.code}
        subtitle={data.title}
        back={{ href: '/subjects', label: 'Subjects' }}
      />

      <div className="app-container stack pb-4">
        <Card className="stack">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="type-section-header">Absences used</p>
              <p className="type-title-1 type-data mt-1">
                <span style={{ color: attendanceColor(attendance.state) }}>
                  {attendance.absenceUnits}
                </span>
                <span className="text-[var(--label-tertiary)]"> / {attendance.allowed}</span>
              </p>
            </div>
            <Button size="sm" variant="plain" onClick={() => setLimitsOpen(true)}>
              Limits
            </Button>
          </div>

          <AttendanceMeter summary={attendance} />

          <p className="type-body">{describeAttendance(attendance)}</p>

          <dl className="grid grid-cols-4 gap-2">
            <Tally label="Present" value={attendance.present} />
            <Tally label="Absent" value={attendance.absent} color="var(--danger)" />
            <Tally label="Late" value={attendance.late} color="var(--warning)" />
            <Tally label="Excused" value={attendance.excused} color="var(--info)" />
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

          <p className="type-footnote text-[var(--label-secondary)]">
            {data.allowedAbsencesOverride === null
              ? `Using your default of ${data.defaults.allowedAbsences} absences.`
              : `${data.allowedAbsencesOverride} absences set for this subject.`}
            {data.meetings.length > 0 && ` · ${describeMeetings(data.meetings)}`}
          </p>
        </Card>

        <Card className="stack">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="type-section-header">Grade</p>
              <p className="mt-1 flex items-baseline gap-2">
                {grade?.mark ? (
                  <Badge tone="neutral">{grade.mark}</Badge>
                ) : (
                  <span
                    className="type-title-1 type-data"
                    style={
                      grade?.value !== null && grade?.value !== undefined && !isPassing(grade.value)
                        ? { color: 'var(--danger)' }
                        : undefined
                    }
                  >
                    {grade?.value === null || grade?.value === undefined
                      ? '—'
                      : grade.value.toFixed(2)}
                  </span>
                )}
                <span className="type-footnote text-[var(--label-secondary)]">
                  {data.units} unit{data.units === 1 ? '' : 's'}
                </span>
              </p>
            </div>
            <Button size="sm" variant="plain" onClick={() => setGradeOpen(true)}>
              {grade && (grade.value !== null || grade.mark !== null) ? 'Change' : 'Set grade'}
            </Button>
          </div>

          {grade?.mark && (
            <p className="type-footnote text-[var(--label-secondary)]">
              A {grade.mark} has no number to average, so {data.code} and its {data.units} unit
              {data.units === 1 ? '' : 's'} are left out of your GWA.
            </p>
          )}

          {grade?.isProjected && grade.value !== null && (
            <p className="type-footnote text-[var(--label-secondary)]">
              Recorded as what you expect, not what you got. It counts in the projection only.
            </p>
          )}
        </Card>

        <ComponentEditor
          enrollmentId={enrollmentId}
          components={data.components}
          onChanged={() => void reload()}
        />

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
                  title={<span className="type-data">{formatSessionDate(record.session_date)}</span>}
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
}

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  present: 'var(--ok)',
  absent: 'var(--danger)',
  late: 'var(--warning)',
  excused: 'var(--info)',
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
    .map(
      (meeting) => `${formatWeekday(meeting.day, 'short')} ${formatTime12(meeting.startTime)}`,
    )
    .join(', ')
}

function DetailSkeleton() {
  return (
    <>
      <NavBar title="Subject" back={{ href: '/subjects', label: 'Subjects' }} />
      <div className="app-container stack" aria-busy="true" aria-label="Loading subject">
        <div className="skeleton h-44 rounded-[var(--radius-lg)]" />
        <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
        <div className="skeleton h-52 rounded-[var(--radius-lg)]" />
      </div>
    </>
  )
}
