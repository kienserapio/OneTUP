'use client'

import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { ButtonLink } from '@/components/ui/button'
import { IconCheck } from '@/components/ui/icon'

/**
 * The hero.
 *
 * One claim, one sentence that makes it concrete, one action. The three facts
 * underneath are the objections a student raises in the first two seconds —
 * what does it cost, does it work in a building with no signal, how much work
 * is it — answered before they are asked.
 */

const FACTS = ['Free forever', 'Works offline', 'One tap to log attendance']

export function Hero() {
  return (
    <section className="mx-auto w-full px-[var(--space-5)]" style={{ maxWidth: '68rem' }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition(spring.ui)}
        className="pb-[var(--space-16)] pt-[var(--space-12)] sm:pt-[var(--space-16)]"
      >
        {/* The eyebrow keeps the section-header idiom but takes the full label
            colour: at 13px the system's secondary grey does not clear AA. */}
        <p className="type-section-header" style={{ color: 'var(--label)' }}>
          Built by TUP students, for TUP students
        </p>

        <h1 className="type-display mt-[var(--space-4)] max-w-[16ch]">
          Everything about your classes, in one app.
        </h1>

        {/* The one place a size steps outside the interface scale: a marketing
            subhead has to carry from across the display gap the headline opens,
            and 17px under 68px reads as a caption. */}
        <p className="type-body mt-[var(--space-6)] max-w-[40ch] sm:max-w-[48ch] sm:text-[1.25rem] sm:leading-[1.45]">
          Your schedule, your cuts, your GWA, your deadlines, and the exact time you need to leave
          the house to make that 7&nbsp;AM class. OneTUP keeps it in one place, and it works even
          when campus wifi doesn&rsquo;t.
        </p>

        <div className="mt-[var(--space-8)] flex flex-col gap-[var(--space-3)] sm:flex-row sm:items-center">
          <ButtonLink href="/today" variant="accent" size="lg" className="w-full sm:w-auto">
            Open OneTUP
          </ButtonLink>
          <ButtonLink href="/campus" size="lg" className="w-full sm:w-auto">
            Browse the campus map
          </ButtonLink>
        </div>

        <ul className="mt-[var(--space-8)] flex flex-col gap-[var(--space-2)] sm:flex-row sm:flex-wrap sm:gap-x-[var(--space-6)]">
          {FACTS.map((fact) => (
            <li key={fact} className="type-subheadline flex items-center gap-[var(--space-2)]">
              <IconCheck
                size={17}
                strokeWidth={2.2}
                className="shrink-0"
                style={{ color: 'var(--ok)' }}
              />
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  )
}
