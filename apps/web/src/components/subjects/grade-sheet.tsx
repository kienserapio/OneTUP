'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { GRADE_SCALE, type NonNumericMark, isPassing } from '@onetup/core'
import { spring, transition } from '@/design/motion'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cx } from '@/lib/cx'

/**
 * Grade entry on the TUP scale.
 *
 * The scale comes from `GRADE_SCALE` rather than a list typed out here, so the
 * only grades a student can enter are grades that exist. Entry is one tap: the
 * options above the grid are set first, then the grade itself both chooses and
 * commits, because picking a grade is a single decision and a Save button would
 * only add a second one.
 */

export const MARKS: { mark: NonNumericMark; label: string; meaning: string }[] = [
  { mark: 'INC', label: 'INC', meaning: 'Incomplete — requirements still outstanding' },
  { mark: 'DRP', label: 'DRP', meaning: 'Dropped' },
  { mark: 'W', label: 'W', meaning: 'Withdrawn' },
  { mark: 'P', label: 'P', meaning: 'Passed, no numeric grade' },
  { mark: 'NP', label: 'NP', meaning: 'Did not pass, no numeric grade' },
]

export interface GradeSheetProps {
  open: boolean
  onClose: () => void
  code: string
  units: number
  value: number | null
  mark: NonNumericMark | null
  isProjected: boolean
  onSave: (next: { value: number | null; mark: NonNumericMark | null; isProjected: boolean }) => void
  onClear?: () => void
}

export function GradeSheet({
  open,
  onClose,
  code,
  units,
  value,
  mark,
  isProjected,
  onSave,
  onClear,
}: GradeSheetProps) {
  const [tab, setTab] = useState<'grade' | 'mark'>(mark ? 'mark' : 'grade')
  const [projected, setProjected] = useState(isProjected)

  useEffect(() => {
    if (!open) return
    setTab(mark ? 'mark' : 'grade')
    setProjected(isProjected)
  }, [open, mark, isProjected])

  function commitGrade(next: number) {
    onSave({ value: next, mark: null, isProjected: projected })
    onClose()
  }

  function commitMark(next: NonNumericMark) {
    onSave({ value: null, mark: next, isProjected: false })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Grade for ${code}`}
      footer={
        onClear && (value !== null || mark !== null) ? (
          <Button
            variant="destructive"
            block
            onClick={() => {
              onClear()
              onClose()
            }}
          >
            Remove this grade
          </Button>
        ) : undefined
      }
    >
      <div className="stack">
        <div className="segmented w-full" role="tablist" aria-label="Grade or mark">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'grade'}
            onClick={() => setTab('grade')}
            className="segmented-item flex-1"
          >
            Grade
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mark'}
            onClick={() => setTab('mark')}
            className="segmented-item flex-1"
          >
            Mark
          </button>
        </div>

        {tab === 'grade' ? (
          <>
            <label className="flex min-h-[var(--target-min)] items-center gap-3">
              <input
                type="checkbox"
                checked={projected}
                onChange={(event) => setProjected(event.target.checked)}
                className="size-5 shrink-0 accent-[var(--accent)]"
              />
              <span className="type-subheadline">
                This is what I expect, not what I got
                <span className="type-footnote block text-[var(--label-secondary)]">
                  Kept out of your GWA and counted only in the projection.
                </span>
              </span>
            </label>

            <GradeScaleGrid selected={value} onSelect={commitGrade} label={`Grade for ${code}`} />

            <p className="type-footnote text-[var(--label-secondary)]">
              3.00 is the passing grade. {units} unit{units === 1 ? '' : 's'}.
            </p>
          </>
        ) : (
          <>
            <div className="stack">
              {MARKS.map((option) => (
                <motion.button
                  key={option.mark}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  transition={transition(spring.snap)}
                  onClick={() => commitMark(option.mark)}
                  aria-pressed={mark === option.mark}
                  className={cx(
                    'glass glass-plain min-h-[var(--target-min)] w-full justify-start gap-3 text-left',
                    mark === option.mark && 'glass-accent',
                  )}
                >
                  <span className="type-data w-10 shrink-0 font-semibold">{option.label}</span>
                  <span className="type-footnote">{option.meaning}</span>
                </motion.button>
              ))}
            </div>

            <p className="type-footnote text-[var(--label-secondary)]">
              A mark has no number to average, so {code} and its {units} unit
              {units === 1 ? '' : 's'} drop out of your GWA entirely.
            </p>
          </>
        )}
      </div>
    </Sheet>
  )
}

/**
 * The 1.00–5.00 grid. Shared with the what-if planner, where the same control
 * pins an expected grade rather than recording a real one.
 */
export function GradeScaleGrid({
  selected,
  onSelect,
  label,
}: {
  selected: number | null
  onSelect: (value: number) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-4 gap-2 sm:grid-cols-5">
      {GRADE_SCALE.map((grade) => {
        const active = selected !== null && Math.abs(selected - grade) < 1e-9
        return (
          <motion.button
            key={grade}
            type="button"
            whileTap={{ scale: 0.94 }}
            transition={transition(spring.snap)}
            aria-pressed={active}
            onClick={() => onSelect(grade)}
            className={cx(
              'glass glass-sm type-data min-h-[var(--target-min)] justify-center',
              active && 'glass-accent',
            )}
            style={
              active || isPassing(grade) ? undefined : { color: 'var(--label-secondary)' }
            }
          >
            {grade.toFixed(2)}
          </motion.button>
        )
      })}
    </div>
  )
}
