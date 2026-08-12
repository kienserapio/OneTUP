'use client'

import { useState } from 'react'
import { PasteImporter } from '@/lib/import/paste'
import { saveErsIdentity } from '@/lib/import/identity'
import type { ImportProposal } from '@/lib/import/types'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/auth/auth-form'

/**
 * The two ways a schedule gets in.
 *
 * Shared by import and re-sync so both offer the same choice and, more
 * importantly, handle credentials the same way.
 *
 * The three credential fields live in this component's own `useState` and
 * nowhere else — no store, no query cache, no storage — and are wiped on both
 * the success and the failure path (auth doc §5.1). Paste exists so a student
 * who declines to hand over an ERS password loses nothing.
 */

export interface ErsConnectProps {
  studentNumber: string
  termCode: string
  termLabel: string
  emailVerified: boolean
  submitLabel: string
  busyLabel: string
  onImported: (proposal: ImportProposal, jobId: string | null) => void
  onPaste: () => void
  onCancel: () => void
}

export function ErsConnect({
  studentNumber,
  termCode,
  termLabel,
  emailVerified,
  submitLabel,
  busyLabel,
  onImported,
  onPaste,
  onCancel,
}: ErsConnectProps) {
  const [number, setNumber] = useState(studentNumber)
  /* An account that already carries a student number has nothing to decide
   * here, and an editable field only invites importing somebody else's. */
  const locked = studentNumber.trim().length > 0
  const [password, setPassword] = useState('')
  const [birthdate, setBirthdate] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      const response = await fetch('/api/ers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_number: number.trim(),
          password,
          birthdate,
          term_code: termCode,
        }),
      })

      const body = await response.json()

      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not work. Try again, or paste your schedule.')
        return
      }

      /* ERS hands back who the student is along with what they are enrolled in.
       * Onboarding has always written that down; this path did not, which is
       * why a student who connected from the Schedule screen ended up with a
       * full timetable and an empty profile. */
      await saveErsIdentity(body.identity)

      onImported(
        {
          parserVersion: body.parser_version ?? 'unknown',
          courses: body.courses ?? [],
          unparsed: body.unparsed ?? [],
          warnings: body.warnings ?? [],
        },
        body.job_id ?? null,
      )
    } catch {
      setError("We couldn't reach ERS. Try again in a bit, or paste your schedule instead.")
    } finally {
      // Cleared on both paths, always.
      setPassword('')
      setBirthdate('')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <header>
        <h2 className="type-title-2">Connect ERS</h2>
        {termLabel && (
          <p className="type-subheadline mt-1 text-[var(--label-secondary)]">
            Reading your {termLabel} schedule. Your password is used once and never saved.
          </p>
        )}
      </header>

      {!emailVerified && (
        <FormError>
          Verify your email first — check your inbox. ERS connection stays locked until you do.
        </FormError>
      )}

      {error && <FormError>{error}</FormError>}

      {/* Fixed to the account when the account knows it. The server checks the
          same thing — before the login, and again against whoever ERS says it
          actually signed in — but a field that cannot be wrong beats an error
          that explains why it was. */}
      <Field
        id="ers-student-number"
        label="Student number"
        value={number}
        onChange={setNumber}
        autoComplete="off"
        spellCheck={false}
        required
        disabled={!emailVerified || locked}
        hint={
          locked
            ? 'Locked to this account. Your schedule is only ever kept under the student it belongs to.'
            : undefined
        }
      />

      <Field
        id="ers-password"
        label="ERS password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="off"
        spellCheck={false}
        required
        disabled={!emailVerified}
        hint="Used once, then discarded. Never saved."
      />

      <Field
        id="ers-birthdate"
        label="Birthdate"
        type="date"
        value={birthdate}
        onChange={setBirthdate}
        autoComplete="off"
        required
        disabled={!emailVerified}
        hint="ERS asks for this too, and it has to match your record exactly."
      />

      <Button type="submit" variant="accent" block disabled={busy || !emailVerified}>
        {busy ? busyLabel : submitLabel}
      </Button>

      <div className="flex gap-2">
        <Button variant="plain" onClick={onCancel} disabled={busy}>
          Back
        </Button>
        <Button variant="plain" onClick={onPaste} disabled={busy} block>
          Paste it instead
        </Button>
      </div>
    </form>
  )
}

export interface PasteBoxProps {
  title: string
  submitLabel: string
  onParsed: (proposal: ImportProposal) => void
  onCancel: () => void
}

export function PasteBox({ title, submitLabel, onParsed, onCancel }: PasteBoxProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function parse() {
    setError(null)
    setBusy(true)
    const result = await new PasteImporter().import({ termCode: '', pasted: text })
    setBusy(false)

    if (result.courses.length === 0) {
      setError(
        'Nothing in that looked like a schedule. Try copying the whole table from the ERS page, or add your subjects by hand.',
      )
      return
    }
    onParsed(result)
  }

  return (
    <div className="stack">
      <header>
        <h2 className="type-title-2">{title}</h2>
        <p className="type-subheadline mt-1 text-[var(--label-secondary)]">
          Open your schedule in ERS, select the table, copy it, and paste it here. No password
          needed.
        </p>
      </header>

      {error && <FormError>{error}</FormError>}

      <label htmlFor="paste-area" className="sr-only">
        Your ERS schedule
      </label>
      <textarea
        id="paste-area"
        rows={10}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste here"
        className="field type-data type-subheadline font-mono"
      />

      <Button variant="accent" block onClick={() => void parse()} disabled={busy || !text.trim()}>
        {busy ? 'Reading…' : submitLabel}
      </Button>
      <Button variant="plain" block onClick={onCancel} disabled={busy}>
        Back
      </Button>
    </div>
  )
}
