'use client'

import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import type { Tone } from '@/components/ui/icon-tile'

/**
 * The one filter control, for Deadlines and Announcements alike.
 *
 * The two screens used to filter in two unrelated ways — toggle-able stat
 * tiles on one, select-one chips on the other — so a student learned the same
 * job twice. Both are now a row of pills: white at rest, the feature's tint
 * when pressed, and a count beside the label so the summary survives in the
 * control itself. `aria-pressed` either way; whether pressing again clears it
 * is the caller's choice.
 */
export function FilterChip({
  label,
  count,
  active,
  onSelect,
  tone,
  dot,
}: {
  label: string
  count?: number
  active: boolean
  onSelect: () => void
  /** The feature's tone, used for the pressed state. */
  tone: Tone
  /** A status colour shown as a dot before the label, e.g. overdue red. */
  dot?: string
}) {
  return (
    <motion.button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      whileTap={{ scale: 0.94 }}
      transition={transition(spring.snap)}
      className="flex min-h-[var(--target-min)] shrink-0 items-center gap-2 rounded-full px-4 text-[0.875rem] font-semibold transition-colors duration-150"
      style={{
        background: active ? `var(--tone-${tone}-tint)` : 'var(--bg)',
        color: active ? `var(--tone-${tone}-ink)` : 'var(--label-secondary)',
        boxShadow: active ? 'none' : 'var(--shadow-chip)',
      }}
    >
      {dot && (
        <span
          aria-hidden
          className="block size-2 shrink-0 rounded-full"
          style={{ background: dot }}
        />
      )}
      {label}
      {count !== undefined && (
        <span
          className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.75rem] font-bold tabular-nums"
          style={{
            background: active ? 'rgb(255 255 255 / 0.7)' : 'var(--fill-tertiary)',
            color: active ? `var(--tone-${tone}-ink)` : 'var(--label-secondary)',
          }}
        >
          {count}
        </span>
      )}
    </motion.button>
  )
}
