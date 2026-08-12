'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import {
  IconAlarm,
  IconAnnouncement,
  IconCheck,
  IconClose,
  IconCommute,
  IconDeadlines,
  IconWarning,
} from '@/components/ui/icon'

/**
 * The six visuals.
 *
 * Each one is the screen it describes, built from the same tokens and the same
 * components the app itself uses — not a screenshot, not a placeholder, not a
 * stock illustration. A student reading a claim about counted cuts has to take
 * it on trust; a student watching the row count them does not.
 *
 * They loop, because a still picture of a screen proves the screen exists and a
 * moving one proves it works. Three rules keep that from becoming noise:
 *
 * 1. Nothing animates off screen. Every loop is driven by `useCycle`, which
 *    only ticks while its card is actually in view — six simultaneous timers on
 *    a mid-range phone is exactly the kind of thing that makes a page feel
 *    cheap.
 * 2. Reduced motion freezes each visual on its most informative frame rather
 *    than blanking it. The information was never the movement.
 * 3. Only transform and opacity move. Widths animate through Motion, which
 *    keeps them off the main thread.
 *
 * The numbers are sample data, kept to the ones the content spec already uses
 * (the 5:40 departure, the ₱41 fare, CS 3105) so nothing here promises anything
 * the product does not do.
 */

/**
 * A stepped loop that runs only while the visual is on screen.
 *
 * Returns the ref to hang on the visual's root — attaching it anywhere else is
 * how you get a loop that runs for the whole session.
 */
function useCycle(steps: number, intervalMs: number) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.3 },
    )
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

function Frame({
  children,
  label,
  rootRef,
}: {
  children: ReactNode
  label: string
  rootRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={rootRef}
      className="squircle overflow-hidden rounded-[var(--radius-md)] border"
      style={{ borderColor: 'var(--separator)', background: 'var(--surface-sunken)' }}
    >
      <p
        className="type-caption-2 border-b px-4 py-2 font-semibold uppercase tracking-widest"
        style={{ borderColor: 'var(--separator-soft)', color: 'var(--label-secondary)' }}
      >
        {label}
      </p>
      <div className="p-4">{children}</div>
    </div>
  )
}

/** A control the mock only depicts. Never a real button — a dead affordance is
 * worse than a picture of one. */
function MockAction({
  children,
  tone,
  pressed,
}: {
  children: ReactNode
  tone?: 'accent'
  pressed?: boolean
}) {
  return (
    <motion.span
      className="type-footnote inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold"
      animate={{ scale: pressed ? 0.94 : 1 }}
      transition={transition(spring.snap)}
      style={
        tone === 'accent'
          ? { background: 'var(--accent)', color: 'var(--on-accent)' }
          : { background: 'var(--fill-quaternary)', color: 'var(--label-secondary)' }
      }
    >
      {children}
    </motion.span>
  )
}

