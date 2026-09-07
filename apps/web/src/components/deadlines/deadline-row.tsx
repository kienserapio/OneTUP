'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { motion, useMotionValue, useTransform } from 'motion/react'
import { describeTimeLeft, urgencyOf, type Urgency } from '@onetup/core'
import { rubberband, spring, transition } from '@/design/motion'
import { IconCheck } from '@/components/ui/icon'
import { Badge } from '@/components/ui/surfaces'
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
  urgent: 'var(--warning)',
  soon: 'var(--caution)',
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
  const [dragging, setDragging] = useState(false)
  const width = useRef(320)

  const urgency = urgencyOf({ dueAt, status }, now)
  const revealOpacity = useTransform(x, [0, COMMIT_DISTANCE], [0, 1])

  return (
    <div
      className="relative overflow-hidden"
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
          background: selected ? 'var(--accent-subtle)' : 'var(--bg-grouped-secondary)',
        }}
        onDragStart={() => setDragging(true)}
        onDrag={(_, info) => {
          // Rubber-banding past the commit point: the row keeps moving, but
          // less, so the boundary reads as resistance rather than a wall.
          if (info.offset.x > COMMIT_DISTANCE) {
            x.set(COMMIT_DISTANCE + rubberband(info.offset.x - COMMIT_DISTANCE, width.current))
          }
        }}
        onDragEnd={(_, info) => {
          setDragging(false)
          const flicked = info.velocity.x > 400
          const dragged = info.offset.x > COMMIT_DISTANCE
          if (flicked || dragged) onComplete(id)
        }}
        transition={transition(spring.ui)}
        className="relative"
      >
        <div className="list-row">
          <button
            type="button"
            onClick={() => onComplete(id)}
            aria-pressed={status === 'done'}
            aria-label={status === 'done' ? `Reopen ${title}` : `Mark ${title} done`}
            className="grid size-[26px] shrink-0 place-items-center rounded-full border-2"
            style={{ borderColor: URGENCY_COLOR[urgency] }}
          >
            {status === 'done' && <IconCheck size={15} style={{ color: URGENCY_COLOR[urgency] }} />}
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
                'type-body block truncate',
                status === 'done' && 'line-through opacity-50',
              )}
            >
              {title}
            </span>
            <span className="type-footnote flex items-center gap-1.5 truncate text-[var(--label-secondary)]">
              {/* Neutral, never accented. A class post's urgency is computed by
                  the same `urgencyOf` as everything else, because a student does
                  not care who created a thing that is due in four hours — the
                  badge says where it came from, not how much it matters. */}
              {sectionCode && <Badge tone="neutral">{sectionCode}</Badge>}
              {courseCode && <span className="type-data">{courseCode}</span>}
              {courseCode && <span aria-hidden>·</span>}
              <span
                className="type-data"
                style={{ color: urgency === 'overdue' ? 'var(--danger)' : undefined }}
              >
                {describeTimeLeft(dueAt, now)}
              </span>
              {fromAnnouncement && (
                <>
                  <span aria-hidden>·</span>
                  <span>from an announcement</span>
                </>
              )}
            </span>
          </Link>

          {!dragging && (
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: URGENCY_COLOR[urgency] }}
            />
          )}
        </div>
      </motion.div>
    </div>
  )
}
