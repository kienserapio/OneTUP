'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import { IconCheck, IconExport, IconLock, IconShield, IconSparkleSmall } from '@/components/ui/icon'

/**
 * What OneTUP does with your data, as a bento.
 *
 * Four claims, four different weights. The two that decide whether a student
 * types an ERS password into this at all — that the password is never kept, and
 * that grades are visible to nobody else — get the wide cells; the two that
 * matter after that decision get the narrow ones. A four-up grid of identical
 * boxes would say all four are equally load-bearing, and they are not.
 *
 * Every cell carries the same four parts in the same order: mark, claim,
 * qualifier, and a small mechanism that demonstrates the claim rather than
 * decorating it.
 */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** The same in-view stepped loop the feature visuals use: nothing animates on a
 * card that is not on screen. */
function useCycle(steps: number, intervalMs: number) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.3,
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (reduced || !inView) return
    const id = window.setInterval(() => setStep((value) => (value + 1) % steps), intervalMs)
    return () => window.clearInterval(id)
  }, [reduced, inView, steps, intervalMs])

  return { ref, step, reduced }
}

function Cell({
  icon,
  title,
  subtitle,
  visual,
  className,
  index,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  visual: ReactNode
  className?: string
  index: number
}) {
  const reduced = useReducedMotion()

  return (
    <motion.article
      className={cx(
        'squircle relative flex flex-col overflow-hidden rounded-[var(--radius-xl)] p-6 md:p-7',
        className,
      )}
      style={{ background: 'var(--surface-sunken)' }}
      initial={{ opacity: 0, y: reduced ? 0 : 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduced ? 0.24 : 0.7, delay: reduced ? 0 : index * 0.07, ease: EASE }}
      whileHover={reduced ? undefined : { y: -5, transition: { duration: 0.25, ease: EASE } }}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-sm)]"
        style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
      >
        {icon}
      </span>

      <h3 className="type-title-3 mt-5">{title}</h3>
      <p className="type-subheadline mt-2" style={{ color: 'var(--label-secondary)' }}>
        {subtitle}
      </p>

      {/* Bottom-aligned: cells in a bento row share a height, and a mechanism
          floating in the middle of the leftover space reads as a mistake. */}
      <div className="mt-6 flex flex-1 flex-col justify-end">{visual}</div>
    </motion.article>
  )
}

/** The shared inner surface every visual sits on. White on the sunken cell, so
 * the mechanism reads as a piece of the app rather than as an illustration. */
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx('squircle rounded-[var(--radius-md)] p-3', className)}
      style={{ background: 'var(--bg)', border: '1px solid var(--separator-soft)' }}
    >
      {children}
    </div>
  )
}

/* --- The four mechanisms -------------------------------------------------- */

