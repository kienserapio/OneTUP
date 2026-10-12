'use client'

import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import { IconChevronRight, type IconProps } from '@/components/ui/icon'

/**
 * The pieces the profile's settings are drawn with.
 *
 * Calm on purpose. A group is a quiet heading on the canvas — a grey glyph and
 * a title — with its controls under it as floating white rows, the same rows
 * every list in the app uses. Crimson is kept for the things that are *on*: a
 * switch, the value a stepper holds, the one button that matters. Everything
 * else is ink and grey, so the eye goes to state rather than to decoration.
 */

type Glyph = ComponentType<IconProps>

export function SettingsCard({
  Icon,
  title,
  info,
  aside,
  children,
}: {
  Icon: Glyph
  title: string
  info?: ReactNode
  /** Something small on the right of the header, like a status pill. */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <header className="flex min-h-[40px] items-center gap-2.5 px-1">
        <span aria-hidden className="text-[var(--label-tertiary)]">
          <Icon size={20} />
        </span>
        <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-[1.0625rem] font-bold tracking-[-0.015em]">
          <span className="truncate">{title}</span>
          {info}
        </h2>
        {aside}
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

/** One floating white row. The shared `.row` surface from the app theme. */
function PlainRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('row !min-h-[60px]', className)}>{children}</div>
}

/**
 * A number set with − and +. Replaces a text box: the useful values are small,
 * and a thumb is better at tapping than at a number keyboard.
 */
export function StepperRow({
  id,
  label,
  value,
  unit,
  step = 1,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  unit?: string
  step?: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)))

  return (
    <PlainRow>
      <span id={`${id}-label`} className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
        {label}
      </span>
      <span
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex shrink-0 items-center gap-1 rounded-full p-1"
        style={{ background: 'var(--canvas)' }}
      >
        <StepButton
          label={`Less ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => set(value - step)}
        >
          −
        </StepButton>
        <output
          id={id}
          aria-live="polite"
          className="min-w-[3rem] text-center text-[1.0625rem] font-bold tabular-nums"
        >
          {value}
          {unit && (
            <span className="ml-0.5 text-[0.75rem] font-semibold text-[var(--label-tertiary)]">
              {unit}
            </span>
          )}
        </output>
        <StepButton
          label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => set(value + step)}
        >
          +
        </StepButton>
      </span>
    </PlainRow>
  )
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.84 }}
      transition={transition(spring.snap)}
      className="grid size-8 place-items-center rounded-full text-[1.125rem] font-semibold disabled:opacity-35"
      style={{ background: 'var(--bg)', color: 'var(--accent)', boxShadow: 'var(--shadow-chip)' }}
    >
      {children}
    </motion.button>
  )
}

export function SwitchRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string
  hint?: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="row row-interactive !min-h-[60px]"
    >
      <span className="min-w-0 flex-1">
        <span className="row-title">{label}</span>
        {hint && <span className="row-detail">{hint}</span>}
      </span>
      <span
        aria-hidden
        className="relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200"
        style={{ background: on ? 'var(--accent)' : 'rgb(24 24 27 / 0.12)' }}
      >
        <motion.span
          className="absolute top-[3px] block size-6 rounded-full"
          style={{ background: '#ffffff', boxShadow: '0 2px 6px rgb(0 0 0 / 0.18)' }}
          initial={false}
          animate={{ x: on ? 23 : 3 }}
          transition={transition(spring.snap)}
        />
      </span>
    </button>
  )
}

/** A row holding whatever control it is given. */
export function ControlRow({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <PlainRow>
      <label htmlFor={htmlFor} className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
        {label}
      </label>
      {children}
    </PlainRow>
  )
}

/**
 * A row that goes somewhere or does one thing: grey glyph, label, chevron.
 * `danger` turns the label and glyph red for the one destructive action.
 */
export function LinkRow({
  Icon,
  label,
  hint,
  href,
  onClick,
  danger,
}: {
  Icon: Glyph
  label: string
  hint?: string
  href?: string
  onClick?: () => void
  danger?: boolean
}) {
  const body = (
    <>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center"
        style={{ color: danger ? 'var(--danger)' : 'var(--label-tertiary)' }}
      >
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="row-title" style={danger ? { color: 'var(--danger)' } : undefined}>
          {label}
        </span>
        {hint && <span className="row-detail">{hint}</span>}
      </span>
      <IconChevronRight size={18} className="shrink-0 text-[var(--label-quaternary)]" />
    </>
  )

  const className = 'row row-interactive !min-h-[60px]'

  return href ? (
    <Link href={href as never} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  )
}
