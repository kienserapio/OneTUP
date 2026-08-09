'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  AuthFormShell,
  Field,
  FormNote,
  PasswordHint,
  passwordIssues,
  useFormState,
} from '@/components/auth/auth-form'

/**
 * Sign-up.
 *
 * The password set here is a OneTUP password, not an ERS one. Keeping the two
 * identities separate is what stops this endpoint becoming a place to test
 * stolen ERS credentials, and what means an ERS password change never silently
 * breaks sign-in (auth doc §2.1).
 */
export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [sent, setSent] = useState(false)
  const { error, setError, busy, setBusy } = useFormState()

  const emailError =
    touched.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
      ? "That doesn't look like an email address."
      : null

  const passwordError =
    touched.password && passwordIssues(password).length > 0
      ? `Needs ${passwordIssues(password).join(', ')}.`
      : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (passwordIssues(password).length > 0) {
      setTouched((t) => ({ ...t, password: true }))
      return
    }

    setBusy(true)
    const { error: signUpError } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/welcome`,
        data: { student_number: studentNumber.trim() || null },
      },
    })
    setBusy(false)

    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes('already')
          ? 'There is already an account with that email. Sign in instead.'
          : signUpError.message,
      )
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="stack">
        <h1 className="type-title-1">Check your email</h1>
        <FormNote>
          We sent a link to {email}. Open it and you&rsquo;re in. The link works for an hour.
        </FormNote>
        <p className="type-subheadline text-[var(--label-secondary)]">
          Nothing arrived? Look in spam, or{' '}
          <button
            type="button"
            className="font-medium text-[var(--accent)]"
            onClick={() => setSent(false)}
          >
            try a different address
          </button>
          .
        </p>
      </div>
    )
  }

  return (
    <AuthFormShell
      title="Make a OneTUP account"
      subtitle="Free, and it stays free."
      error={error}
      onSubmit={submit}
      footer={
        <p className="type-subheadline text-center text-[var(--label-secondary)]">
          Already have one?{' '}
          <Link href="/sign-in" className="font-medium text-[var(--accent)]">
            Sign in
          </Link>
        </p>
      }
    >
      <Field
        id="email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        onBlur={() => setTouched((t) => ({ ...t, email: true }))}
        error={emailError}
        required
      />

      <Field
        id="student-number"
        label="Student number"
        value={studentNumber}
        onChange={setStudentNumber}
        placeholder="TUPM-00-0000"
        autoComplete="off"
        spellCheck={false}
        hint="Used to show your name on announcements and to verify class reps. Never to sign you in."
      />

      <Field
        id="password"
        label="OneTUP password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        error={passwordError}
        hint={<PasswordHint password={password} />}
        required
      />

      <p className="type-footnote text-[var(--label-secondary)]">
        This is a OneTUP password. It is not your ERS password, and we never ask you to reuse it.
      </p>

      <Button type="submit" variant="accent" block disabled={busy}>
        {busy ? 'Creating your account…' : 'Create account'}
      </Button>
    </AuthFormShell>
  )
}
