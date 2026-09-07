'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { historyFrom, splitIntoBlocks } from '@/lib/assistant/conversation'
import { NavBar } from '@/components/app/nav-bar'
import { ButtonLink } from '@/components/ui/button'
import { Card, EmptyState, GeneratedMark, SectionHeader } from '@/components/ui/surfaces'
import { IconAsk } from '@/components/ui/icon'
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
  /** Which lookups produced the answer, and what each one read. */
  receipts?: { template: string; read: string }[]
  /** Screens the answer points at. A pointer with no link is half an answer. */
  actions?: { label: string; href: string }[]
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

    /* Read before the new turn is appended, so history is what came *before*
     * this question. `turns` here is the value from this render, which is
     * exactly that. */
    const history = historyFrom(turns)

    setDraft('')
    setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: 'student', text }])
    setPending(true)

    try {
      const response = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, locale: 'auto', history }),
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
          receipts: body.receipts ?? [],
          actions: body.actions ?? [],
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
    <>
      <NavBar title="Ask" largeTitle={turns.length === 0} />

      <div className="app-container">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-6">
          {/* The thread owns the column height so the composer can sit at the
              bottom of it rather than at the bottom of the whole page. */}
          <div className="flex min-h-[72dvh] flex-col">
            <div className="flex-1">
              {turns.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<IconAsk size={30} />}
                    title="Ask about your own schedule, cuts, grades and deadlines, or about getting to campus. English or Filipino, whichever comes out."
                  />
                  <div className="flex flex-wrap justify-center gap-2 pb-2 lg:hidden">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void send(suggestion)}
                        className="glass"
                      >
                        <span className="type-subheadline font-medium">{suggestion}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              ) : (
                <div className="stack">
                  <AnimatePresence initial={false}>
                    {turns.map((turn) => (
                      <motion.div
                        key={turn.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={transition(spring.snap)}
                        className={cx(
                          'flex',
                          turn.role === 'student' ? 'justify-end' : 'justify-start',
                        )}
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

          <Rail onPick={(suggestion) => void send(suggestion)} />
        </div>
      </div>
    </>
  )
}

/**
 * The desktop rail. It carries the two things a chat window usually hides: what
 * to ask, and what this thing will refuse to do.
 */
function Rail({ onPick }: { onPick: (suggestion: string) => void }) {
  return (
    // The offset clears the sticky top bar, which is drawn above this rail.
    <aside
      className="hidden lg:sticky lg:block"
      style={{ top: 'calc(var(--topbar-height) + var(--space-4))' }}
    >
      <section>
        <SectionHeader>Try asking</SectionHeader>
        <div className="flex flex-col gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPick(suggestion)}
              className="type-subheadline card flex min-h-[var(--target-min)] items-center px-3.5 py-2.5 text-left transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <SectionHeader>What it can answer</SectionHeader>
        <Card className="flex flex-col gap-2">
          <p className="type-footnote text-[var(--label-secondary)]">
            It works out your cuts, your GWA, what&rsquo;s due and when you&rsquo;re free from the
            rows already in your account. Those numbers are arithmetic, not a guess, which is why
            they arrive unlabelled.
          </p>
          <p className="type-footnote text-[var(--label-secondary)]">
            It does not invent grades, prerequisites or university policy. If it has nothing to work
            from, it says so instead of filling the gap.
          </p>
        </Card>
      </section>
    </aside>
  )
}

/** Renders the one piece of markup the prompt permits: a leading "- ". */
function AnswerBody({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {splitIntoBlocks(text).map((block, index) =>
        block.kind === 'list' ? (
          <ul key={index} className="type-body ml-1 space-y-1">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="flex gap-2">
                <span aria-hidden="true" className="text-[var(--label-tertiary)]">
                  •
                </span>
                <span className="min-w-0 flex-1">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} className="type-body whitespace-pre-wrap">
            {block.text}
          </p>
        ),
      )}
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
    <div className="max-w-[92%] lg:max-w-[46rem]">
      <div
        className="squircle rounded-[var(--radius-lg)] border px-4 py-3"
        style={{
          background: 'var(--bg-grouped-secondary)',
          borderColor: 'var(--separator)',
          color: turn.error ? 'var(--label-secondary)' : undefined,
        }}
      >
        <AnswerBody text={turn.text} />

        {turn.citations && turn.citations.length > 0 && (
          <ul className="mt-3 space-y-1">
            {turn.citations.map((citation) => (
              <li key={citation.chunk_id} className="type-footnote text-[var(--label-secondary)]">
                Source: {citation.source_title}
              </li>
            ))}
          </ul>
        )}

        {turn.actions && turn.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {turn.actions.map((action) => (
              <ButtonLink key={action.href} href={action.href} size="sm">
                {action.label}
              </ButtonLink>
            ))}
          </div>
        )}
      </div>

      {/* Only a model-written answer is marked. A computed one says where its
          numbers came from, which is a provenance note, not a generated mark. */}
      {turn.labelled ? (
        <p className="mt-1.5 pl-1">
          <GeneratedMark />
        </p>
      ) : turn.computed ? (
        <Receipts receipts={turn.receipts ?? []} />
      ) : null}
    </div>
  )
}

/**
 * Where the answer's numbers came from.
 *
 * One lookup is a provenance note and stays a single line — expanding it would
 * be ceremony around a sentence the student can already see.
 *
 * More than one is different. An answer that combines two facts is the first
 * thing in this product that composes, and a student told two things at once is
 * owed the ability to check both separately
 * (10-FUTURE-ENHANCEMENTS.md §5.1). So the receipts open, and each one shows
 * exactly what that lookup returned before anything was written around it.
 */
function Receipts({ receipts }: { receipts: { template: string; read: string }[] }) {
  const [open, setOpen] = useState(false)

  if (receipts.length < 2) {
    return (
      <p className="type-caption-2 mt-1.5 pl-1 text-[var(--label-tertiary)]">
        Worked out from your own records
      </p>
    )
  }

  return (
    <div className="mt-1.5 pl-1">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        className="type-caption-2 text-[var(--label-tertiary)] underline decoration-dotted underline-offset-2"
        aria-expanded={open}
      >
        Worked out from {receipts.length} things in your records
      </button>

      {open && (
        <ul className="mt-1.5 space-y-1 border-l pl-2.5" style={{ borderColor: 'var(--separator)' }}>
          {receipts.map((receipt) => (
            <li key={receipt.template} className="type-caption-2 text-[var(--label-secondary)]">
              <span className="type-data text-[var(--label-tertiary)]">
                {receipt.template.replace(/_/g, ' ')}
              </span>
              <span className="block">{receipt.read}</span>
            </li>
          ))}
        </ul>
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
    <div className="sticky bottom-0 z-20 pt-3">
      <form
        className="material material-large flex items-end gap-2 rounded-[var(--radius-xl)] p-2"
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

      {/* Clears the floating bar, which only exists below the shell breakpoint. */}
      <div
        className="mobile-only"
        aria-hidden
        style={{
          height:
            'calc(var(--tab-bar-height) + var(--tab-bar-inset) * 2 + env(safe-area-inset-bottom))',
        }}
      />
    </div>
  )
}
