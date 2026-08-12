'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { IconCheck } from '@/components/ui/icon'

/**
 * The report form.
 *
 * One screen, no steps. A student reporting that their schedule imported wrong
 * is already annoyed, and a wizard is a way of making them prove they care.
 *
 * What is required is deliberately short: a kind, a subject, a message, and a
 * name. Everything under "About you" is optional and says so, because a visitor
 * who is not a student — a parent, someone from another campus, a person who
 * found the site — still has the right to tell us something is broken.
 *
 * The three anti-abuse measures are the honeypot below, the time the form has
 * been on screen, and a rate limit in the route. None of them is a captcha:
 * this form is reached by perhaps a dozen people a week, and a captcha would
 * cost every one of them to stop a spammer who has not arrived yet.
 */

const KINDS = [
  { value: 'issue', label: 'Something is broken', hint: 'A bug, a wrong number, a blank screen' },
  { value: 'help', label: 'I need help', hint: 'Something will not work for me' },
  { value: 'feedback', label: 'Feedback', hint: 'How it feels to use' },
  { value: 'suggestion', label: 'Suggestion', hint: 'Something it should do' },
  { value: 'inquiry', label: 'Inquiry', hint: 'A question about the project' },
  { value: 'other', label: 'Something else', hint: null },
] as const

type Kind = (typeof KINDS)[number]['value']

interface Values {
  kind: Kind
  subject: string
  message: string
  fullName: string
  email: string
  studentNumber: string
  section: string
  college: string
}

const EMPTY: Values = {
  kind: 'issue',
  subject: '',
  message: '',
  fullName: '',
  email: '',
  studentNumber: '',
  section: '',
  college: '',
}

