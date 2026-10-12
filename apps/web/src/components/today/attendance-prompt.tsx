'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { formatTime12, type AttendanceStatus } from '@onetup/core'
import { queueWrite } from '@/lib/offline/sync'
import { deleteRecord } from '@/lib/offline/db'
import { supabaseBrowser } from '@/lib/supabase/client'
import { spring, transition } from '@/design/motion'
import { Card } from '@/components/ui/surfaces'
import {
  IconAttendance,
  IconCancelled,
  IconCheck,
  IconClock,
  IconClose,
  IconShield,
} from '@/components/ui/icon'
import { IconTile, type Tone } from '@/components/ui/icon-tile'
import type { AttendanceStanding, CourseBlock } from '@/lib/queries/today'
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

interface Option {
  status: AttendanceStatus
  label: string
  /** The tone's saturated colour, for dots and the confirmation. */
  color: string
  /** Tint behind the pill and the ink its icon and label are set in. */
  tint: string
  ink: string
  /** The glyph's colour. */
  tone: Tone
  Icon: typeof IconCheck
}

/** The four answers about the student. One tap, four targets, no scrolling. */
const OPTIONS: Option[] = [
  {
    status: 'present',
    label: 'Present',
    color: 'var(--tone-green)',
    tint: 'var(--tone-green-tint)',
    ink: 'var(--tone-green-ink)',
    tone: 'green',
    Icon: IconCheck,
  },
  {
    status: 'absent',
    label: 'Absent',
    color: 'var(--tone-crimson)',
    tint: 'var(--tone-crimson-tint)',
    ink: 'var(--tone-crimson-ink)',
    tone: 'crimson',
    Icon: IconClose,
  },
  {
    status: 'late',
    label: 'Late',
    color: 'var(--tone-crimson)',
    tint: 'var(--tone-crimson-tint)',
    ink: 'var(--tone-crimson-ink)',
    tone: 'crimson',
    Icon: IconClock,
  },
  {
    status: 'excused',
    label: 'Excused',
    color: 'var(--tone-gray)',
    tint: 'var(--tone-gray-tint)',
    ink: 'var(--tone-gray-ink)',
    tone: 'gray',
    Icon: IconShield,
  },
]

/**
 * The fifth answer is not about the student at all — the class did not happen.
 * It sits apart from the other four and below them because it is a different
 * kind of statement, and because a suspension is rarer than a normal day: the
 * common answers keep the top row and the full-width target.
 */
const CANCELLED: Option = {
  status: 'cancelled',
  label: 'Class cancelled',
  color: 'var(--tone-gray)',
  tint: 'var(--tone-gray-tint)',
  ink: 'var(--tone-gray-ink)',
  tone: 'gray',
  Icon: IconCancelled,
}

const ALL_OPTIONS = [...OPTIONS, CANCELLED]

/**
 * The two answers a suspension day actually poses.
 *
 * On an ordinary day the question is "were you there", with four shades of
 * answer. On a suspension day it is "did this one go ahead", and there are only
 * two honest replies: it moved online and I was in it, or it did not happen.
 * Late and Excused have no meaning about a class that was never held.
 */
const COMPACT_OPTIONS: Option[] = [
  OPTIONS[0], // present — relabelled "Attended online" when the mode says so
  CANCELLED,
]

/** The meter tracks the same three states the Subjects screen uses, so a colour
 * means the same thing wherever a student sees it. */
const STATE_COLOR: Record<string, string> = {
  normal: 'var(--ok)',
  caution: 'var(--caution)',
  warning: 'var(--warning)',
  exceeded: 'var(--danger)',
}

export interface AttendancePromptProps {
  block: CourseBlock
  sessionDate: string
  /** Where this subject stands on cuts. Optional: a block with no enrolment
   * behind it has no standing to show, and that is not an error. */
  standing?: AttendanceStanding | null
  onRecorded?: () => void
  /**
   * How the session was actually held, when it differs from normal.
   *
   * Set to `'online'` by the suspension card: a signal-2 announcement moves as
   * many classes online as it cancels, and the two are different facts about
   * the same day. Null — the ordinary case — records nothing, because "as
   * scheduled" is not worth a column value.
   */
  deliveryMode?: 'f2f' | 'online' | null
  /** Narrower copy for the suspension card, where the question is not "were
   *  you there" but "did this one go ahead". */
  compact?: boolean
}

