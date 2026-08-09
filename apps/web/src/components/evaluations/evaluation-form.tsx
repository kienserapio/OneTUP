'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { Button } from '@/components/ui/button'
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { FormError } from '@/components/auth/auth-form'
import { IconCheck, IconSparkleSmall } from '@/components/ui/icon'
import { cx } from '@/lib/cx'

/**
 * Faculty evaluation.
 *
 * OneTUP makes this form faster to fill in. It does not answer it.
 *
 * There is no code path in this component — or anywhere else — that produces a
 * Likert value. The comment assistant rewrites only the student's own bullet
 * points, and the gateway rejects any rewrite that introduces content they did
 * not write. This distinction is load-bearing: the evaluation exists to give
 * the university real signal about teaching, and polluting it would harm the
 * students who come after (PRD §8.4).
 */

interface Question {
  id: string
  text: string
  ordinal: number
  scale_min?: number
  scale_max?: number
}

interface EvaluationSubject {
  evaluationId: string
  enrollmentId: string
  facultyName: string
  courseCode: string
  status: 'draft' | 'complete' | 'exported'
}

export interface EvaluationFormProps {
  instrumentId: string
  questions: Question[]
  subject: EvaluationSubject
  initialAnswers: Record<string, number>
  initialBullets: string
  initialFinal: string
}

const AUTOSAVE_DEBOUNCE_MS = 400