export function DepartureVisual() {
  const steps = [
    { time: '4:55 AM', label: 'Wake up' },
    { time: '5:40 AM', label: 'Leave the house' },
    { time: '7:00 AM', label: 'CS 3105 — Rm 312' },
  ]
  /* Reduced motion lands on "Leave the house", which is the step the copy
   * beside the card is actually about. */
  const { ref, step, reduced } = useCycle(steps.length, 1800)
  const active = reduced ? 1 : step

  return (
    <Frame label="Today" rootRef={ref}>
      <ol className="flex flex-col">
        {steps.map((item, index) => {
          const reached = index <= active
          return (
            <li key={item.time} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="relative mt-1.5 grid h-2 w-2 shrink-0 place-items-center">
                  {/* The pulse is a second ring so the dot itself never moves
                      and the row cannot shift under it. */}
                  {index === active && !reduced && (
                    <motion.span
                      className="absolute inset-0 rounded-full"
                      style={{ background: 'var(--accent)' }}
                      animate={{ scale: [1, 2.6], opacity: [0.45, 0] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}
                  <motion.span
                    className="h-2 w-2 rounded-full"
                    animate={{
                      backgroundColor: reached ? 'var(--accent)' : 'var(--label-quaternary)',
                    }}
                    transition={{ duration: 0.35 }}
                  />
                </span>
                {index < steps.length - 1 && (
                  <span
                    className="relative w-px flex-1 overflow-hidden"
                    style={{ background: 'var(--separator)' }}
                  >
                    <motion.span
                      className="absolute inset-x-0 top-0 origin-top"
                      style={{ background: 'var(--accent)', bottom: 0 }}
                      animate={{ scaleY: index < active ? 1 : 0 }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    />
                  </span>
                )}
              </div>
              <div className="pb-4">
                <p className="type-data type-footnote" style={{ color: 'var(--label-secondary)' }}>
                  {item.time}
                </p>
                <motion.p
                  className="type-callout font-semibold"
                  animate={{ opacity: index === active ? 1 : 0.55 }}
                  transition={{ duration: 0.35 }}
                >
                  {item.label}
                </motion.p>
              </div>
            </li>
          )
        })}
      </ol>

      <p
        className="type-footnote flex items-start gap-2 rounded-[var(--radius-sm)] p-3"
        style={{ background: 'var(--bg)', color: 'var(--label-secondary)' }}
      >
        <motion.span
          className="mt-px shrink-0"
          style={{ color: 'var(--accent)', transformOrigin: '50% 20%' }}
          animate={reduced ? undefined : { rotate: [0, -12, 12, -8, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
        >
          <IconAlarm size={17} />
        </motion.span>
        Rush hour adds about 20 minutes on LRT-1 and rain is forecast at 6&nbsp;AM, so your alarm
        moved 15 minutes earlier.
      </p>
    </Frame>
  )
}

export function AttendanceVisual() {
  /* 0 asks, 1 is the tap, 2 counts it, 3 warns. */
  const { ref, step, reduced } = useCycle(4, 1500)
  const phase = reduced ? 3 : step
  const counted = phase >= 2
  const absences = counted ? 8 : 7

  return (
    <Frame label="After class" rootRef={ref}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-callout font-semibold">CS 3105 — were you there?</p>
        <div className="flex gap-2">
          <MockAction tone="accent" pressed={phase === 1}>
            <IconCheck size={15} strokeWidth={2.4} />
            Yes
          </MockAction>
          <MockAction>
            <IconClose size={15} strokeWidth={2.4} />
            No
          </MockAction>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full"
          style={{ background: 'var(--fill-tertiary)' }}
        >
          <motion.span
            className="block h-full rounded-full"
            style={{ background: 'var(--warning)' }}
            animate={{ width: counted ? '89%' : '78%' }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <p
          className="type-data type-footnote tabular-nums"
          style={{ color: 'var(--label-secondary)' }}
        >
          <RollingValue value={absences} /> of 9 absences
        </p>
      </div>

      <motion.p
        className="type-footnote mt-3 flex items-start gap-2"
        style={{ color: 'var(--label-secondary)' }}
        animate={{ opacity: phase >= 3 ? 1 : 0.25 }}
        transition={{ duration: 0.4 }}
      >
        <IconWarning size={17} className="mt-px shrink-0" style={{ color: 'var(--warning)' }} />
        One more absence in CS 3105 and it affects your grade.
      </motion.p>
    </Frame>
  )
}

/** A number that rolls rather than swapping. Height is fixed by the line box, so
 * the row it sits in never reflows. */
function RollingValue({ value }: { value: number | string }) {
  const reduced = useReducedMotion()
  if (reduced) return <span>{value}</span>

  return (
    <span className="relative inline-grid overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          className="col-start-1 row-start-1"
          initial={{ y: '-90%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '90%', opacity: 0 }}
          transition={transition(spring.snap)}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function GwaVisual() {
  const marks = ['1.92', '1.83', '1.75'] as const
  const { ref, step, reduced } = useCycle(marks.length, 2000)
  const index = reduced ? marks.length - 1 : step
  /* 1.00 is the ceiling and 3.00 the floor, so progress runs backwards: the
   * closer to the target, the fuller the track. */
  const progress = [0.42, 0.7, 1][index]

  return (
    <Frame label="Grades" rootRef={ref}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caption-1" style={{ color: 'var(--label-secondary)' }}>
            GWA this term
          </p>
          <p className="type-figure mt-1">
            <RollingValue value={marks[index]} />
          </p>
        </div>
        <div className="text-right">
          <p className="type-caption-1" style={{ color: 'var(--label-secondary)' }}>
            Target
          </p>
          <p className="type-data type-title-2 mt-1" style={{ color: 'var(--accent)' }}>
            1.50
          </p>
        </div>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full"
        style={{ background: 'var(--fill-tertiary)' }}
      >
        <motion.span
          className="block h-full rounded-full"
          style={{ background: 'var(--accent)' }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <div
        className="mt-4 flex flex-col gap-2 rounded-[var(--radius-sm)] p-3"
        style={{ background: 'var(--bg)' }}
      >
        {[
          { subject: 'CS 3105', needed: '1.25' },
          { subject: 'CS 3107', needed: '1.50' },
          { subject: 'GEED 10123', needed: '1.75' },
        ].map((row, rowIndex) => (
          <motion.p
            key={row.subject}
            className="type-footnote flex items-center justify-between gap-3"
            animate={{ opacity: reduced || rowIndex <= index ? 1 : 0.4 }}
            transition={{ duration: 0.4 }}
          >
            <span style={{ color: 'var(--label-secondary)' }}>{row.subject}</span>
            <span className="type-data font-semibold">needs {row.needed}</span>
          </motion.p>
        ))}
      </div>
    </Frame>
  )
}

export function DeadlinesVisual() {
  const items = [
    { title: 'Sprint 2 documentation', subject: 'CS 3105', due: 'Tomorrow' },
    { title: 'Long quiz', subject: 'CS 3107', due: 'Friday' },
    { title: 'Reflection paper', subject: 'GEED 10123', due: 'Next Tuesday' },
    { title: 'Lab report 4', subject: 'PHYS 10143', due: 'Next Thursday' },
  ]
  /* The list is the animation: one arrives at the top, the last one leaves. */
  const { ref, step, reduced } = useCycle(items.length, 2400)
  const order = reduced ? items.slice(0, 3) : [0, 1, 2].map((offset) => items[(step + offset) % items.length])

  return (
    <Frame label="Due next" rootRef={ref}>
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {order.map((item) => (
            <motion.li
              key={item.title}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={transition(spring.move)}
              className="flex items-center gap-3 rounded-[var(--radius-sm)] p-3"
              style={{ background: 'var(--bg)' }}
            >
              <IconDeadlines
                size={20}
                className="shrink-0"
                style={{ color: 'var(--label-tertiary)' }}
              />
              <span className="min-w-0 flex-1">
                <span className="type-callout block truncate font-semibold">{item.title}</span>
                <span
                  className="type-caption-1 block truncate"
                  style={{ color: 'var(--label-secondary)' }}
                >
                  {item.subject}
                </span>
              </span>
              <span
                className="type-data type-caption-1 shrink-0"
                style={{ color: 'var(--accent)' }}
              >
                {item.due}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Frame>
  )
}

export function AnnouncementsVisual() {
  /* 0 arrives, 1 sits, 2 is the tap, 3 confirms. */
  const { ref, step, reduced } = useCycle(4, 1500)
  const phase = reduced ? 1 : step
  const added = phase === 3

  return (
    <Frame label="From your section" rootRef={ref}>
      <div className="flex gap-3">
        <motion.span
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--accent)', transformOrigin: '50% 30%' }}
          animate={reduced || phase !== 0 ? { rotate: 0 } : { rotate: [0, -14, 12, -6, 0] }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
        >
          <IconAnnouncement size={20} />
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="type-callout font-semibold">CS 3107: long quiz moved to Friday</p>
          <p className="type-caption-1 mt-1" style={{ color: 'var(--label-secondary)' }}>
            Posted once by your class representative · everyone in the section has it
          </p>
          <div className="mt-3">
            <MockAction tone="accent" pressed={phase === 2}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={added ? 'done' : 'idle'}
                  className="inline-flex items-center gap-1.5"
                  initial={{ opacity: 0, y: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduced ? 0 : -6 }}
                  transition={{ duration: 0.2 }}
                >
                  {added ? (
                    <>
                      <IconCheck size={15} strokeWidth={2.4} />
                      Added to deadlines
                    </>
                  ) : (
                    'Make it a deadline'
                  )}
                </motion.span>
              </AnimatePresence>
            </MockAction>
          </div>
        </div>
      </div>

      <p
        className="type-footnote mt-4 border-t pt-3"
        style={{ borderColor: 'var(--separator-soft)', color: 'var(--label-secondary)' }}
      >
        Classes suspended today.
      </p>
    </Frame>
  )
}

export function CommuteVisual() {
  const legs = ['Jeep to Monumento', 'LRT-1 to Central Terminal', '8-minute walk']
  const { ref, step, reduced } = useCycle(legs.length, 1600)
  const active = reduced ? legs.length - 1 : step

  return (
    <Frame label="Grace Park → TUP Manila" rootRef={ref}>
      <ol className="flex flex-col gap-2">
        {legs.map((leg, index) => {
          const current = index === active
          return (
            <li key={leg} className="flex items-center gap-3">
              <motion.span
                className="type-caption-2 grid h-6 w-6 shrink-0 place-items-center rounded-full font-semibold"
                animate={{
                  backgroundColor: current ? 'var(--accent)' : 'var(--fill-quaternary)',
                  color: current ? 'var(--on-accent)' : 'var(--label-secondary)',
                  scale: current ? 1.08 : 1,
                }}
                transition={transition(spring.snap)}
              >
                {index + 1}
              </motion.span>
              <motion.span
                className="type-callout"
                animate={{ opacity: current ? 1 : 0.55 }}
                transition={{ duration: 0.35 }}
              >
                {leg}
              </motion.span>
            </li>
          )
        })}
      </ol>

      <div
        className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-sm)] p-3"
        style={{ background: 'var(--bg)' }}
      >
        <motion.span
          className="shrink-0"
          style={{ color: 'var(--accent)' }}
          animate={reduced ? undefined : { x: [0, 3, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <IconCommute size={20} />
        </motion.span>
        <p className="type-data type-callout font-semibold">55 minutes · ₱41</p>
        <p className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
          student discount applied
        </p>
      </div>
    </Frame>
  )
}
