'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { ButtonLink } from '@/components/ui/button'
import { IconChevronRight, IconMap, IconToday } from '@/components/ui/icon'
import { Mark } from '@/components/ui/mark'

/**
 * The public navigation.
 *
 * One bar for every public page, floating over the hero rather than framing it.
 * It is the app's own chrome — a white pill with a lit rim and a soft shadow, gray
 * destinations that turn crimson, one crimson primary — so the way in looks like
 * what is inside.
 *
 * The layout is a three-column grid rather than a flex row with spacers,
 * because the destinations have to sit on the true centre of the bar no matter
 * how wide the wordmark or the campus button get.
 *
 * Below `md` the destinations collapse into the menu. That is the only place a
 * hamburger is correct: on a desktop there is room for four things, and hiding
 * them behind a control the visitor has to discover costs a click for nothing.
 */

const LINKS = [
  { href: '/#about', label: 'About', match: 'about' },
  { href: '/#features', label: 'Features', match: 'features' },
  { href: '/docs', label: 'Docs', match: 'docs' },
] as const

type Match = (typeof LINKS)[number]['match']

export function SiteNav() {
  const pathname = usePathname()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<Match | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const onLanding = pathname === '/'

  /* Which destination is being read. Only meaningful on the landing page, where
   * two of the three are sections rather than routes. */
  useEffect(() => {
    if (!onLanding) {
      setActive(pathname.startsWith('/docs') ? 'docs' : null)
      return
    }

    const sections = ['about', 'features']
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)

    if (sections.length === 0) return

    /* Tracked as a set rather than "whichever fired last": past the last
     * section nothing is intersecting, and the marker has to go out rather than
     * stay lit on a destination the reader has already scrolled by. */
    const reading = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reading.add(entry.target.id)
          else reading.delete(entry.target.id)
        }
        const first = sections.find((section) => reading.has(section.id))
        setActive(first ? (first.id as Match) : null)
      },
      // The band is the middle of the viewport: a section counts as "being
      // read" when it is under the reader's eye, not when it first appears.
      { rootMargin: '-45% 0px -50% 0px' },
    )

    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [onLanding, pathname])

  // Closing on Escape, on an outside press, and on a route change — the third
  // matters because the menu's own links do not unmount it.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggleRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  useEffect(() => setOpen(false), [pathname])

  return (
    <motion.div
      ref={rootRef}
      className="fixed inset-x-0 top-0 z-50 px-[var(--space-3)] md:px-[var(--space-5)]"
      style={{ paddingTop: 'calc(var(--space-3) + env(safe-area-inset-top))' }}
      initial={{ opacity: 0, y: reduced ? 0 : -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.24 : 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <nav
        aria-label="Main"
        className="lp-nav relative mx-auto grid w-full grid-cols-[1fr_auto] items-center gap-[var(--space-2)] py-[var(--space-2)] pl-[var(--space-4)] pr-[var(--space-2)] md:grid-cols-[1fr_auto_1fr] md:pl-[var(--space-5)] md:pr-[var(--space-2)]"
        style={{ maxWidth: '68rem' }}
      >
        <Link
          href="/"
          className="flex min-h-[var(--target-min)] w-fit items-center gap-[var(--space-2)]"
          aria-label="OneTUP — home"
        >
          <Mark size={26} className="shrink-0" />
          <span className="text-[1.0625rem] font-bold tracking-[-0.02em]">OneTUP</span>
        </Link>

        {/* The destinations. Equal cells, so the row stays balanced whatever
            the labels are, and the marker is one element that moves rather
            than a background that switches on and off. */}
        <ul className="hidden md:grid md:auto-cols-fr md:grid-flow-col md:items-center">
          {LINKS.map((link) => {
            const current = active === link.match
            return (
              <li key={link.href} className="grid">
                <Link
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className="lp-nav-link relative isolate flex min-h-[var(--target-min)] items-center justify-center rounded-[var(--radius-pill)] px-[var(--space-4)]"
                >
                  {current && (
                    <motion.span
                      aria-hidden
                      layoutId="nav-marker"
                      transition={transition(spring.snap)}
                      className="absolute inset-0 -z-10 rounded-[var(--radius-pill)]"
                      style={{ background: 'var(--accent-subtle)' }}
                    />
                  )}
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center justify-end gap-[var(--space-2)]">
          {/* Wrapped rather than given `hidden md:inline-flex`: `.glass` is
              written as plain CSS, which outranks Tailwind's utilities layer,
              so `display: none` on the control itself is silently dropped. */}
          <span className="hidden items-center gap-[var(--space-2)] md:flex">
            <ButtonLink
              href="/campus"
              size="sm"
              leading={<IconMap size={17} className="shrink-0" />}
            >
              View Campus Map
            </ButtonLink>
            <ButtonLink
              href="/today"
              variant="accent"
              size="sm"
              leading={<IconToday size={17} className="shrink-0" />}
            >
              Open OneTUP
            </ButtonLink>
          </span>

          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
            className="relative grid h-[var(--target-min)] w-[var(--target-min)] shrink-0 place-items-center rounded-full md:hidden"
          >
            <motion.span
              aria-hidden
              className="absolute h-[2px] w-5 rounded-full"
              style={{ background: 'var(--label-secondary)' }}
              animate={open ? { rotate: 45, y: 0 } : { rotate: 0, y: -4 }}
              transition={transition(spring.snap)}
            />
            <motion.span
              aria-hidden
              className="absolute h-[2px] w-5 rounded-full"
              style={{ background: 'var(--label-secondary)' }}
              animate={open ? { rotate: -45, y: 0 } : { rotate: 0, y: 4 }}
              transition={transition(spring.snap)}
            />
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              id="site-menu"
              className="lp-menu absolute inset-x-0 top-[calc(100%+var(--space-2))] origin-top overflow-hidden md:hidden"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={transition(spring.sheet)}
            >
              <ul className="flex flex-col gap-1.5">
                {LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      aria-current={active === link.match ? 'page' : undefined}
                      className="lp-menu-link"
                    >
                      {link.label}
                      <IconChevronRight size={18} className="text-[var(--label-quaternary)]" />
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-1.5 grid gap-1.5">
                <ButtonLink
                  href="/today"
                  variant="accent"
                  block
                  leading={<IconToday size={19} className="shrink-0" />}
                >
                  Open OneTUP
                </ButtonLink>
                <ButtonLink
                  href="/campus"
                  block
                  leading={<IconMap size={19} className="shrink-0" />}
                >
                  View Campus Map
                </ButtonLink>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.div>
  )
}
