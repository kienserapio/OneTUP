'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { IconChevronRight } from '@/components/ui/icon'

/**
 * One number, named.
 *
 * The stat row at the top of Subjects, GWA and a single subject is the same
 * shape repeated, so the decisions — icon first, the figure big, the label
 * quiet, a tone applied to the figure only — are made once here rather than per
 * screen.
 *
 * `emphasis` is what separates the one figure a student came for from the
 * counts that qualify it. Only one card in a row should carry it. `visual` is
 * for the drawing that makes the figure readable at a glance — a ring, a meter
 * — and sits beside the figure when emphasised, under it otherwise.
 */

export interface StatCardProps {
  label: string
  value: ReactNode
  note?: ReactNode
  /** A status token, e.g. `var(--danger)`. Never a literal colour. */
  tone?: string
  emphasis?: boolean
  href?: string
  className?: string
  /** An <IconTile> in the feature's tone, leading the label. */
  icon?: ReactNode
  /** A ring, a meter: the figure drawn as well as written. */
  visual?: ReactNode
  /** An <InfoTip> beside the label. */
  info?: ReactNode
}

export function StatCard({
  label,
  value,
  note,
  tone,
  emphasis,
  href,
  className,
  icon,
  visual,
  info,
}: StatCardProps) {
  const figure = (
    <div className="min-w-0">
      <p
        className={cx(
          'font-bold leading-none tabular-nums tracking-[-0.03em]',
          emphasis ? 'text-[2.5rem]' : 'text-[1.75rem]',
        )}
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
      {note && (
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-[var(--label-secondary)]">{note}</p>
      )}
    </div>
  )

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-[0.8125rem] font-semibold text-[var(--label-secondary)]">
            {label}
          </span>
          {info}
        </span>
        {href && <IconChevronRight size={16} className="shrink-0 text-[var(--label-tertiary)]" />}
      </div>

      {emphasis && visual ? (
        /* Wraps rather than squeezes: in a half-width card the drawing drops
         * under the figure instead of shrinking it. */
        <div className="mt-3 flex flex-wrap-reverse items-center justify-between gap-3">
          {figure}
          {visual}
        </div>
      ) : (
        <div className="mt-3">
          {figure}
          {visual && <div className="mt-3">{visual}</div>}
        </div>
      )}
    </>
  )

  const shell = cx(
    'card squircle flex min-h-[var(--target-min)] flex-col justify-start p-4',
    className,
  )

  return href ? (
    <Link href={href as never} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  )
}
