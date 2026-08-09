'use client'

import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { WEEKDAYS, formatWeekday, type ParsedCourse, type Weekday } from '@onetup/core'
import type { ImportProposal, ReviewedCourse } from '@/lib/import/types'
import { Button } from '@/components/ui/button'
import { Card, SectionHeader } from '@/components/ui/surfaces'
import { Field } from '@/components/auth/auth-form'
import { IconClose, IconPlus, IconWarning } from '@/components/ui/icon'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'

/**
 * The review step.
 *
 * Mandatory, and shared by onboarding, the import page and re-import. Nothing
 * is ever committed straight from a parse: the student sees every field, every
 * field is editable, and anything the parser was unsure about is called out
 * rather than quietly accepted.
 *
 * The friction is the point. An import that silently gets Thursday wrong costs
 * a student a semester of attendance data pointed at the wrong day.
 */

export interface ImportReviewProps {
  proposal: ImportProposal
  onCommit: (courses: ReviewedCourse[]) => Promise<void>
  onCancel?: () => void
  commitLabel?: string
}

interface DraftMeeting {
  day: Weekday
  startTime: string
  endTime: string
  room: string
  parseStatus: 'ok' | 'partial' | 'failed'
}

interface DraftCourse {
  key: string
  code: string
  title: string
  lecUnits: number
  labUnits: number
  units: number
  faculty: string
  rawSchedule: string
  meetings: DraftMeeting[]
  needsAttention: boolean
}

function toDraft(course: ParsedCourse, index: number): DraftCourse {
  return {
    key: `${course.code || 'row'}-${index}`,
    code: course.code,
    title: course.title,
    lecUnits: course.lecUnits,
    labUnits: course.labUnits,
    units: course.units,
    faculty: course.faculty ?? '',
    rawSchedule: course.rawSchedule,
    meetings: course.meetings.map((meeting) => ({
      day: meeting.day,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      room: meeting.room === 'TBA' ? '' : meeting.room,
      parseStatus: meeting.parseStatus,
    })),
    needsAttention: course.parseStatus !== 'ok' || course.meetings.length === 0 || !course.code,
  }
}

