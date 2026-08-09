'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { IconPlus } from '@/components/ui/icon'
import type { SubjectDefaults } from '@/lib/queries/subjects'

/**
 * Per-course absence limits.
 *
 * The real limit comes from a syllabus, not from the university-wide default, so
 * every course can override both numbers. Null means "follow my default" and is
 * shown as exactly that — a student who sets 5 by hand and a student who
 * inherits 5 should not be left guessing which one they are.
 */

export interface LimitsSheetProps {
  open: boolean
  onClose: () => void
  code: string
  defaults: SubjectDefaults
  allowedAbsences: number | null
  latesPerAbsence: number | null
  onSave: (next: { allowedAbsences: number | null; latesPerAbsence: number | null }) => void
}

export function LimitsSheet({
  open,
  onClose,
  code,
  defaults,
  allowedAbsences,
  latesPerAbsence,
  onSave,
}: LimitsSheetProps) {
  const [absences, setAbsences] = useState<number | null>(allowedAbsences)
  const [lates, setLates] = useState<number | null>(latesPerAbsence)

  useEffect(() => {
    if (!open) return
    setAbsences(allowedAbsences)
    setLates(latesPerAbsence)
  }, [open, allowedAbsences, latesPerAbsence])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Limits for ${code}`}
      footer={
        <Button
          variant="accent"
          block
          onClick={() => {
            onSave({ allowedAbsences: absences, latesPerAbsence: lates })
            onClose()
          }}
        >
          Save
        </Button>
      }
    >
      <div className="stack">
        <LimitField
          id="allowed-absences"
          label="Absences allowed"
          hint="From the syllabus. Most subjects use the same number, but not all."
          value={absences}
          fallback={defaults.allowedAbsences}
          min={0}
          max={30}
          onChange={setAbsences}
        />

        <LimitField
          id="lates-per-absence"
          label="Lates that make one absence"
          hint="Partial lates never round up — two lates under a three-late rule is still zero absences."
          value={lates}
          fallback={defaults.latesPerAbsence}
          min={1}
          max={10}
          onChange={setLates}
        />
      </div>
    </Sheet>
  )
}

function LimitField({
  id,
  label,
  hint,
  value,
  fallback,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: number | null
  fallback: number
  min: number
  max: number
  onChange: (next: number | null) => void
}) {
  const effective = value ?? fallback

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="type-subheadline font-medium">
          {label}
        </label>
        <Stepper
          id={id}
          label={label}
          value={effective}
          min={min}
          max={max}
          onChange={(next) => onChange(next)}
        />
      </div>

      <label className="mt-2 flex min-h-[var(--target-min)] items-center gap-3">
        <input
          type="checkbox"
          checked={value === null}
          onChange={(event) => onChange(event.target.checked ? null : fallback)}
          className="size-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="type-footnote text-[var(--label-secondary)]">
          Use my default ({fallback})
        </span>
      </label>

      <p className="type-footnote mt-1 text-[var(--label-secondary)]">{hint}</p>
    </div>
  )
}

function Stepper({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="glass glass-sm min-h-[var(--target-min)] min-w-[var(--target-min)] justify-center"
      >
        <span aria-hidden className="type-title-3">
          −
        </span>
      </button>
      <output id={id} className="type-body type-data w-10 text-center">
        {value}
      </output>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="glass glass-sm min-h-[var(--target-min)] min-w-[var(--target-min)] justify-center"
      >
        <IconPlus size={18} />
      </button>
    </div>
  )
}
