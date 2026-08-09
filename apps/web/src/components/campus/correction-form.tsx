'use client'

import { useId, useState } from 'react'
import { motion } from 'motion/react'
import type { CampusPlace } from '@onetup/core'
import { spring, transition } from '@/design/motion'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button, ButtonLink } from '@/components/ui/button'

/**
 * "That's wrong" — the correction path.
 *
 * Everything on this screen was typed in by a student, which means everything on
 * it can be out of date, and the only thing that keeps it honest is making the
 * report easier than the shrug. A correction is a suggestion, never an edit:
 * rows land in `place_corrections` with status `open` and are moderated before
 * anyone else sees them, so one person cannot quietly rewrite the campus.
 *
 * Row-level security requires `user_id = auth.uid()`, so this needs an account.
 * A signed-out visitor is told that plainly rather than being shown a form that
 * would fail.
 */

const FIELDS = [
  { value: 'name', label: 'Its name' },
  { value: 'description', label: 'What it is' },
  { value: 'hours', label: 'Opening hours' },
  { value: 'price', label: 'The price' },
  { value: 'contact_phone', label: 'The phone number' },
  { value: 'room_range', label: 'Which rooms are in it' },
  { value: 'location', label: 'Where it is' },
  { value: 'other', label: 'Something else' },
] as const

type State =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'sent' }
  | { kind: 'failed'; message: string }

export function CorrectionForm({
  places,
  defaultPlaceId,
}: {
  places: CampusPlace[]
  defaultPlaceId?: string | null
}) {
  const id = useId()
  const [placeId, setPlaceId] = useState(defaultPlaceId ?? places[0]?.id ?? '')
  const [field, setField] = useState<string>(FIELDS[0].value)
  const [proposed, setProposed] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  if (places.length === 0) {
    return (
      <p className="type-subheadline" style={{ color: 'var(--label-secondary)' }}>
        There is nothing loaded to correct yet. Campus data comes from the database and that
        request has not come back.
      </p>
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!placeId || proposed.trim().length === 0) return

    setState({ kind: 'saving' })

    try {
      const supabase = supabaseBrowser()
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) {
        setState({
          kind: 'failed',
          message: 'That session has expired. Sign in again and the correction will send.',
        })
        return
      }

      const { error } = await supabase.from('place_corrections').insert({
        place_id: placeId,
        user_id: user.id,
        field,
        proposed: proposed.trim(),
        note: note.trim() || null,
      })

      if (error) {
        setState({ kind: 'failed', message: 'That did not send. Worth trying once more.' })
        return
      }

      setProposed('')
      setNote('')
      setState({ kind: 'sent' })
    } catch {
      setState({ kind: 'failed', message: 'That did not send. Worth trying once more.' })
    }
  }

  if (state.kind === 'sent') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition(spring.snap)}
        className="flex flex-col items-start gap-[var(--space-3)]"
      >
        <p className="type-headline">Sent. Thank you.</p>
        <p className="type-subheadline" style={{ color: 'var(--label-secondary)' }}>
          A moderator checks corrections before they change what anyone else sees, so this will
          not appear straight away.
        </p>
        <Button variant="plain" onClick={() => setState({ kind: 'idle' })}>
          Report something else
        </Button>
      </motion.div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-[var(--space-3)]">
      <div className="flex flex-col gap-[var(--space-1)]">
        <label htmlFor={`${id}-place`} className="type-section-header">
          Which place
        </label>
        <select
          id={`${id}-place`}
          className="field"
          value={placeId}
          onChange={(event) => setPlaceId(event.target.value)}
        >
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-[var(--space-1)]">
        <label htmlFor={`${id}-field`} className="type-section-header">
          What is wrong
        </label>
        <select
          id={`${id}-field`}
          className="field"
          value={field}
          onChange={(event) => setField(event.target.value)}
        >
          {FIELDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-[var(--space-1)]">
        <label htmlFor={`${id}-proposed`} className="type-section-header">
          What it should say
        </label>
        <input
          id={`${id}-proposed`}
          className="field"
          value={proposed}
          onChange={(event) => setProposed(event.target.value)}
          placeholder="₱2 per page"
          autoComplete="off"
          maxLength={200}
          required
        />
      </div>

      <div className="flex flex-col gap-[var(--space-1)]">
        <label htmlFor={`${id}-note`} className="type-section-header">
          Anything else <span style={{ color: 'var(--label-tertiary)' }}>· optional</span>
        </label>
        <textarea
          id={`${id}-note`}
          className="field"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Checked this morning at the counter."
          maxLength={500}
        />
      </div>

      {state.kind === 'failed' && (
        <p className="type-footnote" style={{ color: 'var(--danger)' }} role="alert">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-[var(--space-3)]">
        <Button
          type="submit"
          variant="accent"
          disabled={state.kind === 'saving' || proposed.trim().length === 0}
        >
          {state.kind === 'saving' ? 'Sending' : 'Send the correction'}
        </Button>
        <p className="type-caption-1" style={{ color: 'var(--label-secondary)' }}>
          Moderated before it changes anything.
        </p>
      </div>
    </form>
  )
}

/** What a signed-out visitor gets instead of a form that RLS would reject. */
export function CorrectionSignedOut() {
  return (
    <div className="flex flex-col items-start gap-[var(--space-3)]">
      <p className="type-subheadline" style={{ color: 'var(--label-secondary)' }}>
        Corrections are attached to an account so a moderator can ask a follow-up question.
        Everything else on this screen stays open to everyone.
      </p>
      <ButtonLink href="/sign-in" variant="accent">
        Sign in to send one
      </ButtonLink>
    </div>
  )
}
