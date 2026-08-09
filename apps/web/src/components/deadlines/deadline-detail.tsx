'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_REMINDER_OFFSETS,
  describeTimeLeft,
  planReminders,
  subtaskProgress,
  urgencyOf,
  type Deadline,
  type DeadlineSubtask,
} from '@onetup/core'
import { readAll } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/surfaces'
import { IconCheck, IconDeadlines } from '@/components/ui/icon'
import { URGENCY_COLOR } from '@/components/deadlines/deadline-row'
import { cx } from '@/lib/cx'

/**
 * The selected deadline, shown beside the list rather than instead of it.
 *
 * This is a reading surface with the two edits a student actually makes from
 * the list — ticking a step, and finishing the thing. Anything structural
 * (retitling, moving the date, changing reminders) still goes to
 * `/deadlines/[id]`, which is the same editor a phone gets.
 */

export interface DeadlineDetailProps {
  deadline: (Deadline & { id: string }) | null
  courseCode?: string | null
  now: Date
  onComplete: (id: string) => void
}

export function DeadlineDetail({ deadline, courseCode, now, onComplete }: DeadlineDetailProps) {
  const [subtasks, setSubtasks] = useState<(DeadlineSubtask & { id: string })[]>([])
  const deadlineId = deadline?.id ?? null

  const reload = useCallback(async () => {
    if (!deadlineId) {
      setSubtasks([])
      return
    }
    const rows = await readAll<DeadlineSubtask & { id: string }>('deadline_subtasks')
    setSubtasks(
      rows
        .filter((row) => row.deadline_id === deadlineId)
        .sort((a, b) => a.ordinal - b.ordinal),
    )
  }, [deadlineId])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!deadline) {
    return (
      <Card>
        <EmptyState
          icon={<IconDeadlines size={26} />}
          title="Pick something from the list to see its steps, notes and reminders."
        />
      </Card>
    )
  }

  const urgency = urgencyOf({ dueAt: deadline.due_at, status: deadline.status }, now)
  const progress = subtaskProgress(subtasks.map((subtask) => ({ isDone: subtask.is_done })))
  const reminders =
    deadline.status === 'open'
      ? planReminders(deadline.due_at, deadline.reminder_offsets ?? DEFAULT_REMINDER_OFFSETS, now)
      : []

  async function toggle(id: string) {
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
    <div className="stack">
      <Card className="stack">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {courseCode && (
              <p className="type-data type-section-header">{courseCode}</p>
            )}
            <h2
              className={cx('type-title-2 mt-1', deadline.status === 'done' && 'line-through opacity-60')}
            >
              {deadline.title}
            </h2>
          </div>
          <span
            className="type-caption-1 type-data shrink-0 rounded-full px-2.5 py-1 font-medium"
            style={{
              background: 'var(--fill-quaternary)',
              color: URGENCY_COLOR[urgency],
            }}
          >
            {deadline.status === 'done' ? 'Done' : describeTimeLeft(deadline.due_at, now)}
          </span>
        </div>

        <p className="type-subheadline type-data text-[var(--label-secondary)]">
          Due {formatDue(deadline.due_at)}
        </p>

        {deadline.notes && <p className="type-body whitespace-pre-line">{deadline.notes}</p>}

        {deadline.source === 'announcement' && (
          <p className="type-footnote text-[var(--label-secondary)]">
            Added from an announcement someone shared.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant={deadline.status === 'done' ? 'glass' : 'accent'}
            size="sm"
            onClick={() => onComplete(deadline.id)}
            leading={deadline.status === 'done' ? undefined : <IconCheck size={17} />}
          >
            {deadline.status === 'done' ? 'Reopen' : 'Mark done'}
          </Button>
          <ButtonLink href={`/deadlines/${deadline.id}`} size="sm" variant="plain">
            Edit
          </ButtonLink>
        </div>
      </Card>

      {subtasks.length > 0 && (
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3.5">
            <p className="type-section-header">Steps</p>
            <span className="type-footnote type-data text-[var(--label-secondary)]">
              {progress.done} of {progress.total}
            </span>
          </div>

          <div
            className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full"
            style={{ background: 'var(--fill-tertiary)' }}
            role="img"
            aria-label={`${progress.done} of ${progress.total} steps done`}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress.ratio * 100}%`,
                background: progress.allDone ? 'var(--ok)' : 'var(--accent)',
              }}
            />
          </div>

          <div>
            {subtasks.map((subtask) => (
              <button
                key={subtask.id}
                type="button"
                className="list-row"
                aria-pressed={subtask.is_done}
                onClick={() => void toggle(subtask.id)}
              >
                <span
                  aria-hidden
                  className="grid size-[22px] shrink-0 place-items-center rounded-full border-2"
                  style={{
                    borderColor: subtask.is_done ? 'var(--ok)' : 'var(--label-tertiary)',
                  }}
                >
                  {subtask.is_done && <IconCheck size={13} style={{ color: 'var(--ok)' }} />}
                </span>
                <span
                  className={cx(
                    'type-subheadline flex-1 text-left',
                    subtask.is_done && 'line-through opacity-50',
                  )}
                >
                  {subtask.title}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {reminders.length > 0 && (
        <Card className="stack">
          <p className="type-section-header">Reminders</p>
          <ul className="grid gap-2">
            {reminders.map((reminder) => (
              <li
                key={reminder.offsetSeconds}
                className="type-footnote flex items-baseline justify-between gap-3"
              >
                <span>{describeOffset(reminder.offsetSeconds)}</span>
                <span className="type-data text-[var(--label-secondary)]">
                  {formatDue(reminder.fireAt.toISOString())}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function describeOffset(seconds: number): string {
  const hours = Math.round(seconds / 3_600)
  if (hours >= 24) {
    const days = Math.round(hours / 24)
    return days === 1 ? '1 day before' : `${days} days before`
  }
  return hours === 1 ? '1 hour before' : `${hours} hours before`
}

/** Manila, always — a due time in the browser's zone is a missed deadline. */
function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}
