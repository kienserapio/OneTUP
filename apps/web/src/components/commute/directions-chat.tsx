'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { IconButton } from '@/components/ui/button'
import { Badge } from '@/components/ui/surfaces'
import { IconAsk, IconClose } from '@/components/ui/icon'
import { cx } from '@/lib/cx'

/**
 * Asking for directions, without leaving the map.
 *
 * The assistant already answers commute questions — it resolves an origin by
 * name and reads the same route summaries this screen draws. What it did not
 * have was a way to be asked while the map is in front of you, which is the
 * moment the question actually occurs to somebody.
 *
 * So this is a small mouth onto the existing endpoint, not a second assistant:
 * one turn list, one composer, and the same `Generated` label the rest of the
 * app uses. The full conversation, with its history and its citations, is still
 * /ask — this deliberately keeps no memory beyond the session and offers no
 * follow-up affordances, because a chat that grows on top of a map stops being
 * a map.
 */

interface Turn {
  id: string
  role: 'you' | 'onetup'
  text: string
  /** Set by the endpoint when a model wrote the words rather than computed them. */
  labelled?: boolean
  error?: boolean
}

export function DirectionsChat({
  areaName,
  className,
}: {
  /** The origin already chosen on the map, so the starters ask a real question. */
  areaName: string | null
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const composer = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  const starters = [
    areaName ? `How do I get to TUP Manila from ${areaName}?` : 'How do I get to TUP Manila?',
    'What is the cheapest way to campus?',
    'Which route has the fewest rides?',
  ]

  // The composer is the reason the panel opened, so it does not wait to be
  // found. On a phone this also raises the keyboard, which is what a student
  // tapping a chat button was asking for.
  useEffect(() => {
    if (open) composer.current?.focus()
  }, [open])

  useEffect(() => {
    const element = log.current
    if (element) element.scrollTop = element.scrollHeight
  }, [turns, pending])

  async function send(text: string) {
    const query = text.trim()
    if (!query || pending) return

    setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: 'you', text: query }])
    setDraft('')
    setPending(true)

    try {
      const response = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, locale: 'auto' }),
      })
      const body = await response.json()

      setTurns((prev) => [
        ...prev,
        response.ok
          ? {
              id: crypto.randomUUID(),
              role: 'onetup',
              text: String(body.answer ?? ''),
              labelled: Boolean(body.labelled),
            }
          : {
              id: crypto.randomUUID(),
              role: 'onetup',
              text: body?.error?.message ?? 'That did not work. Try again in a moment.',
              error: true,
            },
      ])
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'onetup',
          text: 'You appear to be offline. The routes already on screen still work.',
          error: true,
        },
      ])
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className={cx(
        // Reversed on a phone, where the button sits at the top of the map and
        // the panel drops beneath it; the other way up on a desktop, where the
        // button is in the bottom corner and the panel rises out of it.
        'pointer-events-none relative z-20 flex flex-col-reverse items-end gap-[var(--space-2)]',
        'min-[900px]:flex-col',
        className,
      )}
    >
      <AnimatePresence>
        {open && (
          <motion.section
            aria-label="Ask for directions"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
            }}
            className={cx(
              'card squircle pointer-events-auto flex w-[min(21rem,calc(100vw-var(--space-6)))] flex-col overflow-hidden',
              // On a phone it hangs off the button as a popover rather than
              // sitting in the layout, because in the layout it would push the
              // route sheet off the bottom of the screen. On a desktop there is
              // room for it in flow, above the button it came out of.
              'absolute right-0 top-[calc(100%+var(--space-2))] min-[900px]:static',
            )}
            style={{ boxShadow: 'var(--shadow-float)' }}
            initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
            transition={transition(spring.sheet)}
          >
            <header
              className="flex items-center justify-between gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)]"
              style={{ borderBottom: '1px solid var(--separator)' }}
            >
              {/* Inline weight: the type scale is unlayered CSS and outranks
                  Tailwind's utilities, so `font-semibold` would be ignored. */}
              <h2 className="type-subheadline" style={{ fontWeight: 600 }}>
                Ask for directions
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-full"
                style={{ color: 'var(--label-secondary)' }}
              >
                <IconClose size={17} />
              </button>
            </header>

            <div
              ref={log}
              className="flex min-h-0 flex-col gap-[var(--space-3)] overflow-y-auto overscroll-contain px-[var(--space-4)] py-[var(--space-3)]"
              style={{ maxHeight: 'min(34dvh, 16rem)' }}
            >
              {turns.length === 0 && !pending ? (
                <>
                  <p className="type-footnote text-[var(--label-secondary)]">
                    Fares and times come from the same student-confirmed routes on this map.
                  </p>
                  <ul className="flex list-none flex-col gap-[var(--space-2)]">
                    {starters.map((starter) => (
                      <li key={starter}>
                        <button
                          type="button"
                          onClick={() => void send(starter)}
                          className="type-footnote w-full rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-left"
                          style={{
                            background: 'var(--surface-sunken)',
                            border: '1px solid var(--separator)',
                          }}
                        >
                          {starter}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                turns.map((turn) => <TurnRow key={turn.id} turn={turn} />)
              )}

              {pending && (
                <p className="type-footnote text-[var(--label-secondary)]" aria-live="polite">
                  Working it out…
                </p>
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                void send(draft)
              }}
              className="flex items-end gap-[var(--space-2)] px-[var(--space-3)] pb-[var(--space-3)] pt-[var(--space-2)]"
              style={{ borderTop: '1px solid var(--separator)' }}
            >
              <label className="sr-only" htmlFor="directions-question">
                Your question
              </label>
              <textarea
                id="directions-question"
                ref={composer}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, because on a desktop the keyboard is the real
                  // path; a new line is still there behind Shift.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void send(draft)
                  }
                }}
                placeholder="Where are you coming from?"
                className="field type-subheadline max-h-24 min-h-[var(--target-min)] flex-1 resize-none py-[var(--space-2)]"
              />
              <button
                type="submit"
                disabled={pending || draft.trim().length === 0}
                aria-label="Send"
                className="glass glass-accent aspect-square shrink-0 !px-0"
                style={{ minWidth: 'var(--target-min)' }}
              >
                <IconAsk size={19} />
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <IconButton
        label={open ? 'Close directions chat' : 'Ask for directions'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="glass-accent pointer-events-auto"
        style={{ width: '3.25rem', height: '3.25rem', boxShadow: 'var(--shadow-float)' }}
      >
        {open ? <IconClose size={22} /> : <IconAsk size={22} />}
      </IconButton>
    </div>
  )
}

function TurnRow({ turn }: { turn: Turn }) {
  if (turn.role === 'you') {
    return (
      <p
        className="type-footnote self-end rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)]"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)', maxWidth: '85%' }}
      >
        {turn.text}
      </p>
    )
  }

  return (
    <div className="max-w-[92%] self-start">
      <p
        className="type-subheadline"
        style={{ color: turn.error ? 'var(--label-secondary)' : 'var(--label)' }}
      >
        {turn.text}
      </p>
      {turn.labelled && (
        <span className="mt-[var(--space-2)] inline-flex">
          <Badge tone="generated">Generated</Badge>
        </span>
      )}
    </div>
  )
}
