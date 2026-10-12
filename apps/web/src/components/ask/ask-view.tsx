'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { historyFrom } from '@/lib/assistant/conversation'
import { Markdown } from '@/components/ask/markdown'
import { ButtonLink } from '@/components/ui/button'
import { GeneratedMark } from '@/components/ui/surfaces'
import {
  IconArrow,
  IconAsk,
  IconAttendance,
  IconCheck,
  IconCommute,
  IconCopy,
  IconDeadlines,
  IconPlus,
  IconRefresh,
  IconSchedule,
} from '@/components/ui/icon'
import { InfoTip } from '@/components/ui/info-tip'
import { cx } from '@/lib/cx'
import { AskComposer, type Locale } from '@/components/ask/ask-composer'

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
  /** The student pressed stop before an answer came back. */
  stopped?: boolean
}

/** Starters, one per part of the app the assistant can read. */
const SUGGESTIONS: { text: string; hint: string; Icon: typeof IconSchedule }[] = [
  { text: 'When am I free tomorrow?', hint: 'Schedule', Icon: IconSchedule },
  { text: 'Ilang cuts pa meron ako?', hint: 'Attendance', Icon: IconAttendance },
  { text: "What's due this week?", hint: 'Deadlines', Icon: IconDeadlines },
  { text: 'How do I get to TUP from Caloocan?', hint: 'Commute', Icon: IconCommute },
]

const STATUS = ['Reading your records…', 'Working it out…', 'Putting it into words…']

/** What the assistant does and refuses to do — once a paragraph on the
 * screen, now one tap away beside the title. */
const ABOUT = (
  <InfoTip title="What it can answer">
    Your cuts, GWA, deadlines and free time, worked out from your own records — arithmetic, not a
    guess. It won&rsquo;t invent grades, prerequisites or university policy; with nothing to work
    from, it says so.
  </InfoTip>
)

