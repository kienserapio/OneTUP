'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { ButtonLink } from '@/components/ui/button'
import { Mark } from '@/components/ui/mark'
import { Reveal } from './reveal'
import {
  AnnouncementsVisual,
  AttendanceVisual,
  CommuteVisual,
  DeadlinesVisual,
  DepartureVisual,
  GwaVisual,
} from './feature-visuals'

/**
 * The six modules, read as a scroll.
 *
 * The left column is the table of contents and stays put; the cards arrive one
 * at a time on the right, rising into place on the same curve as everything
 * else on the page. The observer here is only for the index — which card is
 * being read, at 0.6 — because the reveal is Motion's job and firing both from
 * one threshold makes them impossible to tune separately.
 *
 * Hover lifts a card slightly and deepens its shadow. That is the whole
 * interaction: these are not links, and anything more would promise a click
 * that does not exist.
 */

interface Feature {
  id: string
  /** Short enough to sit in a fixed-width index without wrapping to three lines. */
  navLabel: string
  title: string
  description: ReactNode
  visual: ReactNode
}

const FEATURES: Feature[] = [
  {
    id: 'departure',
    navLabel: 'Your next class and when to leave',
    title: 'Your next class, and when to leave for it',
    description:
      'OneTUP works backwards from your first class — how long the commute takes, whether it’s rush hour, whether it’s raining, how long you take to get ready — and tells you when to wake up and when to walk out the door.',
    visual: <DepartureVisual />,
  },
  {
    id: 'cuts',
    navLabel: 'Cuts, counted for you',
    title: 'Cuts, counted for you',
    description:
      'One tap after class. OneTUP does the arithmetic and warns you before you hit the limit, per subject, so you find out with two absences left instead of none.',
    visual: <AttendanceVisual />,
  },
  {
    id: 'gwa',
    navLabel: 'GWA, and what you’d need',
    title: 'GWA, and what you’d need',
    description:
      'See where you stand now. Set a target and see the grade each remaining subject needs to get you there. Get warned when a scholarship or Dean’s List threshold starts slipping.',
    visual: <GwaVisual />,
  },
  {
    id: 'deadlines',
    navLabel: 'Every deadline in one list',
    title: 'Every deadline in one list',
    description:
      'Snap a photo of the whiteboard, or share the message from your class GC. It becomes a deadline with a reminder attached. Everything due, across every subject, sorted by what’s closest.',
    visual: <DeadlinesVisual />,
  },
  {
    id: 'announcements',
    navLabel: 'Announcements that actually reach you',
    title: 'Announcements that actually reach you',
    description:
      'Class suspended, quiz moved, room changed. Your class representative posts it once and it reaches everyone in the section, tagged to the right subject, with an option to turn it into a deadline in one tap.',
    visual: <AnnouncementsVisual />,
  },
  {
    id: 'commute',
    navLabel: 'How to get to TUP, with real fares',
    title: 'How to get to TUP, with real fares',
    description:
      'Routes from your area with the student discount already applied, actual travel times, and a warning when it’s rush hour. The routes come from students who ride them every day, not from a map that doesn’t know jeepneys exist.',
    visual: <CommuteVisual />,
  },
]

export function FeaturesSection() {
  const cardRefs = useRef<(HTMLElement | null)[]>([])
  const [active, setActive] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.6) continue
          const index = Number((entry.target as HTMLElement).dataset.index)
          if (!Number.isNaN(index)) setActive(index)
        }
      },
      { threshold: 0.6 },
    )

    for (const element of cardRefs.current) {
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [])

  const goTo = (index: number) => {
    cardRefs.current[index]?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'center',
    })
  }

  return (
    <section
      id="features"
      // `clip` rather than `hidden`: the off-screen start position of a card must
      // not add a horizontal scrollbar, and `overflow: hidden` here would break
      // the sticky index column.
      className="relative z-10 scroll-mt-24 overflow-x-clip px-5 py-20 md:px-10 md:py-40 lg:px-16"
      style={{ background: 'var(--bg)' }}
    >
      <div className="mx-auto max-w-[90rem] lg:grid lg:grid-cols-[400px_1fr] lg:gap-24 xl:grid-cols-[460px_1fr] xl:gap-48">
        <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:py-32">
          <Reveal>
            <h2 className="text-3xl leading-[1.15] tracking-tight sm:text-4xl md:text-5xl">
              Six things you check every day
            </h2>
            <p className="type-body mt-5 max-w-[38ch]" style={{ color: 'var(--label-secondary)' }}>
              Import your schedule once. Everything else builds on it.
            </p>
          </Reveal>

          {/* The index is a convenience on a wide screen and clutter on a narrow
              one, where the cards are already in reading order. */}
          <nav aria-label="Features" className="hidden lg:mt-12 lg:block">
            <ul className="flex flex-col gap-1">
              {FEATURES.map((feature, index) => (
                <li key={feature.id}>
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={active === index ? 'true' : undefined}
                    className="type-subheadline relative isolate flex min-h-[var(--target-min)] w-full items-center rounded-[var(--radius-sm)] px-3 text-left transition-colors"
                    style={{
                      color: active === index ? 'var(--crimson-700)' : 'var(--label-secondary)',
                      fontWeight: active === index ? 600 : 400,
                    }}
                  >
                    {active === index && (
                      <motion.span
                        aria-hidden
                        layoutId="feature-index-marker"
                        transition={transition(spring.snap)}
                        className="absolute inset-0 -z-10 rounded-[var(--radius-sm)]"
                        style={{ background: 'var(--accent-subtle)' }}
                      />
                    )}
                    {feature.navLabel}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-12 lg:mt-0">
            <ButtonLink href="/today" variant="accent" size="lg">
              Open OneTUP
            </ButtonLink>
            <p className="type-footnote mt-3" style={{ color: 'var(--label-secondary)' }}>
              Free forever. Works offline.
            </p>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-12 md:gap-20 lg:mt-0 lg:py-32">
          {FEATURES.map((feature, index) => (
            <motion.article
              key={feature.id}
              id={feature.id}
              data-index={index}
              ref={(element: HTMLElement | null) => {
                cardRefs.current[index] = element
              }}
              className="card squircle scroll-mt-24 p-5 md:p-8"
              initial={{ opacity: 0, y: reduced ? 0 : 36 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: reduced ? 0.24 : 0.7, ease: [0.16, 1, 0.3, 1] }}
              whileHover={
                reduced
                  ? undefined
                  : { y: -6, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }
              }
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <Mark size={28} />
              <h3 className="mt-5 text-xl leading-[1.2] tracking-tight sm:text-2xl">
                {feature.title}
              </h3>
              <div className="mt-6">{feature.visual}</div>
              <p className="type-body mt-6 max-w-[60ch]" style={{ color: 'var(--label-secondary)' }}>
                {feature.description}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}
