'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import {
  IconAlarm,
  IconAnnouncement,
  IconAttendance,
  IconCancelled,
  IconCheck,
  IconClose,
  IconClock,
  IconCommute,
  IconDeadlines,
  IconGrades,
  IconSchedule,
  IconShield,
  IconTrain,
  IconWalk,
  IconWarning,
  type IconProps,
} from '@/components/ui/icon'
import { Mark } from '@/components/ui/mark'
import { Row, RowPill } from '@/components/ui/row'
import { Watermark } from '@/components/ui/watermark'

/**
 * The six visuals.
 *
 * Each one is the screen it describes, built from the same pieces the app
 * itself uses — the crimson glass card, white glass cards, floating rows and
 * pills — not a screenshot, not a placeholder, not a stock illustration. A
 * student reading a claim about counted cuts has to take it on trust; a student
 * watching the row count them does not.
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

/** The screen the mock lives on: canvas grey, the app's mark and the page's name. */
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
    <div ref={rootRef} className="lp-screen squircle">
      <p className="lp-screen-bar">
        <Mark size={16} />
        {label}
      </p>
      <div className="lp-screen-body">{children}</div>
    </div>
  )
}

/** A control the mock only depicts. Never a real button — a dead affordance is
 * worse than a picture of one. It is the app's primary pill, icon and all. */
function MockAction({
  children,
  pressed,
}: {
  children: ReactNode
  pressed?: boolean
}) {
  return (
    <motion.span
      className="glass glass-accent glass-sm lp-mock-button"
      animate={{ scale: pressed ? 0.94 : 1 }}
      transition={transition(spring.snap)}
    >
      {children}
    </motion.span>
  )
}

/** A bare glyph in one of the two colours the app allows an icon: crimson when
 * it matters, gray when it does not. Never a tile behind it. */
function Glyph({
  Icon,
  size = 22,
  important,
  className,
}: {
  Icon: (props: IconProps) => ReactNode
  size?: number
  important?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      data-tone={important ? 'crimson' : 'gray'}
      className={cx('glyph grid place-items-center', className)}
    >
      <Icon size={size} />
    </span>
  )
}

/** The crimson card that leads the app's Home, here as the start of a journey. */
const CRIMSON_CARD = {
  borderRadius: 'var(--radius-xl)',
  color: 'var(--on-accent)',
} as const

