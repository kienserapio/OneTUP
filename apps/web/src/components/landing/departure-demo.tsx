'use client'

import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { IconAlarm } from '@/components/ui/icon'

/**
 * The departure plan, as it appears at the top of Today.
 *
 * The second line is the whole argument for the feature: an alarm that moved
 * says why it moved. A student who is told to get up fifteen minutes earlier
 * with no reason turns the alarm off; a student who is told rain is forecast at
 * six does not.
 */
export function DepartureDemo() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={transition(spring.ui)}
      className="card squircle p-[var(--space-4)]"
      style={{ boxShadow: 'var(--shadow-float)' }}
    >
      <div className="flex items-start gap-[var(--space-3)]">
        <IconAlarm size={24} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />

        <div className="min-w-0 flex-1">
          <p className="type-title-3">
            <span className="type-data">Leave by 5:40 AM.</span>
          </p>
          <p className="type-body mt-[var(--space-1)]">
            <span className="type-data">Wake at 4:55.</span>
          </p>
          <p className="type-footnote mt-[var(--space-3)]">
            Rush hour adds about 20 minutes on LRT-1 and rain is forecast at 6 AM, so your alarm
            moved 15 minutes earlier.
          </p>
        </div>
      </div>
    </motion.div>
  )
}
