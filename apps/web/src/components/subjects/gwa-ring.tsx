'use client'

import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'

/**
 * A GWA, drawn as a ring.
 *
 * TUP's scale runs the wrong way for a progress ring — 1.00 is the best mark
 * and 5.00 the worst — so the ring fills as the figure falls: a full ring is a
 * 1.00, an empty one a 5.00. The number itself is always printed beside the
 * ring, so the drawing is the glance and the figure is the reading; the ring
 * is hidden from assistive tech, which gets the figure instead.
 *
 * A null GWA draws an empty track rather than nothing, so the card keeps its
 * shape before the first grade lands.
 */
export function GwaRing({ value, size = 72 }: { value: number | null; size?: number }) {
  const stroke = Math.max(6, Math.round(size * 0.12))
  const radius = (size - stroke) / 2
  const fill = value === null ? 0 : Math.min(1, Math.max(0, (5 - value) / 4))

  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--tone-crimson-tint)"
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--tone-crimson)"
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: fill, opacity: fill > 0 ? 1 : 0 }}
        transition={{ ...transition(spring.ui), duration: 0.9 }}
      />
    </svg>
  )
}
