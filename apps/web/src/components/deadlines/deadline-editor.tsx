'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DEFAULT_REMINDER_OFFSETS,
  subtaskProgress,
  type Course,
  type Deadline,
  type DeadlineSubtask,
  type Enrollment,
} from '@onetup/core'
import { readAll } from '@/lib/offline/db'
import { queueWrite, syncNow } from '@/lib/offline/sync'
import { supabaseBrowser } from '@/lib/supabase/client'
import { scheduleDeadlineReminders, cancelDeadlineReminders } from '@/lib/notifications/client'
import { NavBar } from '@/components/app/nav-bar'
import { NotFoundView } from '@/components/app/not-found-view'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, SectionHeader } from '@/components/ui/surfaces'
import { Field, FormError } from '@/components/auth/auth-form'
import {
  IconAnnouncement,
  IconCheck,
  IconClose,
  IconDone,
  IconPlus,
  IconBack,
  IconSave,
} from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { Select } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { TimePicker } from '@/components/ui/time-picker'

/**
 * Create and edit a deadline.
 *
 * Reminder offsets are per-deadline, defaulting to 72h / 24h / 6h. Completing
 * every subtask *proposes* marking the parent done rather than doing it: the
 * student may well have one more thing to do that never made it onto the list.
 */

const REMINDER_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 259_200, label: '3 days before' },
  { seconds: 86_400, label: '1 day before' },
  { seconds: 21_600, label: '6 hours before' },
  { seconds: 3_600, label: '1 hour before' },
]

export interface DeadlineEditorProps {
  deadlineId?: string
}

