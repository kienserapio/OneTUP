'use client'

import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  type GradedCourse,
  type WhatIfResult,
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
 */

const QUICK_TARGETS = [1.0, 1.25, 1.5, 1.75, 2.0]

export interface WhatIfPlannerProps {
  graded: readonly GradedCourse[]
  ungraded: readonly { enrollmentId: string; code: string; units: number }[]
  /** Grades already recorded as expectations, used as the starting pins. */
  initialPins?: Record<string, number>
}

export function WhatIfPlanner({ graded, ungraded, initialPins }: WhatIfPlannerProps) {
  const [target, setTarget] = useState('1.75')
  const [pins, setPins] = useState<Record<string, number>>(initialPins ?? {})
  const [pinning, setPinning] = useState<{ enrollmentId: string; code: string } | null>(null)

  const parsed = Number.parseFloat(target)
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 5

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

  return (
    <section>
      <SectionHeader>What if</SectionHeader>

      <div className="stack">
        <Card className="stack">
          <div>
            <label htmlFor="whatif-target" className="type-subheadline mb-1.5 block font-medium">
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

          <div id="whatif-verdict" aria-live="polite">
            {plan ? (
              <Verdict plan={plan} />
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
              Expecting a particular grade somewhere? Pin it and the rest recalculates around it.
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

function Verdict({ plan }: { plan: WhatIfResult }) {
  return (
    <div className="flex gap-2.5">
      <span
        aria-hidden
        className="mt-1.5 block size-2.5 shrink-0 rounded-full"
        style={{ background: verdictColor(plan) }}
      />
      <div className="min-w-0 flex-1">
        <p className="type-body">{plan.explanation}</p>

        {plan.bestPossible !== null && plan.verdict !== 'unreachable' && (
          <p className="type-footnote mt-1.5 text-[var(--label-secondary)]">
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
