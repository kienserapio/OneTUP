'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'

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
      <label htmlFor={id} className="type-subheadline mb-1.5 block font-medium">
        {label}
      </label>
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
      {error ? (
        <p id={`${id}-error`} className="type-footnote mt-1.5 text-[var(--danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="type-footnote mt-1.5 text-[var(--label-secondary)]">
          {hint}
        </p>
      ) : null}
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
    <div className="stack">
      <header>
        <h1 className="type-title-1">{title}</h1>
        {subtitle && (
          <p className="type-body mt-1 text-[var(--label-secondary)]">{subtitle}</p>
        )}
      </header>

      {error && <FormError>{error}</FormError>}

      <form onSubmit={onSubmit} className="stack">
        {children}
      </form>

      {footer}
    </div>
  )
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <motion.p
      role="alert"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(spring.snap)}
      className={cx('type-subheadline squircle rounded-[var(--radius-sm)] px-3.5 py-2.5')}
      style={{
        background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
        color: 'var(--danger)',
      }}
    >
      {children}
    </motion.p>
  )
}

export function FormNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="type-subheadline squircle rounded-[var(--radius-sm)] px-3.5 py-2.5"
      style={{
        background: 'color-mix(in srgb, var(--ok) 12%, transparent)',
        color: 'color-mix(in srgb, var(--ok) 80%, var(--label))',
      }}
    >
      {children}
    </p>
  )
}

export function useFormState() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return { error, setError, busy, setBusy }
}
