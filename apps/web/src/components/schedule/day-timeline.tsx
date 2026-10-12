'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { formatTime12, toMinutes, type FreeBlock } from '@onetup/core'
import { cx } from '@/lib/cx'
import { formatMinutes, type ScheduleBlockView } from '@/components/schedule/schedule-data'

/**
 * One day as a calendar, not a list.
 *
 * Time runs down the page at a fixed rate, so a class's height is its length
 * and the space between two classes is the gap a student actually has to fill.
 * A list can say "7:30 AM" but cannot show that the morning is packed and the
 * afternoon empty; a grid shows it before anything is read. Overlapping blocks
 * share the row side by side, the way a calendar app lays them out.
 */

const HOUR_PX = 64
const MIN_BLOCK_PX = 26

interface Placed {
  block: ScheduleBlockView
  start: number
  end: number
  column: number
  columns: number
}

export interface DayTimelineProps {
  classes: ScheduleBlockView[]
  gaps: FreeBlock[]
  /** Minutes past midnight in Manila, or null when the day is not today. */
  nowMinutes: number | null
  onEdit: (block: ScheduleBlockView) => void
}

export function DayTimeline({ classes, gaps, nowMinutes, onEdit }: DayTimelineProps) {
  const nowRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLDivElement>(null)

  const placed = useMemo(() => layout(classes), [classes])

  const [fromHour, toHour] = useMemo(() => {
    if (placed.length === 0) return [7, 18]
    let from = Math.floor(Math.min(...placed.map((p) => p.start)) / 60) - 1
    let to = Math.ceil(Math.max(...placed.map((p) => p.end)) / 60) + 1
    // Keep the now line on the grid when it falls on a sensible hour.
    if (nowMinutes !== null && nowMinutes >= 6 * 60 && nowMinutes <= 22 * 60) {
      from = Math.min(from, Math.floor(nowMinutes / 60))
      to = Math.max(to, Math.ceil(nowMinutes / 60) + 1)
    }
    return [Math.max(0, from), Math.min(24, to)]
  }, [placed, nowMinutes])

  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i)
  const origin = fromHour * 60
  const y = (minutes: number) => ((minutes - origin) / 60) * HOUR_PX

  // The class that matters now: the one in progress, else the next one today.
  const focusId = useMemo(() => {
    if (nowMinutes === null) return null
    const current = placed.find((p) => p.start <= nowMinutes && nowMinutes < p.end)
    if (current) return current.block.id
    const next = placed.filter((p) => p.start > nowMinutes).sort((a, b) => a.start - b.start)[0]
    return next?.block.id ?? null
  }, [placed, nowMinutes])

  const showNow = nowMinutes !== null && nowMinutes >= origin && nowMinutes <= toHour * 60

  // Bring the now line, or the first class, into view once — only when it is
  // off-screen, so a short day never jumps.
  useEffect(() => {
    const target = nowRef.current ?? firstRef.current
    if (!target) return
    const rect = target.getBoundingClientRect()
    if (rect.top < 0 || rect.bottom > window.innerHeight - 96) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [])

  const firstId = placed.length > 0 ? [...placed].sort((a, b) => a.start - b.start)[0].block.id : null

  return (
    <div
      className="day-timeline"
      style={{ height: (toHour - fromHour) * HOUR_PX + 16 }}
      role="list"
      aria-label="Classes by time"
    >
      {hours.map((hour) => (
        <div key={hour} className="day-timeline-hour" style={{ top: y(hour * 60) }} aria-hidden>
          <span className="day-timeline-label">{hourLabel(hour)}</span>
        </div>
      ))}

      <div className="day-timeline-track">
        {gaps
          .filter((gap) => gap.after && gap.before && gap.minutes >= 30)
          .map((gap) => {
            const top = y(toMinutes(gap.startTime))
            const height = y(toMinutes(gap.endTime)) - top
            return (
              <div
                key={`gap-${gap.startTime}`}
                className="day-timeline-gap"
                style={{ top, height }}
                aria-hidden
              >
                <span>{formatMinutes(gap.minutes)} free</span>
              </div>
            )
          })}

        {placed.map((p) => {
          const top = y(p.start)
          const height = Math.max(MIN_BLOCK_PX, y(p.end) - top - 2)
          const past = nowMinutes !== null && p.end <= nowMinutes
          return (
            <div
              key={p.block.id}
              ref={p.block.id === firstId ? firstRef : undefined}
              role="listitem"
              className="day-timeline-slot"
              style={{
                top,
                height,
                left: `calc(${(p.column / p.columns) * 100}% + ${p.column > 0 ? 2 : 0}px)`,
                width: `calc(${100 / p.columns}% - ${p.columns > 1 ? 2 : 0}px)`,
              }}
            >
              <TimelineBlock
                block={p.block}
                compact={height < 52}
                focus={p.block.id === focusId}
                past={past}
                onEdit={() => onEdit(p.block)}
              />
            </div>
          )
        })}

        {showNow && (
          <div
            ref={nowRef}
            className="day-timeline-now"
            style={{ top: y(nowMinutes) }}
            aria-label={`Now, ${formatTime12(minutesToTime(nowMinutes))}`}
            role="note"
          />
        )}
      </div>
    </div>
  )
}

