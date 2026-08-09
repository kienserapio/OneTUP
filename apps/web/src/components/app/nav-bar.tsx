'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { IconChevronLeft } from '@/components/ui/icon'

/**
 * The in-page heading.
 *
 * The sticky chrome moved to the top bar when the shell gained a sidebar, so
 * what is left here is the page's own large title, its one-line context, and
 * any actions that belong to the page rather than to the app. Two sticky
 * headers on one screen is the thing this deliberately avoids.
 *
 * The prop shape is unchanged, so every screen that already renders a NavBar
 * keeps working.
 */

export interface NavBarProps {
  title: string
  subtitle?: string
  back?: { href?: string; label?: string }
  trailing?: ReactNode
  /** A chat view wants its title in the bar only; pass false to suppress this. */
  largeTitle?: boolean
}

export function NavBar({ title, subtitle, back, trailing, largeTitle = true }: NavBarProps) {
  const router = useRouter()

  return (
    <div className="app-container pb-3 pt-5">
      {back && (
        <button
          type="button"
          onClick={() => (back.href ? router.push(back.href as never) : router.back())}
          className="type-subheadline -ml-1 mb-2 inline-flex min-h-[var(--target-min)] items-center gap-0.5 text-[var(--accent)]"
        >
          <IconChevronLeft size={19} strokeWidth={2.2} />
          {back.label ?? 'Back'}
        </button>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {largeTitle && <h2 className="type-large-title">{title}</h2>}
          {subtitle && (
            <p className="type-subheadline mt-0.5 text-[var(--label-secondary)]">{subtitle}</p>
          )}
        </div>
        {trailing && <div className="flex items-center gap-1">{trailing}</div>}
      </div>
    </div>
  )
}
