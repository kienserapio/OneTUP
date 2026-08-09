'use client'

import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { IconAsk } from '@/components/ui/icon'

/**
 * The commute exchange, rendered as the screen it actually is.
 *
 * A visitor reading a claim about jeepney fares has to take it on trust. A
 * visitor looking at the answer — the transfers, the minutes, the peso figure
 * with the student discount already taken off — does not. So this is the real
 * bubble and the real answer card from Ask, not a quotation of them.
 */

const EXCHANGES = [
  {
    question: 'How do I get to TUP from Caloocan?',
    answer:
      'Three ways work from Grace Park. The fastest is a jeep to Monumento, LRT-1 to Central Terminal, then an eight-minute walk — about 55 minutes for ₱41 with your student discount.',
  },
  {
    question: "What's the cheapest way home tonight?",
    answer:
      'Bus from Lawton via EDSA is ₱26 but takes 75 minutes. The last northbound LRT-1 trip leaves Central Terminal at 9:30 PM, so decide before then.',
  },
]

const LABELS = [
  'Fastest',
  'Cheapest',
  'Fewest transfers',
  'Rush-hour warnings',
  'Student fares',
  'Works offline',
]

export function CommuteDemo() {
  return (
    <div
      className="card squircle overflow-hidden"
      // A screenshot of a screen, so it carries the screen's own frame rather
      // than a marketing device around it.
      style={{ boxShadow: 'var(--shadow-float)' }}
    >
      <div
        className="flex items-center gap-[var(--space-2)] border-b px-[var(--space-4)] py-[var(--space-3)]"
        style={{ borderColor: 'var(--separator)' }}
      >
        <IconAsk size={17} style={{ color: 'var(--accent)' }} />
        <span className="type-footnote font-semibold">Ask</span>
      </div>

      <div className="flex flex-col gap-[var(--space-4)] p-[var(--space-4)]">
        {EXCHANGES.map((exchange, index) => (
          <motion.div
            key={exchange.question}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ ...transition(spring.snap), delay: index * 0.08 }}
            className="flex flex-col gap-[var(--space-2)]"
          >
            <div className="flex justify-end">
              <p
                className="type-body max-w-[85%] rounded-[var(--radius-lg)] px-[var(--space-4)] py-[var(--space-2)]"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {exchange.question}
              </p>
            </div>

            <div className="flex justify-start">
              <div
                className="squircle max-w-[92%] rounded-[var(--radius-lg)] px-[var(--space-4)] py-[var(--space-3)]"
                style={{
                  background: 'var(--bg-grouped-tertiary)',
                  boxShadow: 'var(--shadow-chip)',
                }}
              >
                <p className="type-body">{exchange.answer}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <ul
        className="flex flex-wrap gap-[var(--space-2)] border-t px-[var(--space-4)] py-[var(--space-4)]"
        style={{ borderColor: 'var(--separator)' }}
      >
        {LABELS.map((label) => (
          <li
            key={label}
            className="type-footnote rounded-[var(--radius-pill)] px-[var(--space-3)] py-[var(--space-1)]"
            style={{ background: 'var(--fill-quaternary)' }}
          >
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
