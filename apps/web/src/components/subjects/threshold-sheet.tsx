'use client'

import { useEffect, useState } from 'react'
import { type UserThreshold } from '@onetup/core'
import { deleteThreshold, saveThreshold } from '@/lib/queries/subjects'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cx } from '@/lib/cx'

/**
 * Threshold configuration.
 *
 * Every threshold is the student's own claim about what they are trying to
 * hold — a Dean's List cut-off, a scholarship condition, a retention floor.
 * OneTUP does not know any university's real numbers, so it never asserts one:
 * the presets are starting points with the source named, and the value is
 * always editable.
 */

const PRESETS: { label: string; comparator: string; value: number; scope: 'term' | 'cumulative' }[] =
  [
    { label: "Dean's List", comparator: '<=', value: 1.75, scope: 'term' },
    { label: 'Scholarship', comparator: '<=', value: 1.5, scope: 'term' },
    { label: 'Retention', comparator: '<=', value: 3.0, scope: 'cumulative' },
  ]

export interface ThresholdSheetProps {
  open: boolean
  onClose: () => void
  existing: UserThreshold | null
  onSaved: () => void
}

export function ThresholdSheet({ open, onClose, existing, onSaved }: ThresholdSheetProps) {
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [scope, setScope] = useState<'term' | 'cumulative'>('term')

  useEffect(() => {
    if (!open) return
    setLabel(existing?.label ?? '')
    setValue(existing ? Number(existing.value).toFixed(2) : '')
    setScope(existing?.scope ?? 'term')
  }, [open, existing])

  const parsed = Number.parseFloat(value)
  const valid = label.trim().length > 0 && Number.isFinite(parsed) && parsed >= 1 && parsed <= 5

  async function save() {
    await saveThreshold({
      existing,
      label: label.trim(),
      // GWA is inverted, so "keeping" a threshold always means staying at or
      // below its value. Offering a direction here would only invite the wrong one.
      comparator: '<=',
      value: parsed,
      scope,
      active: existing?.active ?? true,
    })
    onSaved()
    onClose()
  }

  async function remove() {
    if (!existing) return
    await deleteThreshold(existing.id)
    onSaved()
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit threshold' : 'Add a threshold'}
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
        {!existing && (
          <div>
            <p className="type-section-header pb-2">Start from</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setLabel(preset.label)
                    setValue(preset.value.toFixed(2))
                    setScope(preset.scope)
                  }}
                  className="glass glass-sm min-h-[var(--target-min)]"
                >
                  {preset.label}
                  <span className="type-data ml-1.5 text-[var(--label-secondary)]">
                    {preset.value.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
            <p className="type-footnote mt-2 text-[var(--label-secondary)]">
              These are common values, not official ones. Check your own programme and change
              anything that doesn&rsquo;t match.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="threshold-label" className="type-subheadline mb-1.5 block font-medium">
            What are you holding
          </label>
          <input
            id="threshold-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Dean's List"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="threshold-value" className="type-subheadline mb-1.5 block font-medium">
            Keep my GWA at or below
          </label>
          <input
            id="threshold-value"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="1.75"
            aria-invalid={value.length > 0 && !valid ? 'true' : undefined}
            className="field type-data w-32"
          />
          <p className="type-footnote mt-1.5 text-[var(--label-secondary)]">
            Anywhere from 1.00 to 5.00. Lower is better on the TUP scale.
          </p>
        </div>

        <div>
          <p className="type-subheadline mb-1.5 font-medium">Measured against</p>
          <div className="segmented w-full" role="radiogroup" aria-label="Threshold scope">
            {(['term', 'cumulative'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={scope === option}
                data-selected={scope === option}
                onClick={() => setScope(option)}
                className={cx('segmented-item flex-1')}
              >
                {option === 'term' ? 'This term' : 'All terms'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
