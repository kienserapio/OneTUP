'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { cx } from '@/lib/cx'
import { IconChevronLeft } from '@/components/ui/icon'

/**
 * The navigation bar.
 *
 * It behaves the way an iOS large title does: the title starts big and inline
 * with the content, then collapses into the translucent bar as the page
 * scrolls under it. Nothing is cut off by a hard divider — where content meets
 * the bar, the material does the separating.
 */

export interface NavBarProps {
  title: string
  /** Shown under the title while it is still large. */
  subtitle?: string
  back?: { href?: string; label?: string }
  trailing?: ReactNode
  /** Small screens keep the large title; a chat view might not want it. */
  largeTitle?: boolean
}

export function NavBar({ title, subtitle, back, trailing, largeTitle = true }: NavBarProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(!largeTitle)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!largeTitle) return
    const element = sentinel.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { rootMargin: '-52px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [largeTitle])

  return (
    <>
      <header
        className={cx(
          'sticky top-0 z-30 transition-[background-color,box-shadow] duration-200',
          collapsed && 'material-chrome',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="app-container flex h-[52px] items-center gap-2">
          {back ? (
            <button
              type="button"
              onClick={() => (back.href ? router.push(back.href as never) : router.back())}
              className="-ml-2 flex min-h-[var(--target-min)] items-center gap-0.5 pr-2 text-[var(--accent)]"
            >
              <IconChevronLeft size={22} strokeWidth={2.2} />
              <span className="type-body">{back.label ?? 'Back'}</span>
            </button>
          ) : (
            <span className="min-h-[var(--target-min)]" />
          )}

          <h1
            className={cx(
              'type-headline flex-1 truncate text-center transition-opacity duration-200',
              collapsed ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden={!collapsed}
          >
            {title}
          </h1>

          <div className="flex min-h-[var(--target-min)] items-center justify-end gap-1">
            {trailing}
          </div>
        </div>
      </header>

      {largeTitle && (
        <div className="app-container pb-2 pt-1">
          <div ref={sentinel} aria-hidden className="h-px" />
          <h1 className="type-large-title">{title}</h1>
          {subtitle && (
            <p className="type-subheadline mt-0.5 text-[var(--label-secondary)]">{subtitle}</p>
          )}
        </div>
      )}
    </>
  )
}
