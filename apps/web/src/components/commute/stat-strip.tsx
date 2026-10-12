import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * The figures that frame a commute screen.
 *
 * One white card holding every figure rather than four cards, because these
 * numbers are read against each other — the fastest option against the
 * cheapest one — and separate cards would invite the eye to treat them as
 * unrelated. Cells are separated by space alone — no wells, no rules.
 */

export interface CommuteStat {
  label: string
  value: ReactNode
  hint?: ReactNode
}

/** Literal classes, because Tailwind only ships what it can see in the source. */
const DESKTOP_COLUMNS: Record<number, string> = {
  1: 'min-[900px]:grid-cols-1',
  2: 'min-[900px]:grid-cols-2',
  3: 'min-[900px]:grid-cols-3',
  4: 'min-[900px]:grid-cols-4',
  5: 'min-[900px]:grid-cols-5',
}

export function CommuteStatStrip({
  stats,
  className,
}: {
  stats: CommuteStat[]
  className?: string
}) {
  if (stats.length === 0) return null

  return (
    <dl
      className={cx(
        'card grid grid-cols-2 gap-x-4 gap-y-5 overflow-hidden px-5 py-4',
        DESKTOP_COLUMNS[stats.length] ?? 'min-[900px]:grid-cols-4',
        className,
      )}
    >
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          // An odd count would leave a hole in the two-up phone grid; the last
          // cell spans it instead.
          className={cx(
            'min-w-0',
            index === stats.length - 1 &&
              stats.length % 2 === 1 &&
              'col-span-2 min-[900px]:col-span-1',
          )}
        >
          <dt className="text-[0.75rem] font-semibold text-[var(--label-tertiary)]">
            {stat.label}
          </dt>
          <dd className="mt-0.5 line-clamp-2 break-words text-[1.5rem] font-bold leading-tight tabular-nums tracking-[-0.02em]">
            {stat.value}
          </dd>
          {stat.hint && (
            <dd className="mt-0.5 truncate text-[0.75rem] text-[var(--label-secondary)]">
              {stat.hint}
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}
