'use client'

import { useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { DatePicker } from '@/components/ui/date-picker'
import {
  IconCheck,
  IconCommute,
  IconDeadlines,
  IconEye,
  IconGrades,
  IconSchedule,
  IconWarning,
  type IconProps,
} from '@/components/ui/icon'
import { Mark } from '@/components/ui/mark'

/**
 * Shared form plumbing for the three auth screens.
 *
 * Validation is inline and on blur, never on submit. Telling a student what is
 * wrong only after they have committed is the pattern that makes forms feel
 * adversarial.
 */

export interface FieldProps {
  id: string
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  placeholder?: string
  hint?: ReactNode
  error?: string | null
  onBlur?: () => void
  required?: boolean
  inputMode?: 'text' | 'email' | 'numeric'
  disabled?: boolean
  spellCheck?: boolean
}

export function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
  error,
  onBlur,
  required,
  inputMode,
  disabled,
  spellCheck,
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[0.875rem] font-semibold text-[var(--label-secondary)]">
        {label}
      </label>
      {/* A date gets the app's own calendar. The only date this form asks
          for is a birthdate, so no Today/Tomorrow shortcuts. */}
      {type === 'date' ? (
        <DatePicker
          id={id}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          quick={false}
          label={label}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
      ) : type === 'password' ? (
        <PasswordInput
          id={id}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          invalid={Boolean(error)}
          describedBy={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          inputMode={inputMode}
          disabled={disabled}
          spellCheck={spellCheck}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className="field"
        />
      )}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.8125rem] font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.8125rem] font-medium text-[var(--label-tertiary)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** A password field with a show/hide toggle: the eye lights crimson while the password is visible. */
function PasswordInput({
  id,
  value,
  onChange,
  onBlur,
  autoComplete,
  placeholder,
  required,
  disabled,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  autoComplete?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  invalid: boolean
  describedBy?: string
}) {
  const [shown, setShown] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        spellCheck={false}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        className="field !pr-12"
      />
      <button
        type="button"
        className="auth-eye"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown((was) => !was)}
      >
        <IconEye size={20} />
      </button>
    </div>
  )
}

/**
 * Password strength, expressed as advice rather than as a score. A meter that
 * says "weak" without saying why is just a scold.
 */
export function passwordIssues(password: string): string[] {
  const issues: string[] = []
  if (password.length < 8) issues.push('at least 8 characters')
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) issues.push('upper and lower case')
  if (!/\d/.test(password)) issues.push('a number')
  return issues
}

export function PasswordHint({ password }: { password: string }) {
  if (!password) return <>Eight characters or more, with a number.</>
  const issues = passwordIssues(password)
  if (issues.length === 0) return <span style={{ color: 'var(--ok)' }}>That works.</span>
  return <>Still needs {issues.join(', ')}.</>
}

type Glyph = ComponentType<IconProps>

const ART_SPOTS = [
  { left: '12%', top: '22%' },
  { left: '78%', top: '16%' },
  { left: '82%', top: '62%' },
  { left: '8%', top: '64%' },
]

/**
 * The picture above each auth card: the OneTUP mark floating in a pale crimson
 * well, with the things it keeps track of drifting round it as bare gray glyphs.
 * The same idea as the onboarding steps' art, quieter.
 */
export function AuthArt({ satellites = [IconSchedule, IconDeadlines, IconGrades, IconCommute] }: { satellites?: Glyph[] }) {
  const still = useReducedMotion()

  return (
    <div aria-hidden className="auth-art">
      {[150, 230].map((size) => (
        <span key={size} className="auth-art-ring" style={{ width: size, height: size }} />
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
          animate={still ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ filter: 'drop-shadow(0 12px 14px color-mix(in srgb, var(--accent) 38%, transparent))' }}
        >
          <Mark size={56} />
        </motion.span>
      </motion.span>

      {satellites.slice(0, ART_SPOTS.length).map((Satellite, index) => (
        <motion.span
          key={index}
          className="absolute text-[var(--label-tertiary)]"
          style={ART_SPOTS[index]}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...transition(spring.flick), delay: 0.18 + index * 0.08 }}
        >
          <motion.span
            className="block"
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

/** The white glass card every auth screen sits in. Springs in, like an onboarding step. */
export function AuthCard({ children, art }: { children: ReactNode; art?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(spring.ui)}
      className="card card-glass p-5 sm:p-7"
    >
      {art ?? <AuthArt />}
      {children}
    </motion.div>
  )
}

/** Title and one line under it, centred, as onboarding's StepFrame does. */
function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <header className="mt-6 text-center">
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.025em]">{title}</h1>
      {subtitle && (
        <p className="mx-auto mt-2 max-w-[22rem] text-[0.9375rem] font-medium leading-snug text-[var(--label-secondary)]">
          {subtitle}
        </p>
      )}
    </header>
  )
}

export function AuthFormShell({
  title,
  subtitle,
  error,
  onSubmit,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  error?: string | null
  onSubmit: (event: FormEvent) => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <AuthCard>
      <AuthHeading title={title} subtitle={subtitle} />

      {error && (
        <div className="mt-5">
          <FormError>{error}</FormError>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        {children}
      </form>

      {footer && <div className="mt-5 flex flex-col gap-2 text-center">{footer}</div>}
    </AuthCard>
  )
}

/** The "check your email" kind of screen: a heading, a note, and what to do next. */
export function AuthNotice({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <AuthCard>
      <AuthHeading title={title} />
      <div className="mt-5 flex flex-col gap-4">{children}</div>
      {footer && <div className="mt-5 text-center">{footer}</div>}
    </AuthCard>
  )
}

/** Text link in the auth screens: semibold crimson. */
export const authLinkClass = 'auth-link'

export function FormError({ children }: { children: ReactNode }) {
  return (
    <motion.p
      role="alert"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(spring.snap)}
      className="flex items-start gap-2 rounded-2xl px-3.5 py-3 text-[0.875rem] font-semibold leading-snug"
      style={{ background: 'var(--tone-crimson-tint)', color: 'var(--tone-crimson-ink)' }}
    >
      <IconWarning size={18} className="mt-px shrink-0" />
      <span>{children}</span>
    </motion.p>
  )
}

export function FormNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="flex items-start gap-2 rounded-2xl px-3.5 py-3 text-[0.875rem] font-semibold leading-snug"
      style={{ background: 'var(--tone-green-tint)', color: 'var(--tone-green-ink)' }}
    >
      <IconCheck size={18} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function useFormState() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return { error, setError, busy, setBusy }
}
