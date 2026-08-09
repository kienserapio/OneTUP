'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { Badge, Card, EmptyState } from '@/components/ui/surfaces'
import { IconAsk, IconSparkleSmall } from '@/components/ui/icon'
import { cx } from '@/lib/cx'

/**
 * The assistant.
 *
 * The distinction this screen has to make visible is the one in ADR-007:
 * numbers are computed from the student's own rows, and a model only ever
 * chooses the template and phrases the result. So an answer about cuts or GWA
 * arrives unlabelled — it is arithmetic — while a retrieved or generated answer
 * carries its marker and its source. Labelling everything would make the label
 * mean nothing.
 */

interface Turn {
  id: string
  role: 'student' | 'assistant'
  text: string
  /** Only set on assistant turns that a model actually generated. */
  labelled?: boolean
  route?: string
  citations?: { chunk_id: string; source_title: string }[]
  computed?: { template: string; values: Record<string, unknown> }
  error?: boolean
}

const SUGGESTIONS = [
  'When am I free tomorrow?',
  'Ilang cuts pa meron ako?',
  "What's due this week?",
  'How do I get to TUP from Caloocan?',
]

export function AskView() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, pending])

  async function send(query: string) {
    const text = query.trim()
    if (!text || pending) return

    setDraft('')
    setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: 'student', text }])
    setPending(true)

    try {
      const response = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, locale: 'auto' }),
      })
      const body = await response.json()

      if (!response.ok) {
        setTurns((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: body?.error?.message ?? 'That did not work. Try again in a moment.',
            error: true,
          },
        ])
        return
      }

      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: body.answer,
          labelled: body.labelled,
          route: body.route,
          citations: body.citations ?? [],
          computed: body.computed,
        },
      ])
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: "You're offline, so I can't look anything up. Your schedule, cuts and deadlines are still all there.",
          error: true,
        },
      ])
    } finally {
      setPending(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <NavBar title="Ask" largeTitle={turns.length === 0} />

      <div className="app-container flex-1">
        {turns.length === 0 ? (
          <Card className="mt-2">
            <EmptyState
              icon={<IconAsk size={30} />}
              title="Ask about your own schedule, cuts, grades and deadlines, or about getting to campus. English or Filipino, whichever comes out."
            />
            <div className="flex flex-wrap justify-center gap-2 pb-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="glass glass-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <div className="stack pt-2">
            <AnimatePresence initial={false}>
              {turns.map((turn) => (
                <motion.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={transition(spring.snap)}
                  className={cx('flex', turn.role === 'student' ? 'justify-end' : 'justify-start')}
                >
                  <TurnBubble turn={turn} />
                </motion.div>
              ))}
            </AnimatePresence>

            {pending && <Thinking />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <Composer
        ref={inputRef}
        value={draft}
        onChange={setDraft}
        onSubmit={() => void send(draft)}
        disabled={pending}
      />
    </div>
  )
}

function TurnBubble({ turn }: { turn: Turn }) {
  if (turn.role === 'student') {
    return (
      <p
        className="type-body max-w-[85%] rounded-[var(--radius-lg)] px-4 py-2.5"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {turn.text}
      </p>
    )
  }

  return (
    <div className="max-w-[92%]">
      <div
        className="squircle rounded-[var(--radius-lg)] px-4 py-3"
        style={{
          background: 'var(--bg-grouped-secondary)',
          boxShadow: 'var(--shadow-chip)',
          color: turn.error ? 'var(--label-secondary)' : undefined,
        }}
      >
        <p className="type-body whitespace-pre-wrap">{turn.text}</p>

        {turn.citations && turn.citations.length > 0 && (
          <ul className="mt-3 space-y-1">
            {turn.citations.map((citation) => (
              <li key={citation.chunk_id} className="type-footnote text-[var(--label-secondary)]">
                Source: {citation.source_title}
              </li>
            ))}
          </ul>
        )}
      </div>

      {turn.labelled && (
        <p className="mt-1.5 pl-1">
          <Badge tone="generated">
            <IconSparkleSmall size={11} />
            Generated
          </Badge>
        </p>
      )}
    </div>
  )
}

/**
 * Three dots that breathe rather than travel. A moving indicator at this size
 * reads as impatience; this reads as thinking.
 */
function Thinking() {
  return (
    <div className="flex items-center gap-1.5 pl-2" role="status" aria-label="Thinking">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="size-1.5 rounded-full"
          style={{ background: 'var(--label-tertiary)' }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.16 }}
        />
      ))}
    </div>
  )
}

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  ref?: React.Ref<HTMLTextAreaElement>
}

function Composer({ value, onChange, onSubmit, disabled, ref }: ComposerProps) {
  return (
    <div
      className="material material-large sticky bottom-0 z-20 mt-3"
      style={{
        paddingBottom: 'calc(var(--tab-bar-height) + var(--tab-bar-inset) * 2 + env(safe-area-inset-bottom))',
        borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
      }}
    >
      <form
        className="app-container flex items-end gap-2 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <label htmlFor="ask-input" className="sr-only">
          Ask OneTUP
        </label>
        <textarea
          id="ask-input"
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="Ask anything about your semester"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline. On a phone the send button
            // is the real path, so this is a desktop affordance.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          className="field max-h-32 flex-1 resize-none"
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          aria-label="Send"
          className="glass glass-accent aspect-square !px-0"
          style={{ minWidth: 'var(--target-min)' }}
        >
          <IconAsk size={20} />
        </button>
      </form>
    </div>
  )
}
