'use client'

import { Suspense, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { clearLocalData } from '@/lib/offline/db'
import { Button } from '@/components/ui/button'
import { IconKey, IconSend } from '@/components/ui/icon'
import {
  AuthNotice,
  AuthFormShell,
  Field,
  FormNote,
  PasswordHint,
  passwordIssues,
  useFormState,
} from '@/components/auth/auth-form'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-[var(--radius-lg)]" />}>
      <ResetPassword />
    </Suspense>
  )
}

/**
 * Two screens in one route: request a link, or — arriving back from that link —
 * set the new password.
 *
 * Setting a new password clears the local store. Any device-side ERS credential
 * is encrypted with a key derived from the OneTUP password, so after a change
 * it is no longer decryptable; leaving the ciphertext behind would only produce
 * a confusing failure later (auth doc §5.2).
 */
function ResetPassword() {
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = useState<'request' | 'set'>('request')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const { error, setError, busy, setBusy } = useFormState()

  useEffect(() => {
    if (params.get('mode') === 'set') setMode('set')
    // Supabase also lands here with a recovery session already established.
    const { data } = supabaseBrowser().auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('set')
    })
    return () => data.subscription.unsubscribe()
  }, [params])

  async function requestLink(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    const { error: resetError } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password%3Fmode%3Dset`,
    })
    setBusy(false)

    // Always reports success: whether an address has an account is not something
    // this endpoint should be willing to tell anyone who asks.
    if (resetError && !resetError.message.toLowerCase().includes('not found')) {
      setError(resetError.message)
      return
    }
    setSent(true)
  }

  async function setNewPassword(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (passwordIssues(password).length > 0) {
      setError(`Needs ${passwordIssues(password).join(', ')}.`)
      return
    }

    setBusy(true)
    const { error: updateError } = await supabaseBrowser().auth.updateUser({ password })
    if (updateError) {
      setBusy(false)
      setError(updateError.message)
      return
    }

    await clearLocalData()
    setBusy(false)
    router.push('/today')
    router.refresh()
  }

  if (mode === 'set') {
    return (
      <AuthFormShell title="Set a new password" error={error} onSubmit={setNewPassword}>
        <Field
          id="new-password"
          label="New OneTUP password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          hint={<PasswordHint password={password} />}
          required
        />
        <p className="text-[0.8125rem] font-medium leading-snug text-[var(--label-tertiary)]">
          If you had OneTUP remember your ERS password on this device, you&rsquo;ll need to enter
          it again next time you sync — it was locked with your old password.
        </p>
        <Button
          type="submit"
          variant="accent"
          size="lg"
          block
          disabled={busy}
          leading={<IconKey size={20} />}
        >
          {busy ? 'Saving…' : 'Save and continue'}
        </Button>
      </AuthFormShell>
    )
  }

  if (sent) {
    return (
      <AuthNotice
        title="Check your email"
        footer={
          <Link href="/sign-in" className="auth-link text-[0.9375rem]">
            Back to sign in
          </Link>
        }
      >
        <FormNote>
          If there&rsquo;s an account for {email}, a reset link is on its way. It works for an hour.
        </FormNote>
      </AuthNotice>
    )
  }

  return (
    <AuthFormShell
      title="Reset your password"
      subtitle="We'll email you a link."
      error={error}
      onSubmit={requestLink}
      footer={
        <p className="text-[0.9375rem]">
          <Link href="/sign-in" className="auth-link">
            Back to sign in
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
      <Button
        type="submit"
        variant="accent"
        size="lg"
        block
        disabled={busy}
        leading={<IconSend size={20} />}
      >
        {busy ? 'Sending…' : 'Send the link'}
      </Button>
    </AuthFormShell>
  )
}