export function AskView({ firstName }: { firstName?: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [locale, setLocale] = useState<Locale>('auto')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, pending])

  const add = (turn: Omit<Turn, 'id'>) =>
    setTurns((prev) => [...prev, { id: crypto.randomUUID(), ...turn }])

  /** `base` is the conversation the question is asked into: the current turns
   * normally, or the turns before an answer being redone. */
  async function send(query: string, base: Turn[] = turns) {
    const text = query.trim()
    if (!text || pending) return

    /* History is what came *before* this question. */
    const history = historyFrom(base)
    const controller = new AbortController()
    abortRef.current = controller

    setDraft('')
    setTurns([...base, { id: crypto.randomUUID(), role: 'student', text }])
    setPending(true)

    try {
      const response = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, locale, history }),
        signal: controller.signal,
      })
      const body = await response.json()

      if (!response.ok) {
        add({
          role: 'assistant',
          text: body?.error?.message ?? 'That did not work. Try again in a moment.',
          error: true,
        })
        return
      }

      add({
        role: 'assistant',
        text: body.answer,
        labelled: body.labelled,
        route: body.route,
        citations: body.citations ?? [],
        computed: body.computed,
        receipts: body.receipts ?? [],
        actions: body.actions ?? [],
      })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        add({ role: 'assistant', text: 'Stopped.', stopped: true })
        return
      }
      add({
        role: 'assistant',
        text: "You're offline, so I can't look anything up. Your schedule, cuts and deadlines are still all there.",
        error: true,
      })
    } finally {
      abortRef.current = null
      setPending(false)
      inputRef.current?.focus()
    }
  }

  function redo() {
    const last = turns.map((turn) => turn.role).lastIndexOf('student')
    if (last < 0) return
    void send(turns[last].text, turns.slice(0, last))
  }

  function reset() {
    abortRef.current?.abort()
    setTurns([])
    setDraft('')
    inputRef.current?.focus()
  }

  const empty = turns.length === 0
  const lastAssistant = turns.map((turn) => turn.role).lastIndexOf('assistant')

  return (
    <div className="app-container ask-stage flex min-h-[calc(100dvh-var(--topbar-height)-1.5rem)] flex-col">
      <header className="mx-auto flex w-full max-w-[46rem] items-center gap-3 pb-2 pt-4">
        <span className="ask-orb size-9">
          <IconAsk size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-[1.0625rem] font-bold leading-tight tracking-[-0.02em]">
            OneTUP Assistant
            {ABOUT}
          </h1>
          <p className="flex items-center gap-1.5 text-[0.75rem] font-medium text-[var(--label-tertiary)]">
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: 'var(--tone-green)' }} />
            Reads your own records
          </p>
        </div>
        <AnimatePresence>
          {!empty && (
            <motion.button
              type="button"
              onClick={reset}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={transition(spring.snap)}
              className="ask-tool"
            >
              <IconPlus size={16} />
              New chat
            </motion.button>
          )}
        </AnimatePresence>
      </header>

      <div className={cx('mx-auto flex w-full max-w-[46rem] flex-1 flex-col', empty && 'justify-center pb-16')}>
        {empty ? (
          <Hero firstName={firstName ?? null} />
        ) : (
          <div className="flex-1 space-y-6 pb-6 pt-4">
            <AnimatePresence initial={false}>
              {turns.map((turn, index) => (
                <motion.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={transition(spring.snap)}
                  className={cx('flex', turn.role === 'student' ? 'justify-end' : 'justify-start')}
                >
                  <TurnView
                    turn={turn}
                    canRedo={index === lastAssistant && !pending}
                    onRedo={redo}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            {pending && <Thinking />}
            <div ref={endRef} />
          </div>
        )}

        <div className={cx(!empty && 'sticky bottom-0 z-20 pb-1')}>
          {!empty && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-6 bottom-0 -z-10"
              style={{ background: 'linear-gradient(to top, var(--canvas) 55%, transparent)' }}
            />
          )}
          <AskComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void send(draft)}
            onStop={() => abortRef.current?.abort()}
            pending={pending}
            locale={locale}
            onLocale={setLocale}
            inputRef={inputRef}
            placeholder={empty ? 'Ask anything about your semester' : 'Ask a follow-up'}
          />

          {empty ? (
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {SUGGESTIONS.map((suggestion, index) => (
                <motion.button
                  key={suggestion.text}
                  type="button"
                  onClick={() => void send(suggestion.text)}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition(spring.ui), delay: 0.12 + 0.06 * index }}
                  className="ask-suggestion"
                >
                  <suggestion.Icon size={20} className="text-[var(--label-tertiary)]" />
                  <span className="min-w-0">
                    <span className="block text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em]">
                      {suggestion.text}
                    </span>
                    <span className="mt-0.5 block text-[0.75rem] font-medium text-[var(--label-tertiary)]">
                      {suggestion.hint}
                    </span>
                  </span>
                </motion.button>
              ))}
            </div>
          ) : (
            <p className="pt-2 text-center text-[0.6875rem] font-medium text-[var(--label-tertiary)]">
              OneTUP can be wrong about anything it wasn&rsquo;t computed from your records.
            </p>
          )}

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
      </div>
    </div>
  )
}

function Hero({ firstName }: { firstName: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4 pb-8 text-center">
      <motion.span
        className="ask-orb size-[4.5rem]"
        data-live="true"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={transition(spring.flick)}
      >
        <IconAsk size={32} />
      </motion.span>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transition(spring.ui), delay: 0.08 }}
      >
        <h2 className="text-[1.75rem] font-bold leading-[1.15] tracking-[-0.03em] sm:text-[2.125rem]">
          {firstName ? (
            <>
              Hi {firstName},<br />
              <span className="text-[var(--accent)]">what do you need?</span>
            </>
          ) : (
            <>
              What do you <span className="text-[var(--accent)]">need to know?</span>
            </>
          )}
        </h2>
        <p className="mt-2 text-[0.9375rem] font-medium text-[var(--label-tertiary)]">
          Ask in English or Filipino. Your schedule, cuts, grades and commute are all in reach.
        </p>
      </motion.div>
    </div>
  )
}