function TimelineBlock({
  block,
  compact,
  focus,
  past,
  onEdit,
}: {
  block: ScheduleBlockView
  compact: boolean
  focus: boolean
  past: boolean
  onEdit: () => void
}) {
  const range = `${formatTime12(block.startTime)} – ${formatTime12(block.endTime)}`
  const room = block.room ?? 'TBA'
  const label = `${block.label}, ${range}, room ${room}`
  const className = cx('day-block', focus && 'day-block-focus', past && 'day-block-past', compact && 'day-block-compact')

  const body = compact ? (
    <span className="day-block-line">
      <strong className="type-data">{block.label}</strong>
      <span className="type-data">
        {formatTime12(block.startTime)} · {room}
      </span>
    </span>
  ) : (
    <>
      <strong className="day-block-title type-data">{block.label}</strong>
      {block.courseTitle && block.courseTitle !== block.label && (
        <span className="day-block-sub">{block.courseTitle}</span>
      )}
      <span className="day-block-sub type-data">
        {range} · {room}
      </span>
    </>
  )

  if (block.source === 'manual') {
    return (
      <button type="button" onClick={onEdit} className={className} aria-label={`Edit ${label}`}>
        {body}
      </button>
    )
  }
  if (block.enrollmentId) {
    return (
      <Link href={`/subjects/${block.enrollmentId}` as never} className={className} aria-label={label}>
        {body}
      </Link>
    )
  }
  return (
    <div className={className} aria-label={label}>
      {body}
    </div>
  )
}

/** Greedy column assignment within each cluster of overlapping blocks. */
function layout(blocks: ScheduleBlockView[]): Placed[] {
  const sorted = blocks
    .map((block) => ({ block, start: toMinutes(block.startTime), end: toMinutes(block.endTime) }))
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const placed: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -1

  const close = () => {
    const columns = Math.max(1, ...cluster.map((p) => p.column + 1))
    for (const p of cluster) p.columns = columns
    placed.push(...cluster)
    cluster = []
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) close()
    const taken = new Set(cluster.filter((p) => p.end > item.start).map((p) => p.column))
    let column = 0
    while (taken.has(column)) column++
    cluster.push({ ...item, column, columns: 1 })
    clusterEnd = Math.max(cluster.length === 1 ? item.end : clusterEnd, item.end)
  }
  if (cluster.length > 0) close()
  return placed
}

function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

function minutesToTime(minutes: number) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  return `${h}:${m}` as Parameters<typeof formatTime12>[0]
}
