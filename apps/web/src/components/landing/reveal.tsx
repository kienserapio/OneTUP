'use client'

import type { ReactNode } from 'react'
import { MotionConfig, motion } from 'motion/react'

/**
 * Scroll reveals for the marketing page.
 *
 * A reveal is allowed to say "this is new on screen" and nothing more. It fades
 * and lifts a little over roughly the length of a nav transition, once, and then
 * never touches the element again — content that re-animates every time it
 * passes the fold is decoration, and decoration is what makes a page feel like
 * an advert rather than an app.
 *
 * `reducedMotion="user"` is Motion's own honouring of the OS setting: transform
 * animations are dropped to their end value and the opacity cross-fade stays,
 * which is exactly the substitution the token layer makes in CSS.
 */

export function LandingMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      // 0.4s on the standard ease-out curve — the same pair as --duration-slow
      // and --ease-out, restated here because a JS animation cannot read a
      // custom property.
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  )
}
