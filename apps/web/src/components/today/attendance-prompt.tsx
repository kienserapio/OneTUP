'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { formatTime12, type AttendanceStatus } from '@onetup/core'
import { queueWrite } from '@/lib/offline/sync'
import { deleteRecord } from '@/lib/offline/db'
import { supabaseBrowser } from '@/lib/supabase/client'
import { spring, transition } from '@/design/motion'
import { Card } from '@/components/ui/surfaces'
import type { CourseBlock } from '@/lib/queries/today'
import { cx } from '@/lib/cx'

/**
 * The one-tap attendance recorder.
 *
 * This is the canonical single-decision task in the product, and the bar it has
 * to clear is high: one tap, instant feedback, correct with no network, and
 * undoable. Anything that makes a student think twice about tapping it costs
 * the data the whole module depends on.
 *
 * The write is optimistic and queued. A student standing in a lift with no
 * signal taps once and it is recorded; the queue reconciles later, and the
 * natural key on `attendance_records` makes a replayed write update the same
 * row rather than duplicate it.
 */

const OPTIONS: { status: AttendanceStatus; label: string; color: string }[] = [
  { status: 'present', label: 'Present', color: 'var(--ok)' },
  { status: 'absent', label: 'Absent', color: 'var(--danger)' },
  { status: 'late', label: 'Late', color: 'var(--warning)' },
  { status: 'excused', label: 'Excused', color: 'var(--info)' },
]

export interface AttendancePromptProps {
  block: CourseBlock
  sessionDate: string
  onRecorded?: () => void
}

export function AttendancePrompt({ block, sessionDate, onRecorded }: AttendancePromptProps) {
  const [recorded, setRecorded] = useState<{ status: AttendanceStatus; id: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function record(status: AttendanceStatus) {
    if (!block.enrollmentId || busy) return
    setBusy(true)

    const id = crypto.randomUUID()
    const { data } = await supabaseBrowser().auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setBusy(false)
      return
    }

    await queueWrite({
      entity: 'attendance_records',
      operation: 'insert',
      payload: {
        id,
        user_id: userId,
        enrollment_id: block.enrollmentId,
        block_id: block.id,
        session_date: sessionDate,
        status,
        recorded_via: 'prompt',
      },
      optimistic: {
        id,
        user_id: userId,
        enrollment_id: block.enrollmentId,
        block_id: block.id,
        session_date: sessionDate,
        status,
        recorded_via: 'prompt',
        updated_at: new Date().toISOString(),
      },
    })

    setRecorded({ status, id })
    setBusy(false)
  }

  async function undo() {
    if (!recorded) return
    await deleteRecord('attendance_records', recorded.id)
    await queueWrite({
      entity: 'attendance_records',
      operation: 'delete',
      payload: { id: recorded.id },
    })
    setRecorded(null)
  }

  if (recorded) {
    const option = OPTIONS.find((o) => o.status === recorded.status)!
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition(spring.snap)}
      >
        <Card className="flex items-center gap-3">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: option.color }}
          />
          <p className="type-subheadline flex-1">
            <span className="type-data">{block.label}</span> marked {option.label.toLowerCase()}.
          </p>
          <button
            type="button"
            onClick={undo}
            className="type-subheadline min-h-[var(--target-min)] px-1 font-medium text-[var(--accent)]"
          >
            Undo
          </button>
        </Card>
      </motion.div>
    )
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-headline">
          <span className="type-data">{block.label}</span>
        </h3>
        <span className="type-footnote type-data text-[var(--label-secondary)]">
          {formatTime12(block.startTime)}
          {block.room ? ` · ${block.room}` : ''}
        </span>
      </div>

      <div
        role="group"
        aria-label={`Attendance for ${block.label}`}
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {OPTIONS.map((option) => (
          <motion.button
            key={option.status}
            type="button"
            disabled={busy}
            onClick={() => void record(option.status)}
            whileTap={{ scale: 0.96 }}
            transition={transition(spring.snap)}
            className={cx(
              'glass glass-sm min-h-[var(--target-min)] justify-center',
              'text-[0.9375rem]',
            )}
            style={{ color: option.color }}
          >
            {option.label}
          </motion.button>
        ))}
      </div>
    </Card>
  )
}
