'use client'

import type { CSSProperties, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/**
 * Reveals.
 *
 * One curve for the whole page, so every arrival on it reads as the same
 * gesture: content rises a short distance and settles. The curve is the
 * `--ease-out` token expressed as a bezier, because Motion animates values on
 * the compositor and cannot read a custom property.
 *
 * Three rules the rest of the landing page relies on:
 *
 * 1. Reveals fire once. Content that re-animates every time it crosses the fold
 *    is decoration, and it makes scrolling back up feel broken.
 * 2. The travel is short — 28px, not 100. A long slide is the difference
 *    between a page that feels alive and a page that feels slow.
 * 3. Reduced motion keeps the fade and drops the travel. The reveal still says
 *    "this is new"; it just does not move.
 */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const DISTANCE = 28

export interface RevealProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Seconds. Only ever used to sequence siblings that are not a `Stagger`. */
  delay?: number
  distance?: number
  /** Fraction of the element that has to be visible before it reveals. */
  amount?: number
}

export function Reveal({
  children,
  className,
  style,
  delay = 0,
  distance = DISTANCE,
  amount = 0.2,
}: RevealProps) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: reduced ? 0 : distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: reduced ? 0.24 : 0.7, delay: reduced ? 0 : delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/**
 * A group whose children arrive one after another.
 *
 * `trigger="load"` is for the hero, which is already on screen when the page
 * opens and would otherwise wait for a scroll that never comes.
 */
export function Stagger({
  children,
  className,
  style,
  gap = 0.08,
  delay = 0,
  amount = 0.2,
  trigger = 'view',
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Seconds between siblings. */
  gap?: number
  delay?: number
  amount?: number
  trigger?: 'view' | 'load'
}) {
  const reduced = useReducedMotion()
  const sequence = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduced ? 0 : gap,
        delayChildren: reduced ? 0 : delay,
      },
    },
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      {...(trigger === 'load'
        ? { animate: 'visible' }
        : { whileInView: 'visible', viewport: { once: true, amount } })}
      variants={sequence}
    >
      {children}
    </motion.div>
  )
}

/** A child of `Stagger`. Outside one it does nothing, which is the bug you get
 * for free if the wrapper is ever removed. */
export function StaggerItem({
  children,
  className,
  style,
  distance = DISTANCE,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  distance?: number
}) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      style={style}
      variants={{
        hidden: { opacity: 0, y: reduced ? 0 : distance },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: reduced ? 0.24 : 0.65, ease: EASE },
        },
      }}
    >
      {children}
    </motion.div>
  )
}
