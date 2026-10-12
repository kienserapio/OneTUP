import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * The figures that frame a schedule screen.
 *
 * A row of small white tiles rather than one boxed table: each figure gets its
 * own soft card, big number first and a quiet label under it, and on a phone
 * the row scrolls sideways instead of stacking into a grid — the numbers are a
 * glance, not something to read down.
 */

export interface Stat {
  label: string
  value: ReactNode
  /** Small line under the figure — a comparison, never a repeat of the label. */
  hint?: ReactNode
}

export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  if (stats.length === 0) return null

  return (
    <dl
      className={cx(
        'no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 min-[900px]:mx-0 min-[900px]:px-0',
        className,
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex min-w-[7.5rem] flex-1 shrink-0 flex-col rounded-[var(--radius-lg)] bg-[var(--bg)] px-4 py-3.5"
          style={{
            boxShadow: '0 1px 2px rgb(24 24 27 / 0.04), 0 6px 18px -12px rgb(24 24 27 / 0.12)',
          }}
        >
          {/* The label comes first for a screen reader, as a <dl> needs; the
              figure is lifted above it on screen with `order`. */}
          <dt className="order-2 mt-1.5 text-[0.8125rem] font-semibold text-[var(--label-secondary)]">
            {stat.label}
          </dt>
          <dd className="type-data order-1 whitespace-nowrap text-[1.5rem] font-bold leading-none tracking-[-0.02em]">
            {stat.value}
          </dd>
          {stat.hint && (
            <dd className="order-3 mt-0.5 truncate text-[0.75rem] text-[var(--label-tertiary)]">
              {stat.hint}
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}
