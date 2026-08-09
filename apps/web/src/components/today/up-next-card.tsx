'use client'

import { motion } from 'motion/react'
import { formatTime12, formatWeekday } from '@onetup/core'
import { spring, transition } from '@/design/motion'
import { IconChevronRight, IconClock } from '@/components/ui/icon'
import type { CourseBlock, TodayData } from '@/lib/queries/today'

/**
 * The one card the whole screen is built around.
 *
 * It answers "where do I have to be, and when" before a student has read
 * anything else, which is why it gets the only saturated surface in the
 * product. Everything below it is white, so this reads as the answer and the
 * rest as context.
 */

export interface UpNextCardProps {
  data: TodayData
  onLogAttendance?: () => void
}

export function UpNextCard({ data, onLogAttendance }: UpNextCardProps) {
  const current = data.now
  const next = data.next

  if (!current && !next) {
    return (
      <div className="card p-5">
        <p className="type-body text-[var(--label-secondary)]">
          Nothing scheduled for the rest of the week.
        </p>
      </div>
    )
  }

  const block = (current ?? next!.block) as CourseBlock
  const isNow = Boolean(current)
  const when = isNow
    ? 'Right now'
    : next!.isToday
      ? `in ${formatDuration(next!.minutesUntil)}`
      : `${formatWeekday(block.day, 'short')} ${formatTime12(block.startTime)}`

  // The class after this one, so the card answers "and then?" without a tap.
  const following = data.blocks.find(
    (candidate) => candidate.startTime > block.startTime && candidate.id !== block.id,
  )

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(spring.ui)}
      className="squircle relative overflow-hidden p-5 md:p-6"
      style={{
        borderRadius: 'var(--radius-xl)',
        color: 'var(--on-accent)',
        background:
          'linear-gradient(145deg, var(--crimson-800) 0%, var(--crimson-600) 45%, var(--crimson-500) 100%)',
        boxShadow: '0 8px 30px color-mix(in srgb, var(--accent) 30%, transparent)',
      }}
      aria-label={isNow ? 'Class happening now' : 'Next class'}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="type-section-header" style={{ color: 'rgb(255 255 255 / 0.75)' }}>
          {isNow ? 'Right now' : 'Up next'}
        </p>
        <span
          className="type-caption-1 rounded-full px-2.5 py-1 font-medium"
          style={{ background: 'rgb(255 255 255 / 0.16)' }}
        >
          {when}
        </span>
      </div>

      <p className="type-data mt-3 text-[0.8125rem]" style={{ color: 'rgb(255 255 255 / 0.75)' }}>
        {block.label}
      </p>
      <h2 className="type-title-1 mt-0.5">{block.courseTitle ?? block.label}</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        <Chip>
          <IconClock size={14} />
          <span className="type-data">
            {formatTime12(block.startTime)} – {formatTime12(block.endTime)}
          </span>
        </Chip>
        {block.room && (
          <Chip>
            <span className="type-data">{block.room}</span>
          </Chip>
        )}
        {block.faculty && <Chip>{block.faculty}</Chip>}
      </div>

      {following && (
        <p
          className="type-footnote mt-3 flex items-center gap-2"
          style={{ color: 'rgb(255 255 255 / 0.8)' }}
        >
          <IconChevronRight size={14} />
          Then <span className="type-data">{following.label}</span> at{' '}
          {formatTime12(following.startTime)}
          {following.room ? ` in ${following.room}` : ''}
        </p>
      )}

      {isNow && onLogAttendance && (
        <div
          className="mt-4 flex items-center justify-between gap-3 border-t pt-4"
          style={{ borderColor: 'rgb(255 255 255 / 0.2)' }}
        >
          <p className="type-footnote" style={{ color: 'rgb(255 255 255 / 0.8)' }}>
            Were you there?
          </p>
          <button
            type="button"
            onClick={onLogAttendance}
            className="type-subheadline min-h-[var(--target-min)] rounded-[var(--radius-sm)] px-4 font-semibold"
            style={{ background: 'var(--on-accent)', color: 'var(--crimson-700)' }}
          >
            Log attendance
          </button>
        </div>
      )}
    </motion.section>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="type-footnote inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5"
      style={{ background: 'rgb(255 255 255 / 0.14)' }}
    >
      {children}
    </span>
  )
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
