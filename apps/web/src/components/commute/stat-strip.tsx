import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * The figures that frame a commute screen.
 *
 * One card split by hairlines rather than four cards, because these numbers are
 * read against each other — the fastest option against the cheapest one — and
 * separate cards would invite the eye to treat them as unrelated. The hairlines
 * are gaps over a separator-coloured ground, which is the only way to get a
 * true 1px rule in both axes without a border on every cell.
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
        'card squircle grid grid-cols-2 gap-px overflow-hidden',
        DESKTOP_COLUMNS[stats.length] ?? 'min-[900px]:grid-cols-4',
        className,
      )}
      style={{ background: 'var(--separator)' }}
    >
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          // An odd count would leave a hole in the two-up phone grid, and the
          // hole shows as a bar of separator colour rather than as nothing.
          className={cx(
            'px-4 py-3',
            index === stats.length - 1 &&
              stats.length % 2 === 1 &&
              'col-span-2 min-[900px]:col-span-1',
          )}
          style={{ background: 'var(--bg-grouped-secondary)' }}
        >
          <dt className="type-caption-2 font-semibold uppercase tracking-[0.08em] text-[var(--label-tertiary)]">
            {stat.label}
          </dt>
          <dd className="type-data type-title-3 mt-1 line-clamp-2 break-words">{stat.value}</dd>
          {stat.hint && (
            <dd className="type-caption-1 mt-0.5 truncate text-[var(--label-secondary)]">
              {stat.hint}
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}
