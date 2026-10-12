'use client'

import type { ComponentType, FormEvent, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import type { IconProps } from '@/components/ui/icon'
import { IconTile, type Tone } from '@/components/ui/icon-tile'

/**
 * The pieces onboarding is drawn with.
 *
 * Kept apart from onboarding.tsx so that file stays about what each step
 * *does* — the credential handling, the two-pass import, the writes — and this
 * one about how a step looks. Every step is the same shape: a picture, a short
 * title, a line under it, whatever the step needs, and its buttons at the
 * bottom where a thumb already is.
 */

/* --- Progress ------------------------------------------------------------ */

const DOT = { active: '#a51c30', done: '#e8a7b1', upcoming: '#e4e4e9' }

/** Pill dots: the current step stretches, finished ones stay tinted. */
export function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={current + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${current + 1} of ${total}`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: total }, (_, index) => (
        <motion.span
          key={index}
          className="block h-2 rounded-full"
          initial={false}
          animate={{
            width: index === current ? 28 : 8,
            backgroundColor:
              index === current ? DOT.active : index < current ? DOT.done : DOT.upcoming,
          }}
          transition={transition(spring.snap)}
        />
      ))}
    </div>
  )
}

/* --- Illustration ---------------------------------------------------------- */

type Glyph = ComponentType<IconProps>

const SATELLITE_SPOTS = [
  { left: '14%', top: '20%' },
  { left: '74%', top: '16%' },
  { left: '78%', top: '64%' },
  { left: '10%', top: '66%' },
]

/**
 * A step's picture: the step's own icon, large and solid, with the things it
 * involves orbiting it as smaller tiles. Built from the same icon tiles as
 * the rest of the app rather than drawn, so it is unmistakably the same
 * product and costs no image weight.
 *
 * It floats. Gently, slowly, and not at all for a student who has asked for
 * less motion.
 */
export function StepArt({
  tone,
  Icon,
  satellites,
}: {
  tone: Tone
  Icon: Glyph
  satellites: Glyph[]
}) {
  const still = useReducedMotion()

  return (
    <div
      aria-hidden
      className="relative mx-auto h-[184px] w-full overflow-hidden rounded-[28px] sm:h-[156px]"
      style={{ background: `var(--tone-${tone}-tint)` }}
    >
      {/* Two rings, for depth. Dotted, in the step's own tone, faint. */}
      {[220, 320].map((size) => (
        <span
          key={size}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed"
          style={{
            width: size,
            height: size,
            borderColor: `color-mix(in srgb, var(--tone-${tone}) 22%, transparent)`,
          }}
        />
      ))}

      <motion.span
        className="absolute left-1/2 top-1/2"
        style={{ x: '-50%', y: '-50%' }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...transition(spring.flick), delay: 0.05 }}
      >
        <motion.span
          className="block"
          animate={still ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span
            className="block rounded-[30%]"
            style={{
              boxShadow: `0 18px 36px -14px color-mix(in srgb, var(--tone-${tone}) 70%, transparent)`,
            }}
          >
            <IconTile Icon={Icon} tone={tone} variant="solid" size={84} />
          </span>
        </motion.span>
      </motion.span>

      {satellites.slice(0, SATELLITE_SPOTS.length).map((Satellite, index) => (
        <motion.span
          key={index}
          className="absolute"
          style={SATELLITE_SPOTS[index]}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...transition(spring.flick), delay: 0.18 + index * 0.08 }}
        >
          <motion.span
            className="grid size-12 place-items-center rounded-[30%]"
            style={{
              background: '#ffffff',
              color: `var(--tone-${tone}-ink)`,
              boxShadow: '0 8px 20px -8px rgb(24 24 27 / 0.25)',
            }}
            animate={still ? undefined : { y: [0, index % 2 ? 5 : -5, 0] }}
            transition={{ duration: 3.4 + index * 0.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Satellite size={24} />
          </motion.span>
        </motion.span>
      ))}
    </div>
  )
}

/* --- The frame every step sits in ---------------------------------------- */

export function StepFrame({
  art,
  title,
  subtitle,
  info,
  children,
  actions,
  onSubmit,
}: {
  art?: ReactNode
  title: string
  subtitle?: ReactNode
  /** An <InfoTip> beside the title, holding what the subtitle left out. */
  info?: ReactNode
  children?: ReactNode
  /** The step's buttons. Pinned to the bottom on a phone. */
  actions: ReactNode
  /** When set, the frame is a form and Enter submits it. */
  onSubmit?: (event: FormEvent) => void
}) {
  const body = (
    <>
      {art}
      <div className={cx('text-center', art ? 'mt-6' : 'mt-2')}>
        <h1 className="flex items-center justify-center gap-2 text-[1.75rem] font-bold leading-tight tracking-[-0.025em]">
          {title}
          {info}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-2 max-w-[22rem] text-[0.9375rem] leading-snug text-[var(--label-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      {children && <div className="mt-6 flex flex-col gap-3">{children}</div>}
      <div className="mt-auto flex flex-col gap-2.5 pt-7">{actions}</div>
    </>
  )

  const className =
    'flex flex-1 flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:px-8 sm:pb-8'

  return onSubmit ? (
    <form onSubmit={onSubmit} className={className}>
      {body}
    </form>
  ) : (
    <div className={className}>{body}</div>
  )
}

/* --- Small pieces -------------------------------------------------------- */

/** An icon tile, a short label and an optional line under it. */
export function PointRow({
  Icon,
  tone,
  title,
  detail,
}: {
  Icon: Glyph
  tone: Tone
  title: string
  detail?: string
}) {
  return (
    <div className="flex items-center gap-3 text-left">
      <IconTile Icon={Icon} tone={tone} size={40} />
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-semibold leading-snug">{title}</span>
        {detail && (
          <span className="block text-[0.8125rem] leading-snug text-[var(--label-secondary)]">
            {detail}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * A minutes value, set with − and + rather than typed. Thumbs are bad at
 * number keyboards and good at tapping, and the useful values are all
 * multiples of five anyway.
 */
export function MinuteStepper({
  id,
  label,
  Icon,
  tone,
  value,
  onChange,
  info,
  step = 5,
  min = 0,
  max = 180,
}: {
  id: string
  label: string
  Icon: Glyph
  tone: Tone
  value: number
  onChange: (value: number) => void
  info?: ReactNode
  step?: number
  min?: number
  max?: number
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)))

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[20px] p-2 pl-3"
      style={{ background: 'var(--surface-sunken)' }}
      role="group"
      aria-labelledby={`${id}-label`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <IconTile Icon={Icon} tone={tone} size={36} />
        <span id={`${id}-label`} className="truncate text-[0.9375rem] font-semibold">
          {label}
        </span>
        {info}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <StepButton label={`Less ${label.toLowerCase()}`} onClick={() => set(value - step)}>
          −
        </StepButton>
        <output
          id={id}
          aria-live="polite"
          className="w-14 text-center text-[1.0625rem] font-bold tabular-nums"
        >
          {value}
          <span className="ml-0.5 text-[0.75rem] font-medium text-[var(--label-tertiary)]">m</span>
        </output>
        <StepButton label={`More ${label.toLowerCase()}`} onClick={() => set(value + step)}>
          +
        </StepButton>
      </span>
    </div>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      whileTap={{ scale: 0.86 }}
      transition={transition(spring.snap)}
      className="grid size-10 place-items-center rounded-full text-[1.25rem] font-semibold"
      style={{ background: '#ffffff', boxShadow: 'var(--shadow-chip)' }}
    >
      {children}
    </motion.button>
  )
}
