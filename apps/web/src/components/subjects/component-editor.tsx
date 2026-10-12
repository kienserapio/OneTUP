'use client'

import { useEffect, useMemo, useState } from 'react'
import { type GradeComponentRow, computeComponentStanding } from '@onetup/core'
import { deleteComponent, saveComponent } from '@/lib/queries/subjects'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import {Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { Row, RowList } from '@/components/ui/row'
import { IconChart, IconChevronRight, IconPlus, IconSave } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'

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
            icon={<IconTile Icon={IconChart} tone="gray" size={48} />}
            title="Track quizzes, exams and projects here to see where you stand before the finals."
            action={
              <Button
                variant="accent"
                onClick={() => setAdding(true)}
                leading={<IconPlus size={18} />}
              >
                Add a component
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="stack">
          <RowList>
            {components.map((component) => (
              <Row
                key={component.id}
                onClick={() => setEditing(component)}
                leading={
                  <span
                    className="grid h-9 min-w-12 place-items-center rounded-xl px-1.5 text-[0.75rem] font-bold tabular-nums"
                    style={{
                      background: component.is_complete
                        ? 'var(--tone-crimson-tint)'
                        : 'var(--canvas)',
                      color: component.is_complete
                        ? 'var(--tone-crimson-ink)'
                        : 'var(--label-secondary)',
                    }}
                  >
                    {Number(component.weight_pct)}%
                  </span>
                }
                title={component.label}
                detail={
                  <span className="type-data">
                    {Number(component.weight_pct)}% of the grade
                    {component.is_complete && component.score_pct !== null
                      ? ` · scored ${Number(component.score_pct)}%`
                      : ' · not yet'}
                  </span>
                }
                trailing={
                  <IconChevronRight size={18} className="shrink-0 text-[var(--label-quaternary)]" />
                }
              />
            ))}
          </RowList>

          <Card className="stack">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5">
                <IconTile Icon={IconChart} tone="gray" size={32} />
                <span className="text-[0.875rem] font-semibold text-[var(--label-secondary)]">
                  Standing so far
                </span>
              </span>
              <span className="text-[1.75rem] font-bold tabular-nums tracking-[-0.03em]">
                {standing.currentStanding === null
                  ? '—'
                  : `${standing.currentStanding.toFixed(1)}%`}
              </span>
            </div>

            {/* How much of the grade is already decided, drawn: the filled part
                is the weight marked done, the rest is still open. */}
            <div
              aria-hidden
              className="h-2.5 w-full overflow-hidden rounded-full"
              style={{ background: 'var(--tone-crimson-tint)' }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, standing.completedWeight)}%`,
                  background: 'var(--tone-crimson)',
                }}
              />
            </div>

            <p className="type-footnote text-[var(--label-secondary)]">
              {standing.completedWeight === 0
                ? 'Nothing is marked done yet, so there is nothing to average.'
                : `Over the ${standing.completedWeight}% of the grade that is already decided. ${standing.remainingWeight}% is still open.`}
            </p>

            {standing.weightsSumTo !== 100 && (
              <p
                className="type-footnote rounded-[var(--radius-md)] p-3"
                style={{ background: 'var(--tone-crimson-tint)', color: 'var(--tone-crimson-ink)' }}
              >
                Your weights add up to {standing.weightsSumTo}%, not 100%. The standing is still
                correct for what you entered, but check the syllabus.
              </p>
            )}

            <div>
              <label htmlFor="component-target" className="mb-1.5 block text-[0.875rem] font-semibold">
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
          <Button
            variant="accent"
            block
            disabled={!valid}
            onClick={() => void save()}
            leading={<IconSave size={18} />}
          >
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