const MESSAGE_MAX = 4000
const MESSAGE_MIN = 20

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  optional,
  type = 'text',
  autoComplete,
  placeholder,
  maxLength,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  hint?: ReactNode
  optional?: boolean
  type?: string
  autoComplete?: string
  placeholder?: string
  maxLength?: number
}) {
  return (
    <div>
      <label htmlFor={id} className="type-subheadline mb-1.5 flex items-baseline gap-2 font-medium">
        {label}
        {optional ? (
          <span className="type-caption-2" style={{ color: 'var(--label-tertiary)' }}>
            Optional
          </span>
        ) : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={maxLength}
        className="field"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint ? (
        <p id={`${id}-hint`} className="type-footnote mt-1.5" style={{ color: 'var(--label-secondary)' }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function ReportForm({ signedInEmail }: { signedInEmail?: string | null }) {
  const [values, setValues] = useState<Values>({ ...EMPTY, email: signedInEmail ?? '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reduced = useReducedMotion()

  /* When the form appeared, for the "nobody types this fast" check in the
   * route. A ref rather than state: it must not survive a re-render as a new
   * value, and nothing renders from it. */
  const openedAt = useRef(0)
  useEffect(() => {
    openedAt.current = Date.now()
  }, [])

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const messageLeft = MESSAGE_MAX - values.message.length
  const canSend =
    values.subject.trim().length >= 3 &&
    values.message.trim().length >= MESSAGE_MIN &&
    values.fullName.trim().length >= 2

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSend || sending) return

    setSending(true)
    setError(null)

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          /* Read straight off the form rather than from state, because state
             never holds it — nothing should be able to prefill it. */
          website: (form.get('website') as string) ?? '',
          elapsedMs: Date.now() - openedAt.current,
        }),
      })

      if (!response.ok) {
        const envelope = await response.json().catch(() => null)
        throw new Error(
          envelope?.error?.message ?? 'That did not send. Try again in a moment.',
        )
      }

      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not send.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: reduced ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="squircle rounded-[var(--radius-xl)] border p-[var(--space-8)] text-center"
        style={{ borderColor: 'var(--separator)', background: 'var(--surface-sunken)' }}
      >
        <div
          className="mx-auto grid h-12 w-12 place-items-center rounded-full"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <IconCheck size={24} />
        </div>
        <h2 className="type-title-3 mt-[var(--space-4)]">That reached us.</h2>
        <p className="type-body mt-2" style={{ color: 'var(--label-secondary)' }}>
          It goes to the same two people who build this, so it will be read by someone who can
          actually fix it. If you left an email and it needs a reply, you will get one.
        </p>
        <div className="mt-[var(--space-6)] flex justify-center">
          <Button
            variant="glass"
            onClick={() => {
              setValues({ ...EMPTY, email: signedInEmail ?? '' })
              setSent(false)
              openedAt.current = Date.now()
            }}
          >
            Report something else
          </Button>
        </div>
      </motion.div>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <fieldset className="border-0 p-0">
        <legend className="type-subheadline mb-[var(--space-3)] font-medium">
          What is this about?
        </legend>
        <div className="grid grid-cols-1 gap-[var(--space-2)] sm:grid-cols-2 lg:grid-cols-3">
          {KINDS.map((kind) => {
            const active = values.kind === kind.value
            return (
              <label
                key={kind.value}
                className="squircle relative cursor-pointer rounded-[var(--radius-md)] border p-[var(--space-4)] transition-[border-color,background-color,transform] duration-200"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--separator)',
                  background: active
                    ? 'color-mix(in srgb, var(--accent) 7%, transparent)'
                    : 'var(--surface-sunken)',
                }}
              >
                {/* The real control, visually hidden but still focusable — the
                    card is a label, so the keyboard and the screen reader get
                    an ordinary radio group. */}
                <input
                  type="radio"
                  name="kind"
                  value={kind.value}
                  checked={active}
                  onChange={() => set('kind', kind.value)}
                  className="sr-only"
                />
                <span className="type-subheadline block font-medium">{kind.label}</span>
                {kind.hint ? (
                  <span
                    className="type-footnote mt-0.5 block"
                    style={{ color: 'var(--label-secondary)' }}
                  >
                    {kind.hint}
                  </span>
                ) : null}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="stack mt-[var(--space-6)]">
        <Field
          id="subject"
          label="Subject"
          value={values.subject}
          onChange={(v) => set('subject', v)}
          placeholder="Schedule import dropped my Saturday class"
          maxLength={120}
        />

        <div>
          <label htmlFor="message" className="type-subheadline mb-1.5 block font-medium">
            What happened?
          </label>
          <textarea
            id="message"
            name="message"
            value={values.message}
            onChange={(event) => set('message', event.target.value)}
            rows={7}
            maxLength={MESSAGE_MAX}
            className="field resize-y"
            placeholder="What you were doing, what you expected, and what happened instead. If it is a bug, the page you were on helps more than anything else."
            aria-describedby="message-hint"
          />
          <p
            id="message-hint"
            className="type-footnote mt-1.5 flex justify-between gap-4"
            style={{ color: 'var(--label-secondary)' }}
          >
            <span>At least {MESSAGE_MIN} characters. Detail is welcome.</span>
            <span aria-live="polite" style={{ color: messageLeft < 200 ? 'var(--danger)' : undefined }}>
              {messageLeft < 200 ? `${messageLeft} left` : null}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-[var(--space-8)]">
        <h2 className="type-subheadline font-medium">About you</h2>
        <p className="type-footnote mt-1" style={{ color: 'var(--label-secondary)' }}>
          Only your name is needed. The rest helps us reproduce a problem that only happens to
          one section or one college — leave it blank if you would rather not say.
        </p>

        <div className="stack mt-[var(--space-4)]">
          <Field
            id="fullName"
            label="Full name"
            value={values.fullName}
            onChange={(v) => set('fullName', v)}
            autoComplete="name"
            maxLength={120}
          />
          <Field
            id="email"
            label="Email"
            type="email"
            optional
            value={values.email}
            onChange={(v) => set('email', v)}
            autoComplete="email"
            maxLength={254}
            hint="Without one we can read your report but we cannot reply to it."
          />

          <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
            <Field
              id="studentNumber"
              label="Student number"
              optional
              value={values.studentNumber}
              onChange={(v) => set('studentNumber', v)}
              placeholder="TUPM-00-0000"
              maxLength={20}
            />
            <Field
              id="section"
              label="Section"
              optional
              value={values.section}
              onChange={(v) => set('section', v)}
              placeholder="BSCS-4B"
              maxLength={40}
            />
          </div>

          <Field
            id="college"
            label="College"
            optional
            value={values.college}
            onChange={(v) => set('college', v)}
            placeholder="College of Science"
            maxLength={120}
          />
        </div>
      </div>

      {/* The honeypot. Off-screen rather than `display: none`, which some form
          fillers are wise to, and taken out of the tab order and the
          accessibility tree so no real person can reach it by accident. */}
      <div aria-hidden className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {error ? (
        <p
          role="alert"
          className="type-subheadline squircle mt-[var(--space-6)] rounded-[var(--radius-md)] border p-[var(--space-4)]"
          style={{
            borderColor: 'var(--danger)',
            color: 'var(--danger)',
            background: 'color-mix(in srgb, var(--danger) 6%, transparent)',
          }}
        >
          {error}
        </p>
      ) : null}

      <div className="mt-[var(--space-6)] flex flex-col items-start gap-[var(--space-3)] sm:flex-row sm:items-center">
        <Button type="submit" variant="accent" size="lg" disabled={!canSend || sending}>
          {sending ? 'Sending…' : 'Send report'}
        </Button>
        <p className="type-footnote" style={{ color: 'var(--label-tertiary)' }}>
          Goes to the people who build OneTUP. Never to the university.
        </p>
      </div>
    </form>
  )
}