export function DepartureVisual() {
  const steps = [
    { time: '4:55 AM', label: 'Wake up' },
    { time: '5:40 AM', label: 'Leave' },
    { time: '7:00 AM', label: 'Class' },
  ]
  /* Reduced motion lands on "Leave", which is the step the copy beside the card
   * is actually about. */
  const { ref, step, reduced } = useCycle(steps.length, 1800)
  const active = reduced ? 1 : step

  return (
    <Frame label="Today" rootRef={ref}>
      <section
        data-tone="crimson"
        className="card-glass squircle px-4 pb-4 pt-3.5"
        style={CRIMSON_CARD}
      >
        <Watermark Icon={IconSchedule} size={150} />

        <div className="flex items-center justify-between gap-3 text-[0.8125rem] font-semibold">
          <span style={{ color: 'rgb(255 255 255 / 0.8)' }}>Up next</span>
          <span className="tabular-nums">7:00 AM</span>
        </div>
        <h4 className="mt-2.5 text-[1.5rem] font-bold leading-tight tracking-[-0.025em]">
          CS 3105
        </h4>
        <p className="mt-1 text-[0.875rem]" style={{ color: 'rgb(255 255 255 / 0.8)' }}>
          Rm 312
        </p>

        {/* The same dotted track the app draws under the class, with a stop for
            each instant. The marker walks it; the filled part is the way done. */}
        <div className="mt-5" aria-hidden>
          <div className="relative mx-1.5 h-4">
            <span
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dotted"
              style={{ borderColor: 'rgb(255 255 255 / 0.35)' }}
            />
            <motion.span
              className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
              style={{ background: 'var(--on-accent)' }}
              animate={{ width: `${active * 50}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
            {steps.map((item, index) => (
              <span
                key={item.time}
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${index * 50}%`,
                  background: index <= active ? 'var(--on-accent)' : 'rgb(255 255 255 / 0.45)',
                }}
              />
            ))}
            <motion.span
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: 'var(--on-accent)',
                boxShadow: '0 0 0 5px rgb(255 255 255 / 0.25)',
              }}
              animate={{ left: `${active * 50}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <ol className="mt-2.5 grid grid-cols-3 text-[0.75rem] tabular-nums">
            {steps.map((item, index) => (
              <motion.li
                key={item.time}
                className={cx(index === 1 && 'text-center', index === 2 && 'text-right')}
                animate={{ opacity: index === active ? 1 : 0.6 }}
                transition={{ duration: 0.35 }}
              >
                <span className="block font-bold">{item.time}</span>
                <span className="block font-medium" style={{ color: 'rgb(255 255 255 / 0.8)' }}>
                  {item.label}
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <div className="row !min-h-0 items-start !gap-3 !py-3">
        <motion.span
          className="mt-px shrink-0"
          style={{ transformOrigin: '50% 20%' }}
          animate={reduced ? undefined : { rotate: [0, -12, 12, -8, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
        >
          <Glyph Icon={IconAlarm} size={20} important />
        </motion.span>
        <p className="text-[0.8125rem] font-semibold leading-snug">
          Rush hour adds about 20 minutes on LRT-1 and rain is forecast at 6&nbsp;AM, so your alarm
          moved 15 minutes earlier.
        </p>
      </div>
    </Frame>
  )
}

const ABSENCE_UNITS = 9

const ANSWERS = [
  { label: 'Present', Icon: IconCheck, tone: 'green' },
  { label: 'Absent', Icon: IconClose, tone: 'crimson' },
  { label: 'Late', Icon: IconClock, tone: 'crimson' },
  { label: 'Excused', Icon: IconShield, tone: 'gray' },
] as const

export function AttendanceVisual() {
  /* 0 asks, 1 is the tap, 2 counts it, 3 warns. */
  const { ref, step, reduced } = useCycle(4, 1500)
  const phase = reduced ? 3 : step
  const counted = phase >= 2
  const absences = counted ? 8 : 7

  return (
    <Frame label="After class" rootRef={ref}>
      <section className="card-glass squircle px-4 pb-4 pt-3.5">
        <Watermark Icon={IconAttendance} size={92} />

        <p className="text-[1.0625rem] font-bold leading-tight tracking-[-0.02em]">CS 3105</p>
        <p className="mt-0.5 text-[0.8125rem] font-medium text-[var(--label-secondary)]">
          Were you there?
        </p>

        {/* The app's four answers: green for present, crimson for the two that
            cost something, gray for excused. */}
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          {ANSWERS.map(({ label, Icon, tone }) => {
            const tapped = label === 'Present' && phase >= 1
            return (
              <motion.span
                key={label}
                className="flex h-10 items-center justify-center gap-1.5 rounded-full text-[0.8125rem] font-semibold"
                style={{
                  background: `var(--tone-${tone}-tint)`,
                  color: `var(--tone-${tone}-ink)`,
                  boxShadow: tapped ? `inset 0 0 0 2px var(--tone-${tone})` : undefined,
                }}
                animate={{ scale: label === 'Present' && phase === 1 ? 0.94 : 1 }}
                transition={transition(spring.snap)}
              >
                <Icon size={16} />
                {label}
              </motion.span>
            )
          })}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-1 gap-1" aria-hidden>
            {Array.from({ length: ABSENCE_UNITS }).map((_, index) => (
              <motion.span
                key={index}
                className="lp-segment"
                animate={{
                  backgroundColor:
                    index < absences
                      ? counted && index >= 7
                        ? 'var(--tone-crimson)'
                        : 'var(--label-tertiary)'
                      : 'var(--fill-tertiary)',
                }}
                transition={{ duration: 0.4 }}
              />
            ))}
          </div>
          <p className="text-[0.8125rem] font-semibold tabular-nums text-[var(--label-secondary)]">
            <RollingValue value={absences} /> of {ABSENCE_UNITS} absences
          </p>
        </div>
      </section>

      <motion.div
        className="row !min-h-0 items-start !gap-3 !py-3"
        animate={{ opacity: phase >= 3 ? 1 : 0.3 }}
        transition={{ duration: 0.4 }}
      >
        <Glyph Icon={IconWarning} size={20} important className="mt-px" />
        <p className="text-[0.8125rem] font-semibold leading-snug">
          One more absence in CS 3105 and it affects your grade.
        </p>
      </motion.div>
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
      <section className="card-glass squircle px-4 pb-4 pt-3.5">
        <Watermark Icon={IconGrades} size={84} />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.8125rem] font-semibold text-[var(--label-secondary)]">
              GWA this term
            </p>
            <p className="mt-1 text-[2.5rem] font-bold leading-none tracking-[-0.04em] tabular-nums">
              <RollingValue value={marks[index]} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.8125rem] font-semibold text-[var(--label-secondary)]">Target</p>
            <p
              className="mt-1 text-[1.5rem] font-bold leading-none tabular-nums tracking-[-0.03em]"
              style={{ color: 'var(--accent)' }}
            >
              1.50
            </p>
          </div>
        </div>

        <div
          className="mt-4 h-2 overflow-hidden rounded-full"
          style={{ background: 'var(--fill-tertiary)' }}
        >
          <motion.span
            className="block h-full rounded-full"
            style={{ background: 'var(--accent)' }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {[
          { subject: 'CS 3105', needed: '1.25' },
          { subject: 'CS 3107', needed: '1.50' },
          { subject: 'GEED 10123', needed: '1.75' },
        ].map((row, rowIndex) => (
          <motion.div
            key={row.subject}
            animate={{ opacity: reduced || rowIndex <= index ? 1 : 0.4 }}
            transition={{ duration: 0.4 }}
          >
            <Row
              as="div"
              leading={<Glyph Icon={IconGrades} size={22} />}
              title={row.subject}
              trailing={
                <span className="text-[0.875rem] font-bold tabular-nums">needs {row.needed}</span>
              }
              className="!min-h-[56px]"
            />
          </motion.div>
        ))}
      </div>
    </Frame>
  )
}

export function DeadlinesVisual() {
  const items = [
    { title: 'Sprint 2 documentation', subject: 'CS 3105', due: 'Tomorrow', urgency: 'urgent' },
    { title: 'Long quiz', subject: 'CS 3107', due: 'Friday', urgency: 'soon' },
    { title: 'Reflection paper', subject: 'GEED 10123', due: 'Next Tuesday', urgency: 'later' },
    { title: 'Lab report 4', subject: 'PHYS 10143', due: 'Next Thursday', urgency: 'later' },
  ] as const
  /* The same three colours the app's deadline dots use: crimson when it is
   * close, blue when it is coming, gray when it is far. */
  const DOT = {
    urgent: 'var(--tone-crimson)',
    soon: 'var(--tone-blue)',
    later: 'var(--label-tertiary)',
  }
  /* The list is the animation: one arrives at the top, the last one leaves. */
  const { ref, step, reduced } = useCycle(items.length, 2400)
  const order = reduced
    ? items.slice(0, 3)
    : [0, 1, 2].map((offset) => items[(step + offset) % items.length])

  return (
    <Frame label="Due next" rootRef={ref}>
      <ul className="row-list">
        <AnimatePresence initial={false} mode="popLayout">
          {order.map((item) => (
            <motion.li
              key={item.title}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={transition(spring.move)}
              className="list-none"
            >
              <Row
                as="div"
                leading={
                  <span
                    aria-hidden
                    className="block size-3 rounded-full"
                    style={{ background: DOT[item.urgency] }}
                  />
                }
                title={item.title}
                meta={
                  <>
                    <RowPill
                      tone={
                        item.urgency === 'urgent'
                          ? 'crimson'
                          : item.urgency === 'soon'
                            ? 'blue'
                            : undefined
                      }
                    >
                      {item.due}
                    </RowPill>
                    <RowPill>{item.subject}</RowPill>
                  </>
                }
                trailing={<span aria-hidden />}
              />
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
      <section className="card-glass squircle px-4 pb-4 pt-3.5">
        <Watermark Icon={IconAnnouncement} size={96} />

        <div className="flex gap-3">
          <motion.span
            className="mt-0.5 shrink-0"
            style={{ transformOrigin: '50% 30%' }}
            animate={reduced || phase !== 0 ? { rotate: 0 } : { rotate: [0, -14, 12, -6, 0] }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
          >
            <Glyph Icon={IconAnnouncement} size={22} important />
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.96875rem] font-bold leading-snug tracking-[-0.01em]">
              CS 3107: long quiz moved to Friday
            </p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-[var(--label-secondary)]">
              Posted once by your class representative · everyone in the section has it
            </p>
            <div className="mt-3.5">
              <MockAction pressed={phase === 2}>
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
                        <IconCheck size={16} />
                        Added to deadlines
                      </>
                    ) : (
                      <>
                        <IconDeadlines size={16} />
                        Make it a deadline
                      </>
                    )}
                  </motion.span>
                </AnimatePresence>
              </MockAction>
            </div>
          </div>
        </div>
      </section>

      <Row
        as="div"
        muted
        leading={<Glyph Icon={IconCancelled} size={22} />}
        title="Classes suspended today."
        className="!min-h-[56px]"
      />
    </Frame>
  )
}

export function CommuteVisual() {
  const legs = [
    { label: 'Jeep to Monumento', Icon: IconCommute },
    { label: 'LRT-1 to Central Terminal', Icon: IconTrain },
    { label: '8-minute walk', Icon: IconWalk },
  ]
  const { ref, step, reduced } = useCycle(legs.length, 1600)
  const active = reduced ? legs.length - 1 : step

  return (
    <Frame label="Grace Park → TUP Manila" rootRef={ref}>
      <ol className="row-list">
        {legs.map((leg, index) => {
          const current = index === active
          return (
            <motion.li
              key={leg.label}
              className="list-none"
              animate={{ opacity: current ? 1 : 0.6, scale: current ? 1.015 : 1 }}
              transition={transition(spring.snap)}
            >
              <Row
                as="div"
                leading={<Glyph Icon={leg.Icon} size={22} important={current} />}
                title={leg.label}
                trailing={
                  <span className="text-[0.8125rem] font-bold tabular-nums text-[var(--label-tertiary)]">
                    {index + 1}
                  </span>
                }
                className="!min-h-[56px]"
              />
            </motion.li>
          )
        })}
      </ol>

      <section className="card-glass squircle px-4 py-3.5">
        <Watermark Icon={IconCommute} size={100} />
        <p className="text-[1.375rem] font-bold leading-tight tracking-[-0.025em] tabular-nums">
          55 minutes · ₱41
        </p>
        <div className="mt-2 flex">
          <RowPill tone="green" icon={<IconCheck size={12} />}>
            student discount applied
          </RowPill>
        </div>
      </section>
    </Frame>
  )
}
