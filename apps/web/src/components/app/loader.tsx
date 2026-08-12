'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Mark } from '@/components/ui/mark'

/**
 * The wait.
 *
 * A spinner says "something is happening"; this says what. The lines are the
 * actual work — reading the timetable, doing the GWA arithmetic, checking the
 * weather against your departure — so a two-second wait teaches a student what
 * the app does instead of just costing them two seconds.
 *
 * One line is picked at random on mount and the rest follow in order from
 * there, so the same screen twice in a row does not read as a loop. Reduced
 * motion keeps the first line and drops the rotation: the point was never the
 * movement.
 */

const LINES = [
  'Reading your schedule…',
  'Counting your cuts…',
  'Doing the maths on your GWA…',
  'Checking what’s due next…',
  'Looking up the LRT…',
  'Finding your room…',
  'Working out when to leave…',
  'Catching up on your section…',
]

export function Loader({ label = 'Loading' }: { label?: string }) {
  const reduced = useReducedMotion()
  // Random only on the client, and only once — picking during render would
  // differ between the server and the first paint and trip hydration.
  const [start, setStart] = useState(0)
  const [step, setStep] = useState(0)

  useEffect(() => {
    setStart(Math.floor(Math.random() * LINES.length))
  }, [])

  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => setStep((value) => value + 1), 1900)
    return () => window.clearInterval(id)
  }, [reduced])

  const line = LINES[(start + step) % LINES.length]

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="flex min-h-[60dvh] w-full flex-col items-center justify-center gap-[var(--space-5)] px-[var(--space-6)] text-center"
    >
      <span className="relative grid h-16 w-16 place-items-center">
        {/* The ring is the only thing that spins. The mark stays upright,
            because a rotating logo is a toy and this is a wait. */}
        {!reduced && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              border: '2px solid var(--accent-subtle)',
              borderTopColor: 'var(--accent)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
        )}
        <motion.span
          aria-hidden
          className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)]"
          style={{
            background: 'var(--accent)',
            boxShadow: 'inset 0 1px 0 0 rgb(255 255 255 / 0.24)',
          }}
          animate={reduced ? undefined : { scale: [1, 0.94, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Mark size={22} color="var(--on-accent)" />
        </motion.span>
      </span>

      <span className="block h-[1.5em]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={line}
            className="type-callout block"
            style={{ color: 'var(--label-secondary)' }}
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -8 }}
            transition={{ duration: 0.24 }}
          >
            {line}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}