export function DeadlineEditor({ deadlineId }: DeadlineEditorProps) {
  const router = useRouter()
  const isNew = !deadlineId

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('23:59')
  const [enrollmentId, setEnrollmentId] = useState('')
  const [offsets, setOffsets] = useState<number[]>([...DEFAULT_REMINDER_OFFSETS])
  const [subtasks, setSubtasks] = useState<(DeadlineSubtask & { id: string })[]>([])
  const [newSubtask, setNewSubtask] = useState('')
  const [courses, setCourses] = useState<{ id: string; code: string; title: string }[]>([])
  const [source, setSource] = useState<string>('manual')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    void (async () => {
      const [enrollments, courseRows] = await Promise.all([
        readAll<Enrollment & { id: string }>('enrollments'),
        readAll<Course & { id: string }>('courses'),
      ])
      const courseById = new Map(courseRows.map((course) => [course.id, course]))
      setCourses(
        enrollments.map((enrollment) => {
          const course = courseById.get(enrollment.course_id)
          return {
            id: enrollment.id,
            code: course?.code ?? '—',
            title: course?.title ?? '',
          }
        }),
      )

      if (!deadlineId) {
        setDueDate(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
        return
      }

      const deadlines = await readAll<Deadline & { id: string }>('deadlines')
      const deadline = deadlines.find((entry) => entry.id === deadlineId)
      // A deleted deadline, or a link someone else's phone produced. Rendering
      // an empty "edit" form here silently invited the student to re-create it
      // under an id that no longer means anything.
      if (!deadline) {
        setMissing(true)
        return
      }

      const due = new Date(deadline.due_at)
      const manila = new Date(due.getTime() + 8 * 3_600_000).toISOString()

      setTitle(deadline.title)
      setNotes(deadline.notes ?? '')
      setDueDate(manila.slice(0, 10))
      setDueTime(manila.slice(11, 16))
      setEnrollmentId(deadline.enrollment_id ?? '')
      setOffsets(deadline.reminder_offsets ?? [...DEFAULT_REMINDER_OFFSETS])
      setSource(deadline.source)

      const allSubtasks = await readAll<DeadlineSubtask & { id: string }>('deadline_subtasks')
      setSubtasks(allSubtasks.filter((subtask) => subtask.deadline_id === deadlineId))
    })()
  }, [deadlineId])

  const progress = subtaskProgress(subtasks.map((subtask) => ({ isDone: subtask.is_done })))

  async function save(status: 'open' | 'done' = 'open') {
    setError(null)
    if (!title.trim()) {
      setError('Give it a title so you know what it is later.')
      return
    }
    if (!dueDate) {
      setError('When is it due?')
      return
    }

    setBusy(true)
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setBusy(false)
      return
    }

    const dueAt = new Date(`${dueDate}T${dueTime}:00+08:00`).toISOString()
    const id = deadlineId ?? crypto.randomUUID()

    const payload = {
      id,
      user_id: userId,
      enrollment_id: enrollmentId || null,
      title: title.trim(),
      notes: notes.trim() || null,
      due_at: dueAt,
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
      source: source as never,
      reminder_offsets: offsets,
    }

    await queueWrite({
      entity: 'deadlines',
      operation: isNew ? 'insert' : 'update',
      payload,
      optimistic: { ...payload, updated_at: new Date().toISOString() },
    })

    // Reminders for something already finished are pure noise.
    const course = courses.find((entry) => entry.id === enrollmentId)
    if (status === 'done') await cancelDeadlineReminders(id)
    else await scheduleDeadlineReminders(id, title.trim(), dueAt, offsets, course?.code)

    await syncNow()
    setBusy(false)
    router.push('/deadlines')
  }

  async function remove() {
    if (!deadlineId) return
    setBusy(true)
    await cancelDeadlineReminders(deadlineId)
    await queueWrite({
      entity: 'deadlines',
      operation: 'delete',
      payload: { id: deadlineId },
    })
    await syncNow()
    router.push('/deadlines')
  }

  async function addSubtask() {
    if (!newSubtask.trim() || !deadlineId) return
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) return

    const subtask = {
      id: crypto.randomUUID(),
      user_id: userId,
      deadline_id: deadlineId,
      title: newSubtask.trim(),
      due_at: null,
      is_done: false,
      ordinal: subtasks.length,
    }

    setSubtasks((prev) => [...prev, subtask as never])
    setNewSubtask('')

    await queueWrite({
      entity: 'deadline_subtasks',
      operation: 'insert',
      payload: subtask,
      optimistic: { ...subtask, updated_at: new Date().toISOString() },
    })
  }

  async function toggleSubtask(id: string) {
    const subtask = subtasks.find((entry) => entry.id === id)
    if (!subtask) return

    const patch = { id, is_done: !subtask.is_done }
    setSubtasks((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))

    await queueWrite({
      entity: 'deadline_subtasks',
      operation: 'update',
      payload: patch,
      optimistic: { ...subtask, ...patch, updated_at: new Date().toISOString() },
    })
  }

  if (missing) {
    return (
      <>
        <NavBar
          title="Deadline"
          back={{ href: '/deadlines', label: 'Deadlines' }}
          largeTitle={false}
        />
        <div className="app-container pb-4 pt-2">
          <Card padded={false}>
            <NotFoundView
              title="That deadline isn't here"
              message="It has been deleted, or the link came from an account that is not yours."
              actions={
                <ButtonLink href="/deadlines" variant="accent" leading={<IconBack size={18} />}>
                  Back to Deadlines
                </ButtonLink>
              }
            />
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <NavBar
        title={isNew ? 'New deadline' : 'Edit deadline'}
        back={{ href: '/deadlines', label: 'Deadlines' }}
        largeTitle={false}
      />

      <div className="app-container pb-4 pt-2">
        {error && (
          <div className="pb-4">
            <FormError>{error}</FormError>
          </div>
        )}

        {/* The thing on the left, everything that fires about it on the right. */}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="stack">
            {source === 'announcement' && (
              <p
                className="type-footnote inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{ background: 'var(--tone-blue-tint)', color: 'var(--tone-blue-ink)' }}
              >
                <IconAnnouncement size={14} />
                From a shared announcement
              </p>
            )}

            <Field id="deadline-title" label="What is it?" value={title} onChange={setTitle} required />

            <div>
              <label htmlFor="deadline-course" className="type-subheadline mb-1.5 block font-medium">
                Subject
              </label>
              <Select
                id="deadline-course"
                value={enrollmentId}
                onChange={setEnrollmentId}
                label="Subject"
                options={[
                  { value: '', label: 'No subject' },
                  ...courses.map((course) => ({
                    value: course.id,
                    label: course.code,
                    description: course.title,
                  })),
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="deadline-date" className="type-subheadline mb-1.5 block font-medium">
                  Due date
                </label>
                <DatePicker
                  id="deadline-date"
                  value={dueDate}
                  onChange={setDueDate}
                  label="Due date"
                />
              </div>
              <div>
                <label htmlFor="deadline-time" className="type-subheadline mb-1.5 block font-medium">
                  Time
                </label>
                <TimePicker
                  id="deadline-time"
                  value={dueTime}
                  onChange={setDueTime}
                  label="Time"
                />
              </div>
            </div>

            <div>
              <label htmlFor="deadline-notes" className="type-subheadline mb-1.5 block font-medium">
                Notes
              </label>
              <textarea
                id="deadline-notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="field resize-none"
              />
            </div>
          </div>

          <div className="stack">
            <section>
              <SectionHeader
                info={
                  <InfoTip title="Reminders">
                    Pick as many as you like. Each one sends a notification that long before the
                    deadline, and they stop once it is marked done.
                  </InfoTip>
                }
              >
                Remind me
              </SectionHeader>
              {/* Toggle pills rather than a checklist: several can be on at
                  once, and each is one tap. */}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Reminders">
                {REMINDER_CHOICES.map((choice) => {
                  const on = offsets.includes(choice.seconds)
                  return (
                    <button
                      key={choice.seconds}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setOffsets((prev) =>
                          on
                            ? prev.filter((value) => value !== choice.seconds)
                            : [...prev, choice.seconds].sort((a, b) => b - a),
                        )
                      }
                      className="flex min-h-[var(--target-min)] items-center gap-1.5 rounded-full px-4 text-[0.875rem] font-semibold transition-colors duration-150"
                      style={{
                        background: on ? 'var(--tone-crimson-tint)' : 'var(--bg)',
                        color: on ? 'var(--tone-crimson-ink)' : 'var(--label-secondary)',
                        boxShadow: on ? 'none' : 'var(--shadow-chip)',
                      }}
                    >
                      {on && <IconCheck size={15} />}
                      {choice.label}
                    </button>
                  )
                })}
              </div>
            </section>

            {!isNew && (
              <section>
                <SectionHeader>
                  {progress.total > 0 ? `Steps · ${progress.done} of ${progress.total}` : 'Steps'}
                </SectionHeader>

                {subtasks.length > 0 && (
                  <div className="row-list">
                    {subtasks.map((subtask) => (
                      <button
                        key={subtask.id}
                        type="button"
                        className="row row-interactive"
                        aria-pressed={subtask.is_done}
                        onClick={() => void toggleSubtask(subtask.id)}
                      >
                        <span
                          aria-hidden
                          className="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150"
                          style={{
                            background: subtask.is_done ? 'var(--ok)' : 'var(--fill-tertiary)',
                          }}
                        >
                          {subtask.is_done && (
                            <IconCheck size={14} style={{ color: 'var(--on-accent)' }} />
                          )}
                        </span>
                        <span
                          className={`type-body flex-1 text-left ${subtask.is_done ? 'line-through opacity-50' : ''}`}
                        >
                          {subtask.title}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Proposed, never done for them: a student may well have one more
                    thing to do that never made it onto the list. */}
                {progress.allDone && (
                  <Card className="mt-2 flex flex-wrap items-center gap-3">
                    <IconTile Icon={IconDone} tone="green" size={36} />
                    <p className="type-subheadline flex-1 font-medium">
                      Every step is done. Mark the whole thing done?
                    </p>
                    <Button
                      size="sm"
                      variant="accent"
                      onClick={() => void save('done')}
                      disabled={busy}
                      leading={<IconCheck size={16} />}
                    >
                      Mark it done
                    </Button>
                  </Card>
                )}

                <div className="mt-2 flex gap-2">
                  <input
                    value={newSubtask}
                    onChange={(event) => setNewSubtask(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void addSubtask()
                      }
                    }}
                    placeholder="Add a step"
                    aria-label="Add a step"
                    className="field flex-1"
                  />
                  <Button
                    className="aspect-square !px-0"
                    onClick={() => void addSubtask()}
                    aria-label="Add step"
                  >
                    <IconPlus size={18} />
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {!isNew && (
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              <IconClose size={17} />
              Delete
            </Button>
          )}
          <Button
            variant="accent"
            size="lg"
            block
            onClick={() => void save()}
            disabled={busy}
            leading={isNew ? <IconPlus size={20} /> : <IconSave size={20} />}
          >
            {busy ? 'Saving…' : isNew ? 'Add it' : 'Save'}
          </Button>
        </div>
      </div>
    </>
  )
}
