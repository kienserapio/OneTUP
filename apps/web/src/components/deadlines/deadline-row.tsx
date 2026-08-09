'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { motion, useMotionValue, useTransform } from 'motion/react'
import { describeTimeLeft, urgencyOf, type Urgency } from '@onetup/core'
import { DRAG_THRESHOLD_PX, rubberband, spring, transition } from '@/design/motion'
import { IconCheck } from '@/components/ui/icon'
import { cx } from '@/lib/cx'

/**
 * One deadline row, with swipe-to-complete.
 *
 * The gesture tracks the finger one-to-one, resists past its bound rather than
 * stopping dead, and commits on the *sign of the velocity* at release — a
 * student who flicks it has said "done", even at 30% of the distance.
 *
 * The swipe is never the only path. The checkbox does the same thing in one
 * tap, and it is what a keyboard or a screen reader uses.
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
  now: Date
  onComplete: (id: string) => void
}

const COMMIT_DISTANCE = 96

export function DeadlineRow({
  id,
  title,
  dueAt,
  courseCode,
  status,
  fromAnnouncement,
  now,
  onComplete,
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
        <IconCheck size={20} style={{ color: 'white' }} />
        <span className="type-subheadline font-semibold" style={{ color: 'white' }}>
          Done
        </span>
      </motion.div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.9 }}
        style={{ x, background: 'var(--bg-grouped-secondary)' }}
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
            aria-label={`Mark ${title} done`}
            className="grid size-[26px] shrink-0 place-items-center rounded-full border-2"
            style={{ borderColor: URGENCY_COLOR[urgency] }}
          >
            {status === 'done' && <IconCheck size={15} style={{ color: URGENCY_COLOR[urgency] }} />}
          </button>

          <Link href={`/deadlines/${id}`} className="min-w-0 flex-1">
            <span
              className={cx(
                'type-body block truncate',
                status === 'done' && 'line-through opacity-50',
              )}
            >
              {title}
            </span>
            <span className="type-footnote flex items-center gap-1.5 truncate text-[var(--label-secondary)]">
              {courseCode && <span className="type-data">{courseCode}</span>}
              {courseCode && <span aria-hidden>·</span>}
              <span style={{ color: urgency === 'overdue' ? 'var(--danger)' : undefined }}>
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
