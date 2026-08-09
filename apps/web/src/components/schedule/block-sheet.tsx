'use client'

import { useEffect, useState } from 'react'
import {
  WEEKDAYS,
  formatWeekday,
  type ScheduleBlockRow,
  type Weekday,
} from '@onetup/core'
import { readAll, readOne } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Field } from '@/components/auth/auth-form'
import type { ScheduleBlockView } from '@/components/schedule/schedule-data'

/**
 * Creating and editing a block by hand.
 *
 * A manual block is a first-class commitment — an org meeting, a shift, a
 * standing tutorial — and behaves exactly like an imported class everywhere
 * else in the app. It carries `source = 'manual'`, which is what keeps re-sync
 * from ever touching it (TDD §3.3).
 *
 * The write is queued rather than sent, so a block added on the jeepney home
 * exists immediately and reconciles when signal returns.
 */

export interface BlockSheetProps {
  open: boolean
  onClose: () => void
  /** Null creates; a block edits it in place. */
  block: ScheduleBlockView | null
  /** Pre-selected day when creating from a specific day's screen. */
  defaultDay?: Weekday
  onSaved: () => void
}

interface Draft {
  title: string
  day: Weekday
  startTime: string
  endTime: string
  room: string
  promptAttendance: boolean
}

function draftFrom(block: ScheduleBlockView | null, defaultDay: Weekday): Draft {
  if (!block) {
    return {
      title: '',
      day: defaultDay,
      startTime: '07:00',
      endTime: '08:30',
      room: '',
      promptAttendance: true,
    }
  }
  return {
    title: block.title ?? block.label,
    day: block.day,
    startTime: block.startTime,
    endTime: block.endTime,
    room: block.room ?? '',
    promptAttendance: block.promptAttendance,
  }
}

export function BlockSheet({ open, onClose, block, defaultDay = 'monday', onSaved }: BlockSheetProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(block, defaultDay))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed whenever the sheet is opened against a different block, otherwise a
  // second edit would show the first one's values.
  useEffect(() => {
    if (open) {
      setDraft(draftFrom(block, defaultDay))
      setError(null)
    }
  }, [open, block, defaultDay])

  const editing = block !== null

  async function save() {
    setError(null)

    if (!draft.title.trim()) {
      setError('Give it a name so you know what it is at a glance.')
      return
    }
    if (draft.endTime <= draft.startTime) {
      setError('That ends before it starts.')
      return
    }

    setBusy(true)
    try {
      const userId = await currentUserId()
      if (!userId) {
        setError("We couldn't tell who you are. Sign in again and try that once more.")
        return
      }

      const now = new Date().toISOString()
      const fields = {
        title: draft.title.trim(),
        day: draft.day,
        start_time: `${draft.startTime}:00`,
        end_time: `${draft.endTime}:00`,
        room: draft.room.trim() || null,
        prompt_attendance: draft.promptAttendance,
      }

      if (editing) {
        const existing = await readOne<ScheduleBlockRow & { id: string }>(
          'schedule_blocks',
          block.id,
        )
        await queueWrite({
          entity: 'schedule_blocks',
          operation: 'update',
          payload: { id: block.id, ...fields },
          // Only patch the local row when we have the whole of it; a partial
          // record would render as a half-drawn block until the next pull.
          optimistic: existing ? { ...existing, ...fields, updated_at: now } : undefined,
        })
      } else {
        const id = crypto.randomUUID()
        const row = {
          id,
          user_id: userId,
          enrollment_id: null,
          source: 'manual',
          parse_status: 'ok',
          raw_schedule: null,
          ...fields,
        }
        await queueWrite({
          entity: 'schedule_blocks',
          operation: 'insert',
          payload: row,
          optimistic: { ...row, created_at: now, updated_at: now },
        })
      }

      onSaved()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!block) return
    setBusy(true)
    try {
      await queueWrite({
        entity: 'schedule_blocks',
        operation: 'delete',
        payload: { id: block.id },
      })
      onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit block' : 'Add a block'}
      footer={
        <div className="flex gap-2">
          {editing && (
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              Delete
            </Button>
          )}
          <Button variant="accent" block onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add it'}
          </Button>
        </div>
      }
    >
      <div className="stack">
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

        <Field
          id="block-title"
          label="What is it?"
          value={draft.title}
          onChange={(title) => setDraft((prev) => ({ ...prev, title }))}
          placeholder="Org meeting"
        />

        <div>
          <label htmlFor="block-day" className="type-subheadline mb-1.5 block font-medium">
            Day
          </label>
          <select
            id="block-day"
            value={draft.day}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, day: event.target.value as Weekday }))
            }
            className="field"
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {formatWeekday(day)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="block-start" className="type-subheadline mb-1.5 block font-medium">
              Starts
            </label>
            <input
              id="block-start"
              type="time"
              value={draft.startTime}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, startTime: event.target.value }))
              }
              className="field type-data"
            />
          </div>
          <div>
            <label htmlFor="block-end" className="type-subheadline mb-1.5 block font-medium">
              Ends
            </label>
            <input
              id="block-end"
              type="time"
              value={draft.endTime}
              onChange={(event) => setDraft((prev) => ({ ...prev, endTime: event.target.value }))}
              className="field type-data"
            />
          </div>
        </div>

        <Field
          id="block-room"
          label="Room"
          value={draft.room}
          onChange={(room) => setDraft((prev) => ({ ...prev, room }))}
          placeholder="Optional"
        />

        <label
          htmlFor="block-prompt"
          className="flex min-h-[var(--target-min)] cursor-pointer items-center justify-between gap-4"
        >
          <span>
            <span className="type-body block">Ask if I was there</span>
            <span className="type-footnote block text-[var(--label-secondary)]">
              Off for anything you don&rsquo;t track attendance for.
            </span>
          </span>
          <input
            id="block-prompt"
            type="checkbox"
            checked={draft.promptAttendance}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, promptAttendance: event.target.checked }))
            }
            className="size-6 shrink-0 accent-[var(--accent)]"
          />
        </label>
      </div>
    </Sheet>
  )
}

/**
 * The signed-in user's id, preferring a row already in the local store so a
 * block can be added with no network at all.
 */
async function currentUserId(): Promise<string | null> {
  const rows = await readAll<ScheduleBlockRow & { id: string }>('schedule_blocks')
  const local = rows.find((row) => typeof row.user_id === 'string')?.user_id
  if (local) return local

  const { data } = await supabaseBrowser().auth.getUser()
  return data.user?.id ?? null
}