export function AttendancePrompt({
  block,
  sessionDate,
  standing,
  onRecorded,
  deliveryMode = null,
  compact = false,
}: AttendancePromptProps) {
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
        delivery_mode: deliveryMode,
      },
      optimistic: {
        id,
        user_id: userId,
        enrollment_id: block.enrollmentId,
        block_id: block.id,
        session_date: sessionDate,
        status,
        recorded_via: 'prompt',
        delivery_mode: deliveryMode,
        updated_at: new Date().toISOString(),
      },
    })

    setRecorded({ status, id })
    setBusy(false)

    /* Today passes its own `reload` here. Without this call the cut count and
     * the attendance warning beside this prompt kept the figures they were
     * rendered with, so a student who marked themselves absent watched the
     * screen agree with them and then show the old number. */
    onRecorded?.()
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
    onRecorded?.()
  }

  if (recorded) {
    const option = ALL_OPTIONS.find((o) => o.status === recorded.status)!
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition(spring.snap)}
      >
        <Card className="card-glass flex items-center gap-3">
          <motion.span
            aria-hidden
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            transition={transition(spring.flick)}
            data-tone={option.tone}
            className="glyph grid size-10 shrink-0 place-items-center"
          >
            <option.Icon size={28} />
          </motion.span>
          <p className="type-subheadline flex-1">
            {option.status === 'cancelled' ? (
              <>
                <span className="type-data">{block.label}</span> was cancelled. It does not count
                either way.
              </>
            ) : option.status === 'present' && deliveryMode === 'online' ? (
              <>
                <span className="type-data">{block.label}</span> marked present, held online.
              </>
            ) : (
              <>
                <span className="type-data">{block.label}</span> marked{' '}
                {option.label.toLowerCase()}.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={undo}
            className="type-subheadline min-h-[var(--target-min)] rounded-full px-4 font-semibold"
            style={{ background: 'var(--fill-tertiary)', color: 'var(--label)' }}
          >
            Undo
          </button>
        </Card>
      </motion.div>
    )
  }

  return (
    <Card className="card-glass">
      <div className="flex items-start justify-between gap-3">
        <IconTile Icon={IconAttendance} tone="green" size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="type-headline">
            <span className="type-data">{block.label}</span>
          </h3>
          {/* The course code alone is a filing reference. The title is what a
              student actually recognises a class by, and it was already on the
              record — it was just never shown here. */}
          {block.courseTitle && (
            <p className="type-footnote truncate text-[var(--label-secondary)]">
              {block.courseTitle}
            </p>
          )}
        </div>
        <span
          className="type-footnote type-data shrink-0 rounded-full px-2.5 py-1 text-right font-semibold"
          style={{ background: 'var(--fill-quaternary)', color: 'var(--label-secondary)' }}
        >
          {formatTime12(block.startTime)}–{formatTime12(block.endTime)}
        </span>
      </div>

      {(block.room || block.faculty) && (
        <p className="type-caption-1 mt-1.5 truncate text-[var(--label-tertiary)]">
          {[block.room, block.faculty].filter(Boolean).join(' · ')}
        </p>
      )}

      {/* What the answer costs. Recording an absence at 8 of 9 is a different
          decision from recording one at 0 of 9, and a prompt that hides the
          count is asking the question without the stakes.

          Not on a suspension day: neither answer there touches a count, so the
          meter would be a number with nothing riding on it. */}
      {standing && !compact && (
        <div className="mt-3 flex items-center gap-3">
          <span
            className="h-2 flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--fill-tertiary)' }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.min(100, standing.allowed === 0 ? 0 : (standing.used / standing.allowed) * 100)}%`,
                background: STATE_COLOR[standing.state] ?? 'var(--ok)',
              }}
            />
          </span>
          <span className="type-caption-1 type-data shrink-0 text-[var(--label-secondary)]">
            {standing.used} of {standing.allowed} used
          </span>
        </div>
      )}

      <div
        role="group"
        aria-label={`Attendance for ${block.label}`}
        className={cx('mt-3 grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}
      >
        {(compact ? COMPACT_OPTIONS : OPTIONS).map((option) => (
          <motion.button
            key={option.status}
            type="button"
            disabled={busy}
            onClick={() => void record(option.status)}
            whileTap={{ scale: 0.96 }}
            transition={transition(spring.snap)}
            /* Each answer in its own tone, icon first: four identical grey
               pills made the destructive answer look exactly like the
               harmless one, at the one moment a student is tapping fast. */
            className={cx(
              'flex min-h-[3.5rem] items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4',
              'text-[0.9375rem] font-semibold',
              'transition-transform disabled:opacity-50',
            )}
            style={{ color: option.ink, background: option.tint }}
          >
            <span
              aria-hidden
              data-tone={option.tone}
              className="glyph grid size-10 shrink-0 place-items-center"
            >
              <option.Icon size={26} />
            </span>
            {option.status === 'present' && deliveryMode === 'online' ? 'Attended online' : option.label}
          </motion.button>
        ))}
      </div>

      {/* The fifth answer is already one of the two in compact mode. */}
      {compact ? null : (
      <motion.button
        type="button"
        disabled={busy}
        onClick={() => void record(CANCELLED.status)}
        whileTap={{ scale: 0.98 }}
        transition={transition(spring.snap)}
        className={cx(
          'mt-2 flex min-h-[var(--target-min)] w-full items-center justify-center gap-1.5',
          'rounded-full text-[0.9375rem] font-medium',
          'transition-transform disabled:opacity-50',
        )}
        style={{ color: CANCELLED.ink, background: CANCELLED.tint }}
      >
        <CANCELLED.Icon size={18} />
        {CANCELLED.label}
      </motion.button>
      )}
    </Card>
  )
}