/** The student's own message, or the assistant's reply. */
function TurnView({
  turn,
  canRedo,
  onRedo,
}: {
  turn: Turn
  canRedo: boolean
  onRedo: () => void
}) {
  const [copied, setCopied] = useState(false)

  if (turn.role === 'student') {
    return (
      <p className="ask-user-bubble max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-[8px] px-4 py-2.5 text-[0.9375rem] font-medium leading-relaxed">
        {turn.text}
      </p>
    )
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(turn.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* Clipboard is unavailable; nothing to tell the student that would help. */
    }
  }

  return (
    <div className="flex w-full min-w-0 items-start gap-3">
      <span className="ask-orb mt-0.5 size-8" aria-hidden>
        <IconAsk size={16} />
      </span>
      <div className="min-w-0 flex-1">
        {turn.error ? (
          <p
            className="rounded-2xl px-4 py-3 text-[0.9375rem] font-medium"
            style={{ background: 'var(--tone-crimson-tint)', color: 'var(--tone-crimson-ink)' }}
          >
            {turn.text}
          </p>
        ) : turn.stopped ? (
          <p className="pt-1 text-[0.875rem] font-medium italic text-[var(--label-tertiary)]">
            {turn.text}
          </p>
        ) : (
          <Markdown text={turn.text} />
        )}

        {turn.citations && turn.citations.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {turn.citations.map((citation) => (
              <li
                key={citation.chunk_id}
                className="inline-flex rounded-full px-2.5 py-0.5 text-[0.75rem] font-medium text-[var(--label-secondary)]"
                style={{ background: 'var(--fill-quaternary)' }}
              >
                Source: {citation.source_title}
              </li>
            ))}
          </ul>
        )}

        {turn.actions && turn.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {turn.actions.map((action) => (
              <ButtonLink key={action.href} href={action.href} size="sm" trailing={<IconArrow size={16} />}>
                {action.label}
              </ButtonLink>
            ))}
          </div>
        )}

        {!turn.error && !turn.stopped && (
          <div className="mt-2.5 flex items-center gap-1">
            <button type="button" onClick={() => void copy()} className="ask-tool !h-8" aria-label="Copy answer">
              {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {canRedo && (
              <button type="button" onClick={onRedo} className="ask-tool !h-8" aria-label="Ask again">
                <IconRefresh size={15} />
                Retry
              </button>
            )}
            <span className="ml-1.5">
              {turn.labelled ? (
                <GeneratedMark />
              ) : turn.computed ? (
                <Receipts receipts={turn.receipts ?? []} />
              ) : null}
            </span>
          </div>
        )}
        {(turn.error || turn.stopped) && canRedo && (
          <button type="button" onClick={onRedo} className="ask-tool mt-2 !h-8">
            <IconRefresh size={15} />
            Try again
          </button>
        )}
      </div>
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
      <span className="text-[0.75rem] font-medium text-[var(--label-tertiary)]">
        Worked out from your own records
      </span>
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
        <ul
          className="mt-1.5 space-y-1.5 rounded-[14px] p-2.5"
          style={{ background: 'var(--fill-quaternary)' }}
        >
          {receipts.map((receipt) => (
            <li key={receipt.template} className="type-caption-2 text-[var(--label-secondary)]">
              <span className="type-data text-[var(--label-tertiary)]">
                {receipt.template.replace(/_/g, ' ')}
              </span>
              <span className="block whitespace-pre-line">{receipt.read}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The orb pulses while the answer is worked out, and the status line says what stage it is at. */
function Thinking() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setStep((s) => Math.min(s + 1, STATUS.length - 1)), 1900)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center gap-3" role="status" aria-label="Thinking">
      <span className="ask-orb size-8" data-thinking="true" aria-hidden>
        <IconAsk size={16} />
      </span>
      <span className="ask-shimmer text-[0.9375rem] font-semibold">{STATUS[step]}</span>
    </div>
  )
}