export function EvaluationForm({
  instrumentId,
  questions,
  subject,
  initialAnswers,
  initialBullets,
  initialFinal,
}: EvaluationFormProps) {
  const [answers, setAnswers] = useState<Record<string, number>>(initialAnswers)
  const [focused, setFocused] = useState(0)
  const [bullets, setBullets] = useState(initialBullets)
  const [draft, setDraft] = useState(initialFinal)
  const [polishing, setPolishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const answered = Object.keys(answers).length
  const complete = answered === questions.length

  const persist = useCallback(
    async (nextAnswers: Record<string, number>, nextBullets: string, nextFinal: string) => {
      const supabase = supabaseBrowser()
      const { data } = await supabase.auth.getUser()
      if (!data.user) return

      const rows = Object.entries(nextAnswers).map(([questionId, value]) => ({
        evaluation_id: subject.evaluationId,
        user_id: data.user!.id,
        question_id: questionId,
        value,
      }))

      await Promise.all([
        rows.length > 0
          ? supabase
              .from('evaluation_answers')
              .upsert(rows, { onConflict: 'evaluation_id,question_id' })
          : Promise.resolve(),
        supabase
          .from('evaluations')
          .update({ comment_bullets: nextBullets || null, comment_final: nextFinal || null })
          .eq('id', subject.evaluationId),
      ])

      setSavedAt(new Date())
    },
    [subject.evaluationId],
  )

  /** Autosave on every change. A lost session must not cost the whole form. */
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persist(answers, bullets, draft)
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [answers, bullets, draft, persist])

  /**
   * Number keys set the focused question and advance. Answering thirty
   * questions with a mouse is what makes this form take twenty minutes; with
   * the number row it takes thirty seconds.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return

      const value = Number(event.key)
      if (value >= 1 && value <= 5 && questions[focused]) {
        event.preventDefault()
        setAnswers((prev) => ({ ...prev, [questions[focused].id]: value }))
        const next = Math.min(focused + 1, questions.length - 1)
        setFocused(next)
        rowRefs.current[next]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setFocused((current) => Math.min(current + 1, questions.length - 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setFocused((current) => Math.max(current - 1, 0))
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, questions])

  /** Fills only the unanswered ones, so a baseline never overwrites a judgement. */
  function baseline(value: number) {
    setAnswers((prev) => {
      const next = { ...prev }
      for (const question of questions) {
        if (next[question.id] === undefined) next[question.id] = value
      }
      return next
    })
  }

  async function polish() {
    if (!bullets.trim()) return
    setError(null)
    setPolishing(true)

    try {
      const response = await fetch('/api/ai/evaluation_polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { bullets, locale: 'auto' } }),
      })
      const body = await response.json()

      if (!response.ok) {
        setError(body?.error?.message ?? "We couldn't rewrite that. Your notes are unchanged.")
        return
      }

      setDraft(body.output.prose)
    } finally {
      setPolishing(false)
    }
  }

  async function exportResponses() {
    const lines = [
      `Faculty: ${subject.facultyName}`,
      `Subject: ${subject.courseCode}`,
      '',
      ...questions.map(
        (question, index) =>
          `${index + 1}. ${question.text}\n   ${answers[question.id] ?? '—'}`,
      ),
      '',
      'Comment:',
      draft || bullets || '(none)',
    ]

    await navigator.clipboard.writeText(lines.join('\n'))

    const supabase = supabaseBrowser()
    await supabase
      .from('evaluations')
      .update({ status: 'exported', completed_at: new Date().toISOString() })
      .eq('id', subject.evaluationId)
  }

  return (
    <>
      <NavBar
        title={subject.facultyName}
        subtitle={subject.courseCode}
        back={{ href: '/evaluations', label: 'Evaluations' }}
      />

      <div className="app-container stack">
        <Card>
          <p className="type-body">
            OneTUP fills nothing in for you. The ratings are yours, and the comment stays your own
            words — we only tidy the sentences if you ask.
          </p>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <span className="type-footnote text-[var(--label-secondary)]">
            {answered} of {questions.length} answered
          </span>
          <span className="type-footnote text-[var(--label-tertiary)]">
            · press 1&ndash;5 to answer and move on
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="type-footnote self-center text-[var(--label-secondary)]">
            Start everything at
          </span>
          {[1, 2, 3, 4, 5].map((value) => (
            <Button key={value} size="sm" onClick={() => baseline(value)}>
              {value}
            </Button>
          ))}
        </div>

        {error && <FormError>{error}</FormError>}

        <section>
          <SectionHeader>Questions</SectionHeader>
          <div className="stack">
            {questions.map((question, index) => (
              <div
                key={question.id}
                ref={(node) => {
                  rowRefs.current[index] = node
                }}
                onFocus={() => setFocused(index)}
              >
                <Card
                  className={cx(index === focused && 'ring-1')}
                  {...(index === focused
                    ? { style: { boxShadow: 'var(--shadow-card), 0 0 0 1.5px var(--accent)' } }
                    : {})}
                >
                  <p className="type-body">
                    <span className="type-data text-[var(--label-tertiary)]">{index + 1}.</span>{' '}
                    {question.text}
                  </p>

                  <div
                    role="radiogroup"
                    aria-label={question.text}
                    className="mt-3 flex gap-2"
                  >
                    {[1, 2, 3, 4, 5].map((value) => {
                      const selected = answers[question.id] === value
                      return (
                        <motion.button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          whileTap={{ scale: 0.94 }}
                          transition={transition(spring.snap)}
                          onClick={() => {
                            setAnswers((prev) => ({ ...prev, [question.id]: value }))
                            setFocused(Math.min(index + 1, questions.length - 1))
                          }}
                          className={cx(
                            'glass min-h-[var(--target-min)] flex-1 justify-center !px-0',
                            selected && 'glass-accent',
                          )}
                        >
                          {value}
                        </motion.button>
                      )
                    })}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader>Comment</SectionHeader>
          <Card className="space-y-3">
            <div>
              <label htmlFor="bullets" className="type-subheadline mb-1.5 block font-medium">
                Your points
              </label>
              <textarea
                id="bullets"
                rows={5}
                value={bullets}
                onChange={(event) => setBullets(event.target.value)}
                placeholder={'quizzes announced too late\nexplains examples well\nstarts on time'}
                className="field resize-none"
              />
              <p className="type-footnote mt-1.5 text-[var(--label-secondary)]">
                Rough notes are fine. These stay saved even if you replace them below.
              </p>
            </div>

            <Button block onClick={() => void polish()} disabled={polishing || !bullets.trim()}>
              {polishing ? 'Rewriting…' : 'Turn my points into sentences'}
            </Button>

            {draft && (
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <label htmlFor="final" className="type-subheadline font-medium">
                    Draft
                  </label>
                  <Badge tone="generated">
                    <IconSparkleSmall size={11} />
                    Generated
                  </Badge>
                </div>
                <textarea
                  id="final"
                  rows={5}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="field resize-none"
                />
                <p className="type-footnote mt-1.5 text-[var(--label-secondary)]">
                  Edit it however you like. Nothing goes anywhere until you send it yourself.
                </p>
              </div>
            )}
          </Card>
        </section>

        <Button variant="accent" block onClick={() => void exportResponses()} disabled={!complete}>
          {complete ? 'Copy for the official form' : `Answer all ${questions.length} first`}
        </Button>

        {savedAt && (
          <p className="type-caption-1 flex items-center justify-center gap-1.5 text-[var(--label-tertiary)]">
            <IconCheck size={13} />
            Saved
          </p>
        )}
      </div>
    </>
  )
}

export function NoInstrument() {
  return (
    <>
      <NavBar title="Faculty evaluation" />
      <div className="app-container">
        <Card>
          <EmptyState title="The evaluation form for this term hasn't been set up yet. It'll appear here when the evaluation period opens." />
        </Card>
      </div>
    </>
  )
}
