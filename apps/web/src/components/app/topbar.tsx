'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { useScrollChrome } from '@/lib/hooks/use-scroll-chrome'
import { titleFor } from './nav-items'
import { NotificationsButton } from './notifications-popover'
import { IconProfile } from '@/components/ui/icon'
import { Mark } from '@/components/ui/mark'

/**
 * The top bar.
 *
 * At rest it is not a bar at all — the brand mark and today's date sitting on
 * the canvas, with the page's own large title right underneath. Once content
 * scrolls under it, it takes on a frosted surface and the page title fades in
 * where the date was, so the student always knows where they are without the
 * screen carrying two titles at once. On a phone it slides away while reading
 * down and returns on the first scroll up, in step with the bottom bar.
 *
 * Two round actions on the right: the notifications bell, with a count of
 * what is new, and the student's own settings. The bar shows at every width,
 * so the bell is reachable beside the desktop sidebar too.
 */
export function Topbar() {
  const pathname = usePathname()
  const title = titleFor(pathname)
  const { scrolled, hidden } = useScrollChrome()

  return (
    <header className="topbar" data-scrolled={scrolled} data-hidden={hidden}>
      <div className="topbar-inner">
        <span className="brand-mark mobile-only" aria-hidden>
          <Mark size={18} color="var(--on-accent)" />
        </span>

        <span className="relative h-[2.25rem] min-w-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            {scrolled ? (
              <motion.span
                key="title"
                className="absolute inset-0 flex items-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={transition(spring.snap)}
              >
                <h1 className="truncate text-[1.0625rem] font-semibold tracking-[-0.015em]">
                  {title}
                </h1>
              </motion.span>
            ) : (
              <motion.span
                key="date"
                className="absolute inset-0 flex flex-col justify-center"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={transition(spring.snap)}
              >
                <span className="sr-only">{title}</span>
                <span className="text-[0.75rem] font-medium leading-tight text-[var(--label-tertiary)]">
                  {formatWeekday()}
                </span>
                <span className="truncate text-[0.9375rem] font-semibold leading-tight">
                  {formatDate()}
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <NotificationsButton />
        <RoundLink href="/settings" label="Settings">
          <IconProfile aria-hidden size={22} />
        </RoundLink>
      </div>
    </header>
  )
}

function RoundLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href as never}
      aria-label={label}
      className="chrome-button"
    >
      {children}
    </Link>
  )
}

function formatWeekday(): string {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    timeZone: 'Asia/Manila',
  })
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Manila',
  })
}
