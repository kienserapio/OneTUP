'use client'

import { useEffect, useState } from 'react'
import { manilaInstant, type Course, type Enrollment } from '@onetup/core'
import { readAll } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/auth/auth-form'
import { IconOffline } from '@/components/ui/icon'

/**
 * The New post form.
 *
 * Publishing is the one classroom write that cannot happen offline, and the
 * reason is not laziness: the dedupe index and the rate limiter both live on
 * the server, and a post queued locally would arrive hours later as either a
 * duplicate of what someone else already shared or a burst that outran the
 * limiter. So the composer says so plainly and stays shut, while reading and
 * marking submitted keep working.
 *
 * The submission-list checkbox carries its consequence in its own label rather
 * than in help text underneath, because the consequence is the decision: once
 * this post goes out the setting cannot be turned back on, and everyone in the
 * classroom will see who marked it submitted.
 */

const KINDS = [
  { value: 'note', label: 'Note' },
  { value: 'task', label: 'Task' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'exam', label: 'Exam' },
  { value: 'room_change', label: 'Room change' },
  { value: 'suspension', label: 'Suspension' },
] as const

export interface ClassPostComposerProps {
  groupId: string
  sectionCode: string
  open: boolean
  onClose: () => void
  onPublished: () => void
}

export function ClassPostComposer({
  groupId,
  sectionCode,
  open,
  onClose,
  onPublished,
}: ClassPostComposerProps) {
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [kind, setKind] = useState<string>('note')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('23:59')
  const [courseId, setCourseId] = useState('')
  const [requiresSubmission, setRequiresSubmission] = useState(false)
  const [courses, setCourses] = useState<{ id: string; code: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const online = useOnline()

  useEffect(() => {
    if (!open) return
    void (async () => {
      const [enrollments, catalog] = await Promise.all([
        readAll<Enrollment & { id: string }>('enrollments'),
        readAll<Course & { id: string }>('courses'),
      ])
      const byId = new Map(catalog.map((course) => [course.id, course.code]))
      const mine = enrollments
        .map((enrollment) => ({ id: enrollment.course_id, code: byId.get(enrollment.course_id) ?? '' }))
        .filter((course) => course.code)
        .sort((a, b) => a.code.localeCompare(b.code))
      setCourses(mine)
    })()
  }, [open])

  async function publish() {
    setBusy(true)
    setError(null)

    try {
      const response = await fetch(`/api/classrooms/${groupId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          detail: detail.trim() || undefined,
          kind,
          due_at: dueDate ? manilaInstant(dueDate, dueTime).toISOString() : null,
          course_id: courseId || null,
          requires_submission: requiresSubmission,
        }),
      })

      const body = (await response.json()) as {
        post?: { id: string } | null
        duplicate_of?: string | null
        existing_title?: string | null
        error?: { message: string }
      }

      if (!response.ok) {
        setError(body.error?.message ?? 'That did not go through. Try again.')
        return
      }

      if (body.duplicate_of) {
        setError(
          `Someone already posted this${body.existing_title ? ` — “${body.existing_title}”` : ''}. It is already in everyone's tracker.`,
        )
        return
      }

      reset()
      await syncNow()
      onPublished()
      onClose()
    } catch {
      setError('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setTitle('')
    setDetail('')
    setKind('note')
    setDueDate('')
    setDueTime('23:59')
    setCourseId('')
    setRequiresSubmission(false)
    setError(null)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Post to ${sectionCode}`}
      footer={
        <Button
          variant="accent"
          block
          disabled={!online || busy || title.trim().length === 0}
          onClick={() => void publish()}
        >
          {busy ? 'Posting…' : 'Post to the classroom'}
        </Button>
      }
    >
      <div className="stack">
        {!online && (
          <p className="offline-note">
            <IconOffline size={14} />
            You&rsquo;re offline. Posting needs a connection — everything else here still works.
          </p>
        )}

        {error && <FormError>{error}</FormError>}

        <Field
          id="post-title"
          label="What is it"
          value={title}
          onChange={setTitle}
          placeholder="Case Study 2"
          disabled={!online}
        />

        <div>
          <label htmlFor="post-detail" className="type-subheadline mb-1.5 block font-medium">
            Details <span className="text-[var(--label-tertiary)]">(optional)</span>
          </label>
          <textarea
            id="post-detail"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            rows={3}
            disabled={!online}
            className="field resize-none"
            placeholder="Anything the class needs to know."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="post-kind" className="type-subheadline mb-1.5 block font-medium">
              Kind
            </label>
            <select
              id="post-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              disabled={!online}
              className="field"
            >
              {KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="post-course" className="type-subheadline mb-1.5 block font-medium">
              Subject <span className="text-[var(--label-tertiary)]">(optional)</span>
            </label>
            <select
              id="post-course"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              disabled={!online}
              className="field"
            >
              <option value="">No subject</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="post-due-date" className="type-subheadline mb-1.5 block font-medium">
              Due <span className="text-[var(--label-tertiary)]">(optional)</span>
            </label>
            <input
              id="post-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={!online}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="post-due-time" className="type-subheadline mb-1.5 block font-medium">
              Time
            </label>
            <input
              id="post-due-time"
              type="time"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
              disabled={!online || !dueDate}
              className="field"
            />
          </div>
        </div>

        <label className="flex min-h-[var(--target-min)] items-start gap-3">
          <input
            type="checkbox"
            checked={requiresSubmission}
            onChange={(event) => setRequiresSubmission(event.target.checked)}
            disabled={!online}
            className="mt-1 size-5 shrink-0"
          />
          <span>
            <span className="type-subheadline block font-medium">Ask who has submitted</span>
            <span className="type-caption-1 block text-[var(--label-secondary)]">
              Everyone in the classroom will see who has marked this submitted. This can be turned
              off later, but never turned back on.
            </span>
          </span>
        </label>
      </div>
    </Sheet>
  )
}

/** Whether the browser currently believes it has a connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
