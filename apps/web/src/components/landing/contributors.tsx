'use client'

import { motion, useReducedMotion } from 'motion/react'

/**
 * The two pieces of the contributors page that move.
 *
 * `Initials` is the avatar. There are no photographs of anyone on this site and
 * there is not going to be — a monogram on a tinted disc identifies a person in
 * a list just as well, costs no request, and cannot become a picture of a
 * student that outlives their consent to it.
 *
 * `ContributorSlots` is the empty state for people who have not arrived yet. It
 * is drawn as real, waiting places rather than hidden until populated, because
 * an empty row that is obviously a row is an invitation and a missing section
 * is nothing at all.
 */

/* Hue is derived from the name, so a person's disc is stable across renders and
 * two people are unlikely to collide. Kept dark enough for white to clear AA. */
function hueOf(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360
  return hash
}

function initialsOf(name: string): string {
  const parts = name.split(/[\s-]+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function Initials({ name, large }: { name: string; large?: boolean }) {
  const reduced = useReducedMotion()
  const hue = hueOf(name)

  return (
    <motion.div
      aria-hidden
      whileHover={reduced ? undefined : { scale: 1.06, rotate: -3 }}
      transition={{ type: 'spring', stiffness: 420, damping: 16 }}
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${
        large ? 'h-16 w-16 text-xl' : 'h-11 w-11 text-sm'
      }`}
      style={{
        background: `linear-gradient(140deg, hsl(${hue} 62% 52%), hsl(${(hue + 28) % 360} 58% 38%))`,
        boxShadow: '0 1px 2px rgb(0 0 0 / 0.12), inset 0 1px 0 rgb(255 255 255 / 0.24)',
      }}
    >
      {initialsOf(name)}
    </motion.div>
  )
}

const SLOTS = 6

export function ContributorSlots() {
  const reduced = useReducedMotion()

  return (
    <ul className="flex flex-wrap gap-[var(--space-4)]">
      {Array.from({ length: SLOTS }, (_, index) => (
        <motion.li
          key={index}
          initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{
            duration: 0.45,
            delay: reduced ? 0 : index * 0.06,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="flex flex-col items-center gap-2"
        >
          <div
            className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed"
            style={{ borderColor: 'var(--separator)' }}
          >
            <span className="text-xl leading-none" style={{ color: 'var(--label-tertiary)' }}>
              +
            </span>
          </div>
          <span className="type-caption-2" style={{ color: 'var(--label-tertiary)' }}>
            You?
          </span>
        </motion.li>
      ))}
    </ul>
  )
}
