'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'

/**
 * The floating pill.
 *
 * A landing page has no app chrome to sit in, so the navigation floats over the
 * hero instead of framing it. Three destinations is not enough to justify a bar;
 * it is enough to justify a menu that gets out of the way.
 *
 * The hamburger is two lines that rotate into a cross on the same 300ms curve
 * the rest of the pill uses. Closed, the panel keeps its transition by staying
 * mounted — `inert` is what stops a hidden panel from swallowing tab stops,
 * which `opacity: 0` alone does not.
 */

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#campus', label: 'Campus' },
  { href: '#trust', label: 'Trust' },
] as const

const MENU_EASE = 'cubic-bezier(0.77, 0, 0.175, 1)'

export function LandingNav() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Focus has to come back to the control that opened the menu, or a
      // keyboard user is dropped at the top of the document.
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

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute left-1/2 top-6 z-50 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2"
    >
      <nav
        aria-label="Main"
        className="relative flex items-center justify-between gap-2 rounded-full border py-1.5 pl-5 pr-1.5"
        style={{
          background: 'var(--bg)',
          borderColor: 'var(--separator)',
          boxShadow: 'var(--shadow-float)',
        }}
      >
        <Link
          href="/"
          className="type-headline flex min-h-[var(--target-min)] items-center pr-2 tracking-tight"
        >
          OneTUP
        </Link>

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
          className="relative grid h-[var(--target-min)] w-[var(--target-min)] shrink-0 place-items-center rounded-full"
          style={{ background: 'var(--fill-quaternary)' }}
        >
          <span
            aria-hidden
            className="absolute h-[1.5px] w-5 rounded-full"
            style={{
              background: 'var(--label)',
              transition: `transform 300ms ${MENU_EASE}`,
              transform: open ? 'translateY(0) rotate(45deg)' : 'translateY(-4px)',
            }}
          />
          <span
            aria-hidden
            className="absolute h-[1.5px] w-5 rounded-full"
            style={{
              background: 'var(--label)',
              transition: `transform 300ms ${MENU_EASE}`,
              transform: open ? 'translateY(0) rotate(-45deg)' : 'translateY(4px)',
            }}
          />
        </button>

        <div
          id="landing-menu"
          inert={!open}
          className={cx(
            'absolute inset-x-0 top-[calc(100%+0.5rem)] origin-top rounded-[var(--radius-xl)] border p-1.5',
            open ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          style={{
            background: 'var(--bg)',
            borderColor: 'var(--separator)',
            boxShadow: 'var(--shadow-float)',
            transition: `opacity 300ms ${MENU_EASE}, transform 300ms ${MENU_EASE}`,
            transform: open ? 'translateY(0) scale(1)' : 'translateY(-0.5rem) scale(0.96)',
          }}
        >
          <ul className="flex flex-col">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="type-body flex min-h-[var(--target-min)] items-center rounded-[var(--radius-md)] px-4"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  )
}
