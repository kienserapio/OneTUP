'use client'

import { Suspense, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthFormShell, Field, useFormState } from '@/components/auth/auth-form'

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-[var(--radius-lg)]" />}>
      <SignInForm />
    </Suspense>
  )
}

function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/today'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { error, setError, busy, setBusy } = useFormState()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email,
      password,
    })
    setBusy(false)

    if (signInError) {
      // Deliberately does not say which of the two was wrong.
      setError("That email and password didn't match. Try again, or reset your password.")
      return
    }

    router.push(next as never)
    router.refresh()
  }

  return (
    <AuthFormShell
      title="Sign in"
      error={error}
      onSubmit={submit}
      footer={
        <p className="type-subheadline text-center text-[var(--label-secondary)]">
          New here?{' '}
          <Link href="/sign-up" className="font-medium text-[var(--accent)]">
            Make an account
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
        required
      />

      <Field
        id="password"
        label="OneTUP password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        required
      />

      <Button type="submit" variant="accent" block disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="type-subheadline text-center">
        <Link href="/reset-password" className="text-[var(--accent)]">
          Forgot your password?
        </Link>
      </p>
    </AuthFormShell>
  )
}
