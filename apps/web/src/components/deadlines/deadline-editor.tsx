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
import { Button } from '@/components/ui/button'
import { Card, ListGroup, SectionHeader } from '@/components/ui/surfaces'
import { Field, FormError } from '@/components/auth/auth-form'
import { IconCheck, IconClose, IconPlus } from '@/components/ui/icon'

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
      if (!deadline) return

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

  async function save() {
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
      status: 'open' as const,
      source: source as never,
      reminder_offsets: offsets,
    }

    await queueWrite({
      entity: 'deadlines',
      operation: isNew ? 'insert' : 'update',
      payload,
      optimistic: { ...payload, updated_at: new Date().toISOString() },
    })

    const course = courses.find((entry) => entry.id === enrollmentId)
    await scheduleDeadlineReminders(id, title.trim(), dueAt, offsets, course?.code)

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

  return (
    <>
      <NavBar
        title={isNew ? 'New deadline' : 'Edit deadline'}
        back={{ href: '/deadlines', label: 'Deadlines' }}
        largeTitle={false}
      />

      <div className="app-container stack pt-2">
        {error && <FormError>{error}</FormError>}

        {source === 'announcement' && (
          <Card>
            <p className="type-footnote text-[var(--label-secondary)]">
              Added from an announcement someone shared.
            </p>
          </Card>
        )}

        <Field id="deadline-title" label="What is it?" value={title} onChange={setTitle} required />

        <div>
          <label htmlFor="deadline-course" className="type-subheadline mb-1.5 block font-medium">
            Subject
          </label>
          <select
            id="deadline-course"
            value={enrollmentId}
            onChange={(event) => setEnrollmentId(event.target.value)}
            className="field"
          >
            <option value="">No subject</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} — {course.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="deadline-date" className="type-subheadline mb-1.5 block font-medium">
              Due date
            </label>
            <input
              id="deadline-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="deadline-time" className="type-subheadline mb-1.5 block font-medium">
              Time
            </label>
            <input
              id="deadline-time"
              type="time"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
              className="field"
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

        <section>
          <SectionHeader>Remind me</SectionHeader>
          <ListGroup>
            {REMINDER_CHOICES.map((choice) => {
              const on = offsets.includes(choice.seconds)
              return (
                <button
                  key={choice.seconds}
                  type="button"
                  className="list-row"
                  aria-pressed={on}
                  onClick={() =>
                    setOffsets((prev) =>
                      on
                        ? prev.filter((value) => value !== choice.seconds)
                        : [...prev, choice.seconds].sort((a, b) => b - a),
                    )
                  }
                >
                  <span className="type-body flex-1 text-left">{choice.label}</span>
                  {on && <IconCheck size={20} style={{ color: 'var(--accent)' }} />}
                </button>
              )
            })}
          </ListGroup>
        </section>

        {!isNew && (
          <section>
            <SectionHeader>
              {progress.total > 0 ? `Steps · ${progress.done} of ${progress.total}` : 'Steps'}
            </SectionHeader>

            {subtasks.length > 0 && (
              <ListGroup>
                {subtasks.map((subtask) => (
                  <button
                    key={subtask.id}
                    type="button"
                    className="list-row"
                    onClick={() => void toggleSubtask(subtask.id)}
                  >
                    <span
                      aria-hidden
                      className="grid size-[22px] shrink-0 place-items-center rounded-full border-2"
                      style={{ borderColor: 'var(--label-tertiary)' }}
                    >
                      {subtask.is_done && (
                        <IconCheck size={13} style={{ color: 'var(--ok)' }} />
                      )}
                    </span>
                    <span
                      className={`type-body flex-1 text-left ${subtask.is_done ? 'line-through opacity-50' : ''}`}
                    >
                      {subtask.title}
                    </span>
                  </button>
                ))}
              </ListGroup>
            )}

            {progress.allDone && (
              <Card className="mt-2 flex items-center gap-3">
                <p className="type-subheadline flex-1">Every step is done. Mark the whole thing done?</p>
                <Button size="sm" variant="plain" onClick={() => void save()}>
                  Not yet
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
              <Button onClick={() => void addSubtask()} aria-label="Add step">
                <IconPlus size={18} />
              </Button>
            </div>
          </section>
        )}

        <div className="flex gap-2 pt-2">
          {!isNew && (
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              <IconClose size={17} />
              Delete
            </Button>
          )}
          <Button variant="accent" block onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add it' : 'Save'}
          </Button>
        </div>
      </div>
    </>
  )
}
