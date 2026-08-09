'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { titleFor } from './nav-items'
import { IconAsk, IconSettings } from '@/components/ui/icon'

/**
 * The top bar.
 *
 * Deliberately thin: the page title, today's date, and two actions. Everything
 * that matters is in the page itself, and a bar that grows becomes a second
 * navigation the student has to learn.
 *
 * On phones it also carries the brand mark, because there is no sidebar there
 * to carry it.
 */
export function Topbar() {
  const pathname = usePathname()
  const title = titleFor(pathname)

  return (
    <header className="topbar">
      <div className="topbar-inner">
      <span className="brand-mark mobile-only" aria-hidden>
        1
      </span>

      <span className="min-w-0 flex-1">
        <h1 className="type-headline truncate leading-none">{title}</h1>
        <p className="type-caption-1 mt-0.5 truncate text-[var(--label-tertiary)]">
          {formatToday()}
        </p>
      </span>

      <Link
        href={'/ask' as never}
        aria-label="Ask OneTUP"
        className="grid size-9 place-items-center rounded-full"
        style={{ background: 'var(--separator-soft)', color: 'var(--label-secondary)' }}
      >
        <IconAsk size={18} />
      </Link>
      <Link
        href={'/settings' as never}
        aria-label="Settings"
        className="grid size-9 place-items-center rounded-full desktop-only"
        style={{ background: 'var(--separator-soft)', color: 'var(--label-secondary)' }}
      >
        <IconSettings size={18} />
      </Link>
      </div>
    </header>
  )
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Manila',
  })
}
