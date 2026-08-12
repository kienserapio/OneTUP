'use client'

import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  type GradedCourse,
  type WhatIfResult,
  computeGwa,
  formatGwa,
  planWhatIf,
} from '@onetup/core'
import { spring, transition } from '@/design/motion'
import { Card, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { GradeScaleGrid } from '@/components/subjects/grade-sheet'
import { cx } from '@/lib/cx'

/**
 * The what-if planner.
 *
 * Every number and every sentence below comes out of `planWhatIf`. Nothing here
 * re-derives a requirement or softens a verdict: a student deciding whether to
 * keep a scholarship needs the arithmetic to be the same arithmetic that the
 * notification and the threshold check use (ADR-007).
 *
 * "A GWA of 1.50" is two different questions depending on what it is measured
 * against, and the answers are far apart once there are past semesters on
 * record — six terms of history barely move for one term of effort. The scope
 * is therefore chosen rather than assumed, and named in the verdict, so the
 * number on screen is never the answer to a question the student did not ask.
 */

const QUICK_TARGETS = [1.0, 1.25, 1.5, 1.75, 2.0]

/** Named to match the threshold scopes, which ask the same question. */
export type WhatIfScope = 'term' | 'cumulative'

export interface WhatIfPlannerProps {
  /** Graded courses in the current term. */
  termCourses: readonly GradedCourse[]
  /** Graded courses across every term on record, current one included. */
  cumulativeCourses: readonly GradedCourse[]
  /**
   * Whether the two are different questions at all. With a single semester
   * behind them the student would be picking between one answer and the same
   * answer, so the control is not offered.
   */
  hasPastTerms: boolean
  ungraded: readonly { enrollmentId: string; code: string; units: number }[]
  /** Grades already recorded as expectations, used as the starting pins. */
  initialPins?: Record<string, number>
}

export function WhatIfPlanner({
  termCourses,
  cumulativeCourses,
  hasPastTerms,
  ungraded,
  initialPins,
}: WhatIfPlannerProps) {
  const [target, setTarget] = useState('1.75')
  // A student who has just imported six semesters is asking about their record,
  // not about the fifteen units in front of them.
  const [scope, setScope] = useState<WhatIfScope>(hasPastTerms ? 'cumulative' : 'term')
  const [pins, setPins] = useState<Record<string, number>>(initialPins ?? {})
  const [pinning, setPinning] = useState<{ enrollmentId: string; code: string } | null>(null)

  const parsed = Number.parseFloat(target)
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 5

  const graded = scope === 'cumulative' ? cumulativeCourses : termCourses

  // Whichever scope is chosen, the courses still in play are this term's — a
  // grade from two years ago is not a grade the student can still change.
  const plan = useMemo(
    () =>
      valid
        ? planWhatIf({
            target: parsed,
            graded,
            ungraded: ungraded.map((course) => ({
              ...course,
              pinnedValue: pins[course.enrollmentId] ?? null,
            })),
          })
        : null,
    [valid, parsed, graded, ungraded, pins],
  )

  const gradedUnits = useMemo(() => computeGwa(graded).gradedUnits, [graded])

  return (
    <section>
      <SectionHeader>What if</SectionHeader>

      <div className="stack">
        <Card className="stack">
          <div>
            <label
              htmlFor="whatif-target"
              className="type-subheadline mb-1.5 block"
              style={{ fontWeight: 500 }}
            >
              I want a GWA of
            </label>
            <input
              id="whatif-target"
              inputMode="decimal"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              aria-invalid={target.length > 0 && !valid ? 'true' : undefined}
              aria-describedby="whatif-verdict"
              className="field type-title-3 type-data w-32"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_TARGETS.map((quick) => (
              <motion.button
                key={quick}
                type="button"
                whileTap={{ scale: 0.95 }}
                transition={transition(spring.snap)}
                aria-pressed={valid && Math.abs(parsed - quick) < 1e-9}
                onClick={() => setTarget(quick.toFixed(2))}
                className={cx(
                  'glass glass-sm type-data min-h-[var(--target-min)]',
                  valid && Math.abs(parsed - quick) < 1e-9 && 'glass-accent',
                )}
              >
                {quick.toFixed(2)}
              </motion.button>
            ))}
          </div>

          {hasPastTerms && (
            <div>
              <p className="type-subheadline mb-1.5" style={{ fontWeight: 500 }}>
                Measured against
              </p>
              <div className="segmented w-full" role="radiogroup" aria-label="What the target covers">
                {(['term', 'cumulative'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={scope === option}
                    data-selected={scope === option}
                    onClick={() => setScope(option)}
                    className="segmented-item flex-1"
                  >
                    {option === 'term' ? 'This term' : 'All terms'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div id="whatif-verdict" aria-live="polite">
            {plan ? (
              <Verdict plan={plan} scope={scope} gradedUnits={gradedUnits} />
            ) : (
              <p className="type-footnote text-[var(--label-secondary)]">
                Enter a target between 1.00 and 5.00.
              </p>
            )}
          </div>
        </Card>

        {ungraded.length > 0 && (
          <div>
            <p className="type-footnote px-1 pb-2 text-[var(--label-secondary)]">
              {scope === 'cumulative'
                ? 'These are the only grades still in play — every past term is already set. Pin one and the rest recalculates around it.'
                : 'Expecting a particular grade somewhere? Pin it and the rest recalculates around it.'}
            </p>
            <ListGroup>
              {ungraded.map((course) => (
                <ListRow
                  key={course.enrollmentId}
                  onClick={() => setPinning(course)}
                  title={<span className="type-data">{course.code}</span>}
                  subtitle={`${course.units} unit${course.units === 1 ? '' : 's'}`}
                  trailing={
                    pins[course.enrollmentId] !== undefined ? (
                      <span className="type-data" style={{ color: 'var(--accent)' }}>
                        {pins[course.enrollmentId].toFixed(2)}
                      </span>
                    ) : (
                      <span className="type-footnote text-[var(--label-tertiary)]">Any grade</span>
                    )
                  }
                />
              ))}
            </ListGroup>
          </div>
        )}
      </div>

      <Sheet
        open={pinning !== null}
        onClose={() => setPinning(null)}
        title={pinning ? `Expected grade in ${pinning.code}` : undefined}
        footer={
          pinning && pins[pinning.enrollmentId] !== undefined ? (
            <Button
              variant="plain"
              block
              onClick={() => {
                setPins((current) => {
                  const next = { ...current }
                  delete next[pinning.enrollmentId]
                  return next
                })
                setPinning(null)
              }}
            >
              Remove this pin
            </Button>
          ) : undefined
        }
      >
        {pinning && (
          <div className="stack">
            <GradeScaleGrid
              label={`Expected grade in ${pinning.code}`}
              selected={pins[pinning.enrollmentId] ?? null}
              onSelect={(value) => {
                setPins((current) => ({ ...current, [pinning.enrollmentId]: value }))
                setPinning(null)
              }}
            />
            <p className="type-footnote text-[var(--label-secondary)]">
              Pins only affect this planner. Nothing is recorded against {pinning.code}.
            </p>
          </div>
        )}
      </Sheet>
    </section>
  )
}

/**
 * The verdict, with the scope stated above it.
 *
 * `planWhatIf` returns a sentence that names the target but not what the target
 * is measured against, and "you need 1.25 in each of your four remaining
 * subjects" means something very different over one term than over six. The
 * scope line is therefore always present, not only when it happens to fit.
 */
function Verdict({
  plan,
  scope,
  gradedUnits,
}: {
  plan: WhatIfResult
  scope: WhatIfScope
  gradedUnits: number
}) {
  const where = scope === 'cumulative' ? 'Across every term on record' : 'This term on its own'

  return (
    <div className="flex gap-2.5">
      <span
        aria-hidden
        className="mt-1.5 block size-2.5 shrink-0 rounded-full"
        style={{ background: verdictColor(plan) }}
      />
      <div className="min-w-0 flex-1">
        <p className="type-footnote mb-1 text-[var(--label-secondary)]">
          {plan.currentGwa === null ? (
            <>{where} — nothing graded yet.</>
          ) : (
            <>
              {where} — you are at <span className="type-data">{formatGwa(plan.currentGwa)}</span>{' '}
              over {gradedUnits} unit{gradedUnits === 1 ? '' : 's'}.
            </>
          )}
        </p>

        <p className="type-body">{plan.explanation}</p>

        {plan.bestPossible !== null && plan.verdict !== 'unreachable' && (
          <p className="type-footnote mt-1.5 text-[var(--label-secondary)]">
            {scope === 'cumulative' ? 'Across all terms, ' : 'This term, '}
            <span className="type-data">{formatGwa(plan.bestPossible)}</span> is the best you could
            still finish with, <span className="type-data">{formatGwa(plan.worstPossible)}</span>{' '}
            the worst.
          </p>
        )}
      </div>
    </div>
  )
}

function verdictColor(plan: WhatIfResult): string {
  switch (plan.verdict) {
    case 'unreachable':
    case 'blocked_by_pin':
      return 'var(--danger)'
    case 'guaranteed':
    case 'already_met':
      return 'var(--ok)'
    case 'nothing_left':
      return 'var(--label-tertiary)'
    default:
      return 'var(--info)'
  }
}
