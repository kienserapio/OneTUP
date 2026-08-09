'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { IconChevronRight } from './icon'

/**
 * Grouped surfaces: cards, inset lists, section headers, empty states.
 *
 * These are the shapes the whole app is assembled from, so the visual decisions
 * live once here rather than being re-made per screen.
 */

export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string
  children: ReactNode
  padded?: boolean
}) {
  return (
    <section className={cx('card squircle', padded && 'p-4', className)}>{children}</section>
  )
}

export function SectionHeader({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 pb-2">
      <h2 className="type-section-header">{children}</h2>
      {action}
    </div>
  )
}

export function ListGroup({
  children,
  className,
  inset = true,
}: {
  children: ReactNode
  className?: string
  inset?: boolean
}) {
  return (
    <div className={cx('list-group squircle', inset && 'list-inset', className)}>{children}</div>
  )
}

export interface ListRowProps {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  href?: string
  onClick?: () => void
  className?: string
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  href,
  onClick,
  className,
}: ListRowProps) {
  const body = (
    <>
      {leading && <span className="shrink-0 text-[var(--label-secondary)]">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="type-body block truncate">{title}</span>
        {subtitle && (
          <span className="type-footnote block truncate text-[var(--label-secondary)]">
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
      {(href || onClick) && (
        <IconChevronRight size={17} className="shrink-0 text-[var(--label-tertiary)]" />
      )}
    </>
  )

  if (href) {
    return (
      <Link href={href as never} className={cx('list-row', className)}>
        {body}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx('list-row', className)}>
        {body}
      </button>
    )
  }

  return <div className={cx('list-row', className)}>{body}</div>
}

/**
 * Empty states invite an action rather than announcing an absence. Every copy
 * string used here comes from the content spec, not from a placeholder.
 */
export function EmptyState({
  title,
  action,
  icon,
}: {
  title: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon && <span className="text-[var(--label-tertiary)]">{icon}</span>}
      <p className="type-callout max-w-[24rem] text-balance text-[var(--label-secondary)]">
        {title}
      </p>
      {action}
    </div>
  )
}

export type BadgeTone = 'generated' | 'verified' | 'official' | 'stale' | 'neutral'

const TONE_CLASS: Record<BadgeTone, string> = {
  generated: 'badge-generated',
  verified: 'badge-verified',
  official: 'badge-official',
  stale: 'badge-stale',
  neutral: 'badge-stale',
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cx('badge', TONE_CLASS[tone])}>{children}</span>
}

/**
 * The generated-content marker.
 *
 * Applied only where a model actually produced part of what is shown. A cut
 * count is not AI output just because a sentence was templated around it, and
 * labelling everything would make the label meaningless (AI spec §8.3).
 */
export function GeneratedMark({ children }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone="generated">Generated</Badge>
      {children}
    </span>
  )
}

export function Divider() {
  return <hr className="my-4 border-0 border-t" style={{ borderColor: 'var(--separator)' }} />
}
