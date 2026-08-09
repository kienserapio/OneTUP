'use client'

import { useEffect, useMemo, useState } from 'react'
import { type GradeComponentRow, computeComponentStanding } from '@onetup/core'
import { deleteComponent, saveComponent } from '@/lib/queries/subjects'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'

/**
 * Component tracking — the optional half of M3.
 *
 * A student who knows their quiz average and their remaining weight can act
 * before the final, which is the only point at which acting still helps. The
 * target here is a percentage the student types, not a converted letter grade,
 * because the percentage-to-1.00 mapping varies by professor and guessing it
 * would be inventing a number (TDD §5.4).
 */

export interface ComponentEditorProps {
  enrollmentId: string
  components: GradeComponentRow[]
  onChanged: () => void
}

export function ComponentEditor({ enrollmentId, components, onChanged }: ComponentEditorProps) {
  const [editing, setEditing] = useState<GradeComponentRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [target, setTarget] = useState('')

  const targetPct = Number.parseFloat(target)
  const standing = useMemo(
    () =>
      computeComponentStanding(
        components.map((component) => ({
          label: component.label,
          weightPct: Number(component.weight_pct),
          scorePct: component.score_pct === null ? null : Number(component.score_pct),
          isComplete: component.is_complete,
        })),
        Number.isFinite(targetPct) ? targetPct : null,
      ),
    [components, targetPct],
  )

  return (
    <section>
      <SectionHeader
        action={
          components.length > 0 ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="type-footnote min-h-[var(--target-min)] font-medium text-[var(--accent)]"
            >
              Add
            </button>
          ) : undefined
        }
      >
        Components
      </SectionHeader>

      {components.length === 0 ? (
        <Card>
          <EmptyState
            title="Track quizzes, exams and projects here to see where you stand before the finals."
            action={
              <Button variant="accent" onClick={() => setAdding(true)}>
                Add a component
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="stack">
          <ListGroup>
            {components.map((component) => (
              <ListRow
                key={component.id}
                onClick={() => setEditing(component)}
                title={component.label}
                subtitle={
                  <span className="type-data">
                    {Number(component.weight_pct)}% of the grade
                    {component.is_complete && component.score_pct !== null
                      ? ` · scored ${Number(component.score_pct)}%`
                      : ' · not yet'}
                  </span>
                }
              />
            ))}
          </ListGroup>

          <Card className="stack">
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-subheadline text-[var(--label-secondary)]">
                Standing so far
              </span>
              <span className="type-title-3 type-data">
                {standing.currentStanding === null
                  ? '—'
                  : `${standing.currentStanding.toFixed(1)}%`}
              </span>
            </div>

            <p className="type-footnote text-[var(--label-secondary)]">
              {standing.completedWeight === 0
                ? 'Nothing is marked done yet, so there is nothing to average.'
                : `Over the ${standing.completedWeight}% of the grade that is already decided. ${standing.remainingWeight}% is still open.`}
            </p>

            {standing.weightsSumTo !== 100 && (
              <p className="type-footnote" style={{ color: 'var(--caution)' }}>
                Your weights add up to {standing.weightsSumTo}%, not 100%. The standing is still
                correct for what you entered, but check the syllabus.
              </p>
            )}

            <div>
              <label
                htmlFor="component-target"
                className="type-subheadline mb-1.5 block font-medium"
              >
                Aiming for
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="component-target"
                  inputMode="decimal"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder="85"
                  className="field type-data w-24"
                />
                <span className="type-subheadline text-[var(--label-secondary)]">
                  % overall
                </span>
              </div>
            </div>

            {standing.requiredOnRemaining !== null && (
              <p className="type-body">
                {standing.requiresImpossibleScore
                  ? `${targetPct}% is out of reach — it would take ${standing.requiredOnRemaining.toFixed(1)}% across everything left, and the most you can score is 100%.`
                  : `You need ${standing.requiredOnRemaining.toFixed(1)}% across the remaining ${standing.remainingWeight}%.`}
              </p>
            )}
          </Card>
        </div>
      )}

      <ComponentSheet
        open={adding || editing !== null}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        existing={editing}
        enrollmentId={enrollmentId}
        nextOrdinal={components.length}
        onChanged={onChanged}
      />
    </section>
  )
}

function ComponentSheet({
  open,
  onClose,
  existing,
  enrollmentId,
  nextOrdinal,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  existing: GradeComponentRow | null
  enrollmentId: string
  nextOrdinal: number
  onChanged: () => void
}) {
  const [label, setLabel] = useState('')
  const [weight, setWeight] = useState('')
  const [score, setScore] = useState('')
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    if (!open) return
    setLabel(existing?.label ?? '')
    setWeight(existing ? String(Number(existing.weight_pct)) : '')
    setScore(
      existing && existing.score_pct !== null ? String(Number(existing.score_pct)) : '',
    )
    setComplete(existing?.is_complete ?? false)
  }, [open, existing])

  const weightValue = Number.parseFloat(weight)
  const scoreValue = Number.parseFloat(score)
  const valid = label.trim().length > 0 && Number.isFinite(weightValue) && weightValue > 0

  async function save() {
    await saveComponent({
      existing,
      enrollmentId,
      label: label.trim(),
      weightPct: weightValue,
      scorePct: Number.isFinite(scoreValue) ? scoreValue : null,
      isComplete: complete,
      ordinal: existing?.ordinal ?? nextOrdinal,
    })
    onChanged()
    onClose()
  }

  async function remove() {
    if (!existing) return
    await deleteComponent(existing.id)
    onChanged()
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit component' : 'Add a component'}
      footer={
        <div className="stack">
          <Button variant="accent" block disabled={!valid} onClick={() => void save()}>
            Save
          </Button>
          {existing && (
            <Button variant="destructive" block onClick={() => void remove()}>
              Delete
            </Button>
          )}
        </div>
      }
    >
      <div className="stack">
        <div>
          <label htmlFor="component-label" className="type-subheadline mb-1.5 block font-medium">
            What is it
          </label>
          <input
            id="component-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Midterm exam"
            className="field"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="component-weight"
              className="type-subheadline mb-1.5 block font-medium"
            >
              Weight (%)
            </label>
            <input
              id="component-weight"
              inputMode="decimal"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              placeholder="30"
              className="field type-data"
            />
          </div>

          <div>
            <label htmlFor="component-score" className="type-subheadline mb-1.5 block font-medium">
              Score (%)
            </label>
            <input
              id="component-score"
              inputMode="decimal"
              value={score}
              onChange={(event) => setScore(event.target.value)}
              placeholder="—"
              className="field type-data"
            />
          </div>
        </div>

        <label className="flex min-h-[var(--target-min)] items-center gap-3">
          <input
            type="checkbox"
            checked={complete}
            onChange={(event) => setComplete(event.target.checked)}
            className="size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="type-subheadline">
            This one is done
            <span className="type-footnote block text-[var(--label-secondary)]">
              Only finished components count toward your standing.
            </span>
          </span>
        </label>
      </div>
    </Sheet>
  )
}
