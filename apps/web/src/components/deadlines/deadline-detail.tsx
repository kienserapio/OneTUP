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
import { RowPill } from '@/components/ui/row'
import { IconAlarm, IconAnnouncement, IconCheck, IconDeadlines } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
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
      rows.filter((row) => row.deadline_id === deadlineId).sort((a, b) => a.ordinal - b.ordinal),
    )
  }, [deadlineId])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!deadline) {
    return (
      <Card>
        <EmptyState
          icon={<IconTile Icon={IconDeadlines} tone="crimson" size={52} />}
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
        <div className="flex items-center justify-between gap-3">
          <IconTile Icon={IconDeadlines} tone="crimson" size={40} />
          <span
            className="type-caption-1 type-data shrink-0 rounded-full px-3 py-1.5 font-semibold"
            style={{
              background: `color-mix(in srgb, ${URGENCY_COLOR[urgency]} 14%, transparent)`,
              color: URGENCY_COLOR[urgency],
            }}
          >
            {deadline.status === 'done' ? 'Done' : describeTimeLeft(deadline.due_at, now)}
          </span>
        </div>

        <div>
          <h2
            className={cx(
              'text-[1.5rem] font-bold leading-tight tracking-[-0.02em]',
              deadline.status === 'done' && 'line-through opacity-60',
            )}
          >
            {deadline.title}
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            {courseCode && <RowPill>{courseCode}</RowPill>}
            <RowPill>Due {formatDue(deadline.due_at)}</RowPill>
          </p>
        </div>

        {deadline.notes && <p className="type-body whitespace-pre-line">{deadline.notes}</p>}

        {deadline.source === 'announcement' && (
          <p
            className="type-footnote inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{ background: 'var(--tone-blue-tint)', color: 'var(--tone-blue-ink)' }}
          >
            <IconAnnouncement size={14} />
            From a shared announcement
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
            className="mx-4 mb-3 h-2 overflow-hidden rounded-full"
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

          <div className="flex flex-col gap-0.5">
            {subtasks.map((subtask) => (
              <button
                key={subtask.id}
                type="button"
                className="flex min-h-[44px] w-full items-center gap-3 rounded-[14px] px-1.5 py-2 text-left transition-transform active:scale-[0.98] active:bg-[var(--fill-quaternary)]"
                aria-pressed={subtask.is_done}
                onClick={() => void toggle(subtask.id)}
              >
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150"
                  style={{ background: subtask.is_done ? 'var(--ok)' : 'var(--fill-tertiary)' }}
                >
                  {subtask.is_done && <IconCheck size={14} style={{ color: 'var(--on-accent)' }} />}
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
                className="type-footnote flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2.5">
                  <IconTile Icon={IconAlarm} tone="crimson" size={28} />
                  {describeOffset(reminder.offsetSeconds)}
                </span>
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
