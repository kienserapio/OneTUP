'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { formatTime12, formatWeekday } from '@onetup/core'
import { spring, transition } from '@/design/motion'
import { IconChevronRight, IconSchedule } from '@/components/ui/icon'
import { Watermark } from '@/components/ui/watermark'
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
      <div className="card-glass p-5">
        <Watermark Icon={IconSchedule} size={88} />
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
      data-tone="crimson"
      className="card-glass squircle px-5 pb-5 pt-4 md:px-6 md:pb-6"
      style={{ borderRadius: 'var(--radius-xl)', color: 'var(--on-accent)' }}
      aria-label={isNow ? 'Class happening now' : 'Next class'}
    >
      <Watermark Icon={IconSchedule} size={168} />
      <div className="flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold"
          style={{ color: 'rgb(255 255 255 / 0.8)' }}
        >
          {isNow && (
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-white opacity-60 motion-reduce:hidden" />
              <span className="relative size-2 rounded-full bg-white" />
            </span>
          )}
          {isNow ? 'Right now' : 'Up next'}
        </span>
        <span className="text-[0.8125rem] font-semibold tabular-nums">{when}</span>
      </div>

      <h2 className="mt-3 text-[1.625rem] font-bold leading-[1.15] tracking-[-0.025em]">
        {block.courseTitle ?? block.label}
      </h2>
      <p
        className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem]"
        style={{ color: 'rgb(255 255 255 / 0.8)' }}
      >
        <span className="type-data font-semibold text-white">{block.label}</span>
        {block.room && (
          <>
            <Dot />
            <span className="type-data">{block.room}</span>
          </>
        )}
        {block.faculty && (
          <>
            <Dot />
            <span className="truncate">{block.faculty}</span>
          </>
        )}
      </p>

      <ClassTimeline
        start={block.startTime}
        end={block.endTime}
        isNow={isNow}
        minutesUntil={next?.minutesUntil ?? null}
      />

      {following && (
        <p
          className="mt-4 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[0.8125rem]"
          style={{ background: 'rgb(255 255 255 / 0.12)', color: 'rgb(255 255 255 / 0.85)' }}
        >
          <IconChevronRight size={14} />
          <span className="min-w-0 truncate">
            Then <span className="type-data font-semibold text-white">{following.label}</span> at{' '}
            {formatTime12(following.startTime)}
            {following.room ? ` · ${following.room}` : ''}
          </span>
        </p>
      )}

      {isNow && onLogAttendance && (
        <div
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl p-3 pl-4"
          style={{ background: 'rgb(255 255 255 / 0.12)' }}
        >
          <p className="type-footnote" style={{ color: 'rgb(255 255 255 / 0.8)' }}>
            Were you there?
          </p>
          <button
            type="button"
            onClick={onLogAttendance}
            className="type-subheadline min-h-[var(--target-min)] rounded-full px-5 font-semibold"
            style={{ background: 'var(--on-accent)', color: 'var(--crimson-700)' }}
          >
            Log attendance
          </button>
        </div>
      )}
    </motion.section>
  )
}

function Dot() {
  return <span aria-hidden className="size-1 rounded-full bg-white/50" />
}

/**
 * Where this class sits in time, drawn rather than said: start and end on a
 * dotted track, the filled part how far through it the student is. Before the
 * class starts the track is empty and the marker waits at the start.
 */
function ClassTimeline({
  start,
  end,
  isNow,
}: {
  start: string
  end: string
  isNow: boolean
  minutesUntil: number | null
}) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!isNow) return
    const toMinutes = (value: string) => {
      const [h, m] = value.split(':').map(Number)
      return h * 60 + m
    }
    const update = () => {
      const manila = new Date(Date.now() + 8 * 3_600_000)
      const current = manila.getUTCHours() * 60 + manila.getUTCMinutes()
      const span = toMinutes(end) - toMinutes(start)
      setProgress(span > 0 ? Math.min(1, Math.max(0, (current - toMinutes(start)) / span)) : 0)
    }
    update()
    const timer = window.setInterval(update, 30_000)
    return () => window.clearInterval(timer)
  }, [isNow, start, end])

  return (
    <div className="mt-5" aria-hidden>
      <div className="relative h-3">
        <span
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dotted"
          style={{ borderColor: 'rgb(255 255 255 / 0.35)' }}
        />
        <motion.span
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
          style={{ background: 'var(--on-accent)' }}
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ ...transition(spring.ui), duration: 0.9 }}
        />
        <span
          className="absolute left-0 top-1/2 size-3 -translate-y-1/2 rounded-full"
          style={{ background: 'var(--on-accent)' }}
        />
        <motion.span
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'var(--on-accent)', boxShadow: '0 0 0 5px rgb(255 255 255 / 0.25)' }}
          initial={{ left: '0%' }}
          animate={{ left: `${progress * 100}%` }}
          transition={{ ...transition(spring.ui), duration: 0.9 }}
        />
        <span
          className="absolute right-0 top-1/2 size-3 -translate-y-1/2 rounded-full"
          style={{ background: 'rgb(255 255 255 / 0.45)' }}
        />
      </div>
      <div
        className="mt-2 flex justify-between text-[0.75rem] font-medium tabular-nums"
        style={{ color: 'rgb(255 255 255 / 0.75)' }}
      >
        <span>{formatTime12(start)}</span>
        <span>{formatTime12(end)}</span>
      </div>
    </div>
  )
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
