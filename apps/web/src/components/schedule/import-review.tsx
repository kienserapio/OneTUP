'use client'

import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { WEEKDAYS, formatWeekday, type ParsedCourse, type Weekday } from '@onetup/core'
import type { ImportProposal, ReviewedCourse } from '@/lib/import/types'
import { Button } from '@/components/ui/button'
import { Card, SectionHeader } from '@/components/ui/surfaces'
import { Field } from '@/components/auth/auth-form'
import { IconClose, IconEye, IconPlus, IconWarning, IconSave } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { Select } from '@/components/ui/select'
import { TimePicker } from '@/components/ui/time-picker'
import { spring, transition } from '@/design/motion'

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
      <header className="flex items-center gap-3">
        <IconTile Icon={IconEye} tone="blue" variant="solid" size={48} />
        <div className="min-w-0">
          <h2 className="type-title-2 flex items-center gap-1.5">
            Check this over
            <InfoTip title="Nothing saved yet">
              Tap a subject to fix its code, title, units or class times. Nothing is saved until you
              say so.
            </InfoTip>
          </h2>
          <p className="type-subheadline text-[var(--label-secondary)]">
            {courses.length} subject{courses.length === 1 ? '' : 's'}, {formatUnits(totalUnits)}{' '}
            units
          </p>
        </div>
      </header>

      {flagged > 0 && (
        <p
          className="type-subheadline flex items-center gap-3 rounded-[18px] p-3 font-medium"
          style={{ background: 'var(--tone-crimson-tint)', color: 'var(--tone-crimson-ink)' }}
        >
          <IconWarning size={20} className="shrink-0" />
          {flagged} row{flagged === 1 ? '' : 's'} need{flagged === 1 ? 's' : ''} checking — marked
          below.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="type-subheadline rounded-[18px] px-3.5 py-2.5"
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
          <SectionHeader
            info={
              <InfoTip title="Unreadable rows">
                These rows didn&rsquo;t make sense to the reader. Add them by hand if you need them.
              </InfoTip>
            }
          >
            Couldn&rsquo;t read these
          </SectionHeader>
          <Card>
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
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button
          variant="accent"
          onClick={commit}
          disabled={busy}
          block
          leading={<IconSave size={18} />}
        >
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
      <Card>
        {/* Flagged by tone rather than by an outline: an amber pill above the
            code, which is the first thing the eye lands on in the card. */}
        {course.needsAttention && (
          <span
            className="type-caption-1 mb-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold"
            style={{ background: 'var(--tone-crimson-tint)', color: 'var(--tone-crimson-ink)' }}
          >
            <IconWarning size={13} />
            Check this
          </span>
        )}
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
            data-tone="gray"
            className="glyph -mr-1 grid size-10 shrink-0 place-items-center rounded-full"
          >
            <IconClose size={20} />
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
                    <Select
                      id={`${course.key}-day-${index}`}
                      value={meeting.day}
                      onChange={(value) => onMeetingChange(index, { day: value as Weekday })}
                      label="Day"
                      className="!w-[8.5rem] flex-none"
                      options={WEEKDAYS.map((day) => ({ value: day, label: formatWeekday(day) }))}
                    />

                    <label className="sr-only" htmlFor={`${course.key}-start-${index}`}>
                      Start time
                    </label>
                    <TimePicker
                      id={`${course.key}-start-${index}`}
                      value={meeting.startTime}
                      onChange={(startTime) => onMeetingChange(index, { startTime })}
                      label="Start time"
                      className="!w-[8.5rem] flex-none"
                    />

                    <label className="sr-only" htmlFor={`${course.key}-end-${index}`}>
                      End time
                    </label>
                    <TimePicker
                      id={`${course.key}-end-${index}`}
                      value={meeting.endTime}
                      onChange={(endTime) => onMeetingChange(index, { endTime })}
                      label="End time"
                      className="!w-[8.5rem] flex-none"
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
                      data-tone="gray"
                      className="glyph grid size-10 shrink-0 place-items-center rounded-full"
                    >
                      <IconClose size={20} />
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
