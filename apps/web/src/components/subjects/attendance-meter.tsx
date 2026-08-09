'use client'

import { type AttendanceState, type AttendanceSummary, describeAttendance } from '@onetup/core'
import { cx } from '@/lib/cx'

/**
 * How much of the absence allowance is spent.
 *
 * The colour is the whole message, so it is derived from the state the core
 * arithmetic returns rather than from a threshold re-decided here. Colour never
 * carries it alone: the count and the sentence beside it say the same thing.
 */

export function attendanceColor(state: AttendanceState): string {
  switch (state) {
    case 'at_limit':
      return 'var(--danger)'
    case 'warning':
      return 'var(--warning)'
    case 'caution':
      return 'var(--caution)'
    default:
      return 'var(--ok)'
  }
}

const PIP_LIMIT = 10

export function AttendanceMeter({
  summary,
  className,
}: {
  summary: AttendanceSummary
  className?: string
}) {
  const color = attendanceColor(summary.state)
  const label = `${summary.absenceUnits} of ${summary.allowed} absences used`

  if (summary.allowed <= 0) {
    return (
      <p className={cx('type-footnote text-[var(--label-secondary)]', className)}>
        {describeAttendance(summary)}
      </p>
    )
  }

  // Past ten slots the pips are too thin to count at 320px, so the same value
  // is shown as a single track instead.
  if (summary.allowed > PIP_LIMIT) {
    return (
      <div className={className} role="img" aria-label={label}>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--fill-tertiary)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, summary.ratio * 100)}%`,
              background: color,
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={cx('flex gap-1', className)} role="img" aria-label={label}>
      {Array.from({ length: summary.allowed }, (_, index) => (
        <span
          key={index}
          className="h-1.5 flex-1 rounded-full"
          style={{
            background: index < summary.absenceUnits ? color : 'var(--fill-tertiary)',
          }}
        />
      ))}
    </div>
  )
}

export function StateDot({ state }: { state: AttendanceState }) {
  return (
    <span
      aria-hidden
      className="block size-2.5 rounded-full"
      style={{ background: attendanceColor(state) }}
    />
  )
}

/** `2/5` in the state colour — the figure a student scans down the list for. */
export function CutCount({ summary }: { summary: AttendanceSummary }) {
  return (
    <span className="type-data" style={{ color: attendanceColor(summary.state) }}>
      {summary.absenceUnits}/{summary.allowed}
    </span>
  )
}