export function ImportReview({
  proposal,
  onCommit,
  onCancel,
  commitLabel = 'Save my schedule',
}: ImportReviewProps) {
  const [courses, setCourses] = useState<DraftCourse[]>(() => proposal.courses.map(toDraft))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const flagged = courses.filter((course) => course.needsAttention).length
  const totalUnits = useMemo(
    () => courses.reduce((sum, course) => sum + (Number.isFinite(course.units) ? course.units : 0), 0),
    [courses],
  )

  function update(key: string, patch: Partial<DraftCourse>) {
    setCourses((prev) =>
      prev.map((course) => (course.key === key ? { ...course, ...patch } : course)),
    )
  }

  function updateMeeting(key: string, index: number, patch: Partial<DraftMeeting>) {
    setCourses((prev) =>
      prev.map((course) =>
        course.key === key
          ? {
              ...course,
              meetings: course.meetings.map((meeting, i) =>
                i === index ? { ...meeting, ...patch } : meeting,
              ),
            }
          : course,
      ),
    )
  }

  function addMeeting(key: string) {
    setCourses((prev) =>
      prev.map((course) =>
        course.key === key
          ? {
              ...course,
              meetings: [
                ...course.meetings,
                { day: 'monday', startTime: '07:00', endTime: '08:30', room: '', parseStatus: 'ok' },
              ],
            }
          : course,
      ),
    )
  }

  function removeMeeting(key: string, index: number) {
    setCourses((prev) =>
      prev.map((course) =>
        course.key === key
          ? { ...course, meetings: course.meetings.filter((_, i) => i !== index) }
          : course,
      ),
    )
  }

  function addCourse() {
    setCourses((prev) => [
      ...prev,
      {
        key: `manual-${crypto.randomUUID()}`,
        code: '',
        title: '',
        lecUnits: 0,
        labUnits: 0,
        units: 3,
        faculty: '',
        rawSchedule: '',
        meetings: [
          { day: 'monday', startTime: '07:00', endTime: '08:30', room: '', parseStatus: 'ok' },
        ],
        needsAttention: true,
      },
    ])
  }

  async function commit() {
    setError(null)

    const incomplete = courses.find((course) => !course.code.trim() || course.meetings.length === 0)
    if (incomplete) {
      setError(
        incomplete.code
          ? `${incomplete.code} has no class times. Add one, or remove the subject.`
          : 'One subject still has no course code. Fill it in, or remove it.',
      )
      return
    }

    const backwards = courses.find((course) =>
      course.meetings.some((meeting) => meeting.endTime <= meeting.startTime),
    )
    if (backwards) {
      setError(`${backwards.code} has a class that ends before it starts.`)
      return
    }

    setBusy(true)
    try {
      await onCommit(
        courses.map((course) => ({
          code: course.code.trim(),
          title: course.title.trim() || course.code.trim(),
          lecUnits: course.lecUnits,
          labUnits: course.labUnits,
          units: course.units,
          faculty: course.faculty.trim() || null,
          meetings: course.meetings.map((meeting) => ({
            day: meeting.day,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            room: meeting.room.trim() || 'TBA',
          })),
        })),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <header>
        <h2 className="type-title-2">Check this over</h2>
        <p className="type-subheadline mt-1 text-[var(--label-secondary)]">
          {courses.length} subject{courses.length === 1 ? '' : 's'}, {formatUnits(totalUnits)} units.
          Nothing is saved until you say so.
        </p>
      </header>

      {flagged > 0 && (
        <Card className="flex items-start gap-3">
          <IconWarning size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
          <p className="type-subheadline">
            {flagged} row{flagged === 1 ? '' : 's'} need{flagged === 1 ? 's' : ''} checking. They are
            marked below.
          </p>
        </Card>
      )}

      {error && (
        <p
          role="alert"
          className="type-subheadline rounded-[var(--radius-sm)] px-3.5 py-2.5"
          style={{
            background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
            color: 'var(--danger)',
          }}
        >
          {error}
        </p>
      )}

      <div className="stack">
        {courses.map((course) => (
          <CourseEditor
            key={course.key}
            course={course}
            onChange={(patch) => update(course.key, patch)}
            onMeetingChange={(index, patch) => updateMeeting(course.key, index, patch)}
            onAddMeeting={() => addMeeting(course.key)}
            onRemoveMeeting={(index) => removeMeeting(course.key, index)}
            onRemove={() => setCourses((prev) => prev.filter((c) => c.key !== course.key))}
          />
        ))}
      </div>

      {proposal.unparsed.length > 0 && (
        <section>
          <SectionHeader>Couldn&rsquo;t read these</SectionHeader>
          <Card>
            <p className="type-footnote mb-3 text-[var(--label-secondary)]">
              These rows didn&rsquo;t make sense to the reader. Add them by hand if you need them.
            </p>
            <ul className="space-y-1.5">
              {proposal.unparsed.map((row, index) => (
                <li key={index} className="type-data type-footnote text-[var(--label-tertiary)]">
                  {row.cells.join(' · ')}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <Button variant="plain" onClick={addCourse} leading={<IconPlus size={18} />}>
        Add a subject
      </Button>

      <div className="flex gap-2 pt-2">
        {onCancel && (
          <Button variant="plain" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button variant="accent" onClick={commit} disabled={busy} block>
          {busy ? 'Saving…' : commitLabel}
        </Button>
      </div>

      <p className="type-caption-1 text-center text-[var(--label-tertiary)]">
        Read by {proposal.parserVersion}
      </p>
    </div>
  )
}

function CourseEditor({
  course,
  onChange,
  onMeetingChange,
  onAddMeeting,
  onRemoveMeeting,
  onRemove,
}: {
  course: DraftCourse
  onChange: (patch: Partial<DraftCourse>) => void
  onMeetingChange: (index: number, patch: Partial<DraftMeeting>) => void
  onAddMeeting: () => void
  onRemoveMeeting: (index: number) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(course.needsAttention)

  return (
    <motion.div layout transition={transition(spring.ui)}>
      <Card
        className={cx(course.needsAttention && 'ring-1')}
        {...(course.needsAttention
          ? { style: { boxShadow: 'var(--shadow-card), 0 0 0 1px var(--warning)' } }
          : {})}
      >
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="min-w-0 flex-1 text-left"
            aria-expanded={expanded}
          >
            <span className="type-headline type-data block truncate">
              {course.code || 'No course code'}
            </span>
            <span className="type-footnote block truncate text-[var(--label-secondary)]">
              {course.title || 'No title'}
            </span>
            <span className="type-footnote type-data mt-1 block text-[var(--label-tertiary)]">
              {course.meetings.length === 0
                ? 'No class times'
                : course.meetings
                    .map(
                      (meeting) =>
                        `${formatWeekday(meeting.day, 'short')} ${meeting.startTime}–${meeting.endTime}`,
                    )
                    .join(' · ')}
            </span>
          </button>

          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${course.code || 'this subject'}`}
            className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--label-secondary)]"
            style={{ background: 'var(--fill-tertiary)' }}
          >
            <IconClose size={16} />
          </button>
        </div>

        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={transition(spring.ui)}
            className="mt-4 space-y-3 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3">
              <Field
                id={`${course.key}-code`}
                label="Course code"
                value={course.code}
                onChange={(value) => onChange({ code: value })}
                spellCheck={false}
              />
              <Field
                id={`${course.key}-units`}
                label="Units"
                inputMode="numeric"
                value={String(course.units)}
                onChange={(value) => onChange({ units: Number(value) || 0 })}
              />
            </div>

            <Field
              id={`${course.key}-title`}
              label="Title"
              value={course.title}
              onChange={(value) => onChange({ title: value })}
            />

            <Field
              id={`${course.key}-faculty`}
              label="Faculty"
              value={course.faculty}
              onChange={(value) => onChange({ faculty: value })}
              placeholder="Leave blank if not assigned"
            />

            <div>
              <p className="type-subheadline mb-1.5 font-medium">Class times</p>
              <div className="space-y-2">
                {course.meetings.map((meeting, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`${course.key}-day-${index}`}>
                      Day
                    </label>
                    <select
                      id={`${course.key}-day-${index}`}
                      value={meeting.day}
                      onChange={(event) =>
                        onMeetingChange(index, { day: event.target.value as Weekday })
                      }
                      className="field w-[7.5rem] flex-none"
                    >
                      {WEEKDAYS.map((day) => (
                        <option key={day} value={day}>
                          {formatWeekday(day)}
                        </option>
                      ))}
                    </select>

                    <label className="sr-only" htmlFor={`${course.key}-start-${index}`}>
                      Start time
                    </label>
                    <input
                      id={`${course.key}-start-${index}`}
                      type="time"
                      value={meeting.startTime}
                      onChange={(event) => onMeetingChange(index, { startTime: event.target.value })}
                      className="field w-[7rem] flex-none"
                    />

                    <label className="sr-only" htmlFor={`${course.key}-end-${index}`}>
                      End time
                    </label>
                    <input
                      id={`${course.key}-end-${index}`}
                      type="time"
                      value={meeting.endTime}
                      onChange={(event) => onMeetingChange(index, { endTime: event.target.value })}
                      className="field w-[7rem] flex-none"
                    />

                    <label className="sr-only" htmlFor={`${course.key}-room-${index}`}>
                      Room
                    </label>
                    <input
                      id={`${course.key}-room-${index}`}
                      value={meeting.room}
                      placeholder="Room"
                      onChange={(event) => onMeetingChange(index, { room: event.target.value })}
                      className="field min-w-[5rem] flex-1"
                    />

                    <button
                      type="button"
                      onClick={() => onRemoveMeeting(index)}
                      aria-label="Remove this class time"
                      className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--label-secondary)]"
                      style={{ background: 'var(--fill-tertiary)' }}
                    >
                      <IconClose size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <Button
                variant="plain"
                size="sm"
                onClick={onAddMeeting}
                leading={<IconPlus size={16} />}
                className="mt-2"
              >
                Add a class time
              </Button>
            </div>

            {course.rawSchedule && (
              <p className="type-caption-1 type-data text-[var(--label-tertiary)]">
                From ERS: {course.rawSchedule}
              </p>
            )}
          </motion.div>
        )}
      </Card>
    </motion.div>
  )
}

function formatUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : units.toFixed(1)
}
