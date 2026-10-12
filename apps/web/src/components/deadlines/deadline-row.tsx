'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { motion, useMotionValue, useTransform } from 'motion/react'
import { describeTimeLeft, urgencyOf, type Urgency } from '@onetup/core'
import { rubberband, spring, transition } from '@/design/motion'
import { IconCheck, IconChevronRight } from '@/components/ui/icon'
import { RowPill } from '@/components/ui/row'
import { cx } from '@/lib/cx'

/**
 * One row in the tracker — a personal deadline, or a post from the classroom.
 *
 * Both are completed the same way and by the same gesture. What differs is
 * where it is written: a personal deadline changes its own row, and a class
 * post changes only this student's state on a shared one. The caller decides
 * that; this component just reports the tap.
 *
 * Swipe-to-complete.
 *
 * The gesture tracks the finger one-to-one, resists past its bound rather than
 * stopping dead, and commits on the *sign of the velocity* at release — a
 * student who flicks it has said "done", even at 30% of the distance.
 *
 * The swipe is never the only path. The checkbox does the same thing in one
 * tap, and it is what a keyboard or a screen reader uses.
 *
 * The row is always a real link to `/deadlines/[id]`, so a direct link and a
 * phone both work. Where a detail pane is on screen, `onOpen` intercepts the
 * navigation and selects instead — the destination is already visible, so
 * leaving the list would be a step backwards.
 */

export const URGENCY_COLOR: Record<Urgency, string> = {
  overdue: 'var(--danger)',
  critical: 'var(--danger)',
  urgent: 'var(--danger)',
  soon: 'var(--info)',
  upcoming: 'var(--info)',
  later: 'var(--label-tertiary)',
}

export interface DeadlineRowProps {
  id: string
  title: string
  dueAt: string
  courseCode?: string | null
  status: 'open' | 'done' | 'dismissed'
  fromAnnouncement?: boolean
  /** The block section that published this, when the class did rather than you. */
  sectionCode?: string | null
  /** Where the row leads. Defaults to the deadline it came from. */
  href?: string
  now: Date
  onComplete: (id: string) => void
  /** Provided only while a detail pane is mounted beside the list. */
  onOpen?: (id: string) => void
  selected?: boolean
}

const COMMIT_DISTANCE = 96

export function DeadlineRow({
  id,
  title,
  dueAt,
  courseCode,
  status,
  fromAnnouncement,
  sectionCode,
  href,
  now,
  onComplete,
  onOpen,
  selected,
}: DeadlineRowProps) {
  const x = useMotionValue(0)
  const width = useRef(320)

  const urgency = urgencyOf({ dueAt, status }, now)
  const revealOpacity = useTransform(x, [0, COMMIT_DISTANCE], [0, 1])

  const pillTone =
    status === 'done'
      ? undefined
      : urgency === 'overdue' || urgency === 'critical'
        ? 'crimson'
        : urgency === 'urgent'
          ? 'crimson'
          : undefined

  return (
    <div
      /* The card's own shape clips the green reveal, so the swipe reads as the
         card sliding off its own action rather than off the page. */
      className="relative overflow-hidden rounded-[var(--radius-lg)]"
      style={{
        boxShadow: '0 1px 2px rgb(24 24 27 / 0.04), 0 6px 18px -12px rgb(24 24 27 / 0.12)',
      }}
      ref={(node) => {
        if (node) width.current = node.offsetWidth
      }}
    >
      {/* The action revealed underneath. It brightens with the drag rather than
          appearing at the end, so the outcome is legible before release. */}
      <motion.div
        aria-hidden
        className="absolute inset-y-0 left-0 flex w-full items-center gap-2 pl-5"
        style={{ background: 'var(--ok)', opacity: revealOpacity }}
      >
        <IconCheck size={20} style={{ color: 'var(--on-accent)' }} />
        <span className="type-subheadline font-semibold" style={{ color: 'var(--on-accent)' }}>
          Done
        </span>
      </motion.div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.9 }}
        style={{
          x,
          background: selected ? 'var(--accent-subtle)' : 'var(--bg)',
        }}
        onDrag={(_, info) => {
          // Rubber-banding past the commit point: the row keeps moving, but
          // less, so the boundary reads as resistance rather than a wall.
          if (info.offset.x > COMMIT_DISTANCE) {
            x.set(COMMIT_DISTANCE + rubberband(info.offset.x - COMMIT_DISTANCE, width.current))
          }
        }}
        onDragEnd={(_, info) => {
          const flicked = info.velocity.x > 400
          const dragged = info.offset.x > COMMIT_DISTANCE
          if (flicked || dragged) onComplete(id)
        }}
        transition={transition(spring.ui)}
        className="relative"
      >
        <div className="flex min-h-[68px] items-center gap-3.5 py-3 pl-3.5 pr-4">
          <button
            type="button"
            onClick={() => onComplete(id)}
            aria-pressed={status === 'done'}
            aria-label={status === 'done' ? `Reopen ${title}` : `Mark ${title} done`}
            /* The dot is the checkbox and the urgency at once: a bare dot in
               the urgency colour while open, a green check once done. Nothing
               behind either — the 40px button is still the tap target. */
            className="grid size-10 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90"
          >
            {status === 'done' ? (
              <IconCheck size={22} style={{ color: 'var(--ok)' }} />
            ) : (
              <span
                aria-hidden
                className="block size-3 rounded-full"
                style={{ background: URGENCY_COLOR[urgency] }}
              />
            )}
          </button>

          <Link
            href={(href ?? `/deadlines/${id}`) as never}
            aria-current={selected ? 'true' : undefined}
            onClick={(event) => {
              if (!onOpen) return
              event.preventDefault()
              onOpen(id)
            }}
            className="min-w-0 flex-1"
          >
            <span
              className={cx(
                'block truncate text-[0.96875rem] font-semibold leading-snug tracking-[-0.01em]',
                status === 'done' && 'line-through opacity-50',
              )}
            >
              {title}
            </span>
            {/* Neutral, never accented, for where it came from. A class post's
                urgency is computed by the same `urgencyOf` as everything else,
                because a student does not care who created a thing that is due
                in four hours — only the time pill takes a colour. */}
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <RowPill tone={pillTone}>{describeTimeLeft(dueAt, now)}</RowPill>
              {courseCode && <RowPill>{courseCode}</RowPill>}
              {sectionCode && <RowPill>{sectionCode}</RowPill>}
              {fromAnnouncement && <RowPill>From a post</RowPill>}
            </span>
          </Link>

          <IconChevronRight size={18} className="shrink-0 text-[var(--label-quaternary)]" />
        </div>
      </motion.div>
    </div>
  )
}
