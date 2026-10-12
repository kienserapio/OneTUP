'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'
import { IconChevronRight } from './icon'

/**
 * The app's list item.
 *
 * Not a grouped iOS table: every item is its own soft white card with a gap
 * between it and the next, an icon on the left, a title, one quiet line under
 * it, and small pills for whatever is worth a glance (a due time, a room).
 * The notifications feed set the look; everything else lists the same way.
 *
 * It is a link when given `href`, a button when given `onClick`, and a plain
 * card otherwise.
 */

export function RowList({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  /** Read out as the list's name. */
  label?: string
}) {
  return (
    <ul aria-label={label} className={cx('row-list', className)}>
      {children}
    </ul>
  )
}

export interface RowProps {
  /** Usually an <IconTile>, or a time, a number, an avatar. */
  leading?: ReactNode
  title: ReactNode
  detail?: ReactNode
  /** Small pills under the title: use <RowPill>. */
  meta?: ReactNode
  /** A value, a toggle or a button. A link row gets a chevron when unset. */
  trailing?: ReactNode
  href?: string
  onClick?: () => void
  /** A crimson dot for something new. */
  unread?: boolean
  /** Dims the row for something finished or past. */
  muted?: boolean
  className?: string
  /** For a row that is not wrapped in <RowList>. */
  as?: 'li' | 'div'
  ariaLabel?: string
}

export function Row({
  leading,
  title,
  detail,
  meta,
  trailing,
  href,
  onClick,
  unread,
  muted,
  className,
  as = 'li',
  ariaLabel,
}: RowProps) {
  const body = (
    <>
      {leading && <span className="row-leading">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="row-title">{title}</span>
        {detail && <span className="row-detail">{detail}</span>}
        {meta && <span className="row-meta">{meta}</span>}
      </span>
      {unread && <span aria-label="New" className="row-unread" />}
      {trailing ??
        (href ? (
          <IconChevronRight size={18} className="shrink-0 text-[var(--label-quaternary)]" />
        ) : null)}
    </>
  )

  const classes = cx('row', (href || onClick) && 'row-interactive', muted && 'row-muted', className)
  const Wrapper = as

  return (
    <Wrapper className="list-none">
      {href ? (
        <Link href={href as never} className={classes} aria-label={ariaLabel}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={classes} aria-label={ariaLabel}>
          {body}
        </button>
      ) : (
        <div className={classes}>{body}</div>
      )}
    </Wrapper>
  )
}

/** A small pill of meta under a row's title. `tone` colours it for urgency. */
export function RowPill({
  children,
  tone,
  icon,
}: {
  children: ReactNode
  tone?: 'crimson' | 'green' | 'blue'
  icon?: ReactNode
}) {
  return (
    <span className="row-pill" data-tone={tone}>
      {icon}
      {children}
    </span>
  )
}