/** Typed, used, gone. The dots fill, the schedule lands, the dots are dropped. */
function PasswordVisual() {
  const { ref, step, reduced } = useCycle(3, 1700)
  const phase = reduced ? 1 : step
  const dots = phase === 0 ? 8 : phase === 1 ? 8 : 0

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <Panel className="flex items-center justify-between gap-3">
        <span className="type-caption-1" style={{ color: 'var(--label-secondary)' }}>
          ERS password
        </span>
        <span className="flex h-4 items-center gap-1">
          {Array.from({ length: 8 }).map((_, index) => (
            <motion.span
              key={index}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--label-tertiary)' }}
              animate={{
                opacity: index < dots ? 1 : 0,
                scale: index < dots ? 1 : 0.4,
              }}
              transition={{ duration: 0.28, delay: reduced ? 0 : index * 0.045, ease: EASE }}
            />
          ))}
        </span>
      </Panel>

      <div className="flex items-center gap-2">
        <motion.span
          aria-hidden
          className="h-4 w-px"
          style={{
            background: 'var(--separator)',
            marginLeft: '0.75rem',
            transformOrigin: 'top center',
          }}
          animate={{ scaleY: phase >= 1 ? 1 : 0.2 }}
          transition={{ duration: 0.3 }}
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={phase >= 2 ? 'gone' : 'used'}
            className="type-caption-1 inline-flex items-center gap-1.5"
            style={{ color: 'var(--label-secondary)' }}
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -6 }}
            transition={{ duration: 0.22 }}
          >
            {phase >= 2 ? (
              <>
                <IconLock size={14} style={{ color: 'var(--ok)' }} />
                Discarded — nowhere left to leak from
              </>
            ) : (
              <>
                <IconCheck size={14} style={{ color: 'var(--ok)' }} />
                Read your schedule once
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}

/** One row you can read, three nobody can. */
function PrivateVisual() {
  const rows = ['Faculty', 'Admin', 'Your section'] as const
  const { ref, step, reduced } = useCycle(rows.length, 1500)

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <Panel className="flex items-center justify-between gap-3">
        <span className="type-footnote font-semibold">You</span>
        <span className="type-data type-footnote font-semibold" style={{ color: 'var(--accent)' }}>
          GWA 1.75 · 2 cuts
        </span>
      </Panel>

      {rows.map((row, index) => {
        const knocking = !reduced && index === step
        return (
          <Panel key={row} className="flex items-center justify-between gap-3">
            <span className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
              {row}
            </span>
            <motion.span
              className="type-caption-1 inline-flex items-center gap-1.5"
              style={{ color: 'var(--label-tertiary)' }}
              animate={knocking ? { x: [0, -2, 2, -1, 0] } : { x: 0 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
              <IconLock size={13} />
              No access
            </motion.span>
          </Panel>
        )
      })}
    </div>
  )
}

/** A draft being written, wearing its label the whole time. */
function LabelledVisual() {
  const { ref, step, reduced } = useCycle(4, 900)
  const written = reduced ? 3 : step
  const lines = ['86%', '72%', '94%']

  return (
    <div ref={ref}>
      <Panel className="flex flex-col gap-2">
        <span className="flex items-center gap-2">
          <span className="badge badge-generated">
            <IconSparkleSmall size={11} />
            Generated
          </span>
          <span className="type-caption-2" style={{ color: 'var(--label-tertiary)' }}>
            from your notes
          </span>
        </span>

        {lines.map((width, index) => (
          <motion.span
            key={width}
            className="block h-2 rounded-full"
            style={{ background: 'var(--fill-tertiary)', transformOrigin: 'left center' }}
            initial={false}
            animate={{ width: index < written ? width : '0%' }}
            transition={{ duration: 0.45, ease: EASE }}
          />
        ))}
      </Panel>
    </div>
  )
}

/** Everything walks out with you, and the account goes with it. */
function PortableVisual() {
  const { ref, step, reduced } = useCycle(3, 1500)
  const phase = reduced ? 1 : step

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <Panel className="flex items-center gap-3">
        <motion.span
          className="shrink-0"
          style={{ color: 'var(--accent)' }}
          animate={reduced ? undefined : { y: phase === 1 ? -3 : 0 }}
          transition={transition(spring.snap)}
        >
          <IconExport size={18} />
        </motion.span>
        <span className="min-w-0 flex-1">
          <span className="type-footnote block font-semibold">onetup-export.json</span>
          <span
            className="mt-1.5 block h-1 overflow-hidden rounded-full"
            style={{ background: 'var(--fill-tertiary)' }}
          >
            <motion.span
              className="block h-full rounded-full"
              style={{ background: 'var(--accent)' }}
              animate={{ width: phase === 0 ? '18%' : '100%' }}
              transition={{ duration: 0.7, ease: EASE }}
            />
          </span>
        </span>
      </Panel>

      <Panel className="flex items-center justify-between gap-3">
        <span className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
          Delete account
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={phase === 2 ? 'done' : 'idle'}
            className="type-caption-1 inline-flex items-center gap-1.5"
            style={{ color: phase === 2 ? 'var(--ok)' : 'var(--label-tertiary)' }}
            initial={{ opacity: 0, y: reduced ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -5 }}
            transition={{ duration: 0.2 }}
          >
            {phase === 2 ? (
              <>
                <IconCheck size={13} strokeWidth={2.4} />
                Actually deleted
              </>
            ) : (
              'Removes every row'
            )}
          </motion.span>
        </AnimatePresence>
      </Panel>
    </div>
  )
}

export function DataBento() {
  return (
    <div className="mt-12 grid gap-3 md:grid-cols-3 md:gap-4">
      <Cell
        index={0}
        className="md:col-span-2"
        icon={<IconLock size={20} />}
        title="Never saves your password"
        subtitle="Not your ERS login, not your Facebook."
        visual={<PasswordVisual />}
      />
      <Cell
        index={1}
        icon={<IconShield size={20} />}
        title="Grades and cuts stay yours"
        subtitle="No rankings, no reports, nothing visible to faculty or admin."
        visual={<PrivateVisual />}
      />
      <Cell
        index={2}
        icon={<IconSparkleSmall size={20} />}
        title="AI is labelled where it’s used"
        subtitle="It drafts from your notes. It never invents a grade or a jeepney route."
        visual={<LabelledVisual />}
      />
      <Cell
        index={3}
        className="md:col-span-2"
        icon={<IconExport size={20} />}
        title="You can take it all with you"
        subtitle="Export everything, any time. Delete your account and it’s actually deleted."
        visual={<PortableVisual />}
      />
    </div>
  )
}
