'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { IconChevronRight } from '@/components/ui/icon'

/**
 * One number, named.
 *
 * The stat row at the top of Subjects and GWA is the same shape repeated, so
 * the decisions — where the label sits, which figure gets the display size, how
 * a tone is applied — are made once here rather than per screen.
 *
 * `emphasis` is what separates the one figure a student came for from the
 * counts that qualify it. Only one card in a row should carry it.
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
}

export function StatCard({
  label,
  value,
  note,
  tone,
  emphasis,
  href,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="type-section-header">{label}</p>
        {href && <IconChevronRight size={15} className="shrink-0 text-[var(--label-tertiary)]" />}
      </div>

      <p
        className={cx('mt-1', emphasis ? 'type-figure' : 'type-title-2 type-data')}
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>

      {note && (
        <p className="type-footnote mt-1 text-[var(--label-secondary)]">{note}</p>
      )}
    </>
  )

  const shell = cx(
    'card squircle flex min-h-[var(--target-min)] flex-col justify-start px-4 py-3.5',
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
