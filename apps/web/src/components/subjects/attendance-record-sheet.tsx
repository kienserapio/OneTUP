'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { type AttendanceRecord, type AttendanceStatus } from '@onetup/core'
import { spring, transition } from '@/design/motion'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cx } from '@/lib/cx'

/**
 * Editing a recorded class.
 *
 * A student who taps the wrong button on the Today prompt has to be able to fix
 * it later without it costing more than the original tap did — the count these
 * records feed is one they may drop a subject over.
 */

const OPTIONS: { status: AttendanceStatus; label: string; color: string; hint?: string }[] = [
  { status: 'present', label: 'Present', color: 'var(--ok)' },
  { status: 'absent', label: 'Absent', color: 'var(--danger)' },
  { status: 'late', label: 'Late', color: 'var(--warning)' },
  {
    status: 'excused',
    label: 'Excused',
    color: 'var(--info)',
    hint: 'Approved absences are not counted against your limit.',
  },
]

export interface AttendanceRecordSheetProps {
  open: boolean
  onClose: () => void
  record: AttendanceRecord | null
  onSave: (changes: { status: AttendanceStatus; note: string | null }) => void
  onDelete: () => void
}

export function AttendanceRecordSheet({
  open,
  onClose,
  record,
  onSave,
  onDelete,
}: AttendanceRecordSheetProps) {
  const [status, setStatus] = useState<AttendanceStatus>(record?.status ?? 'present')
  const [note, setNote] = useState(record?.note ?? '')

  useEffect(() => {
    if (!open || !record) return
    setStatus(record.status)
    setNote(record.note ?? '')
  }, [open, record])

  if (!record) return null

  const selected = OPTIONS.find((option) => option.status === status)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={formatSessionDate(record.session_date)}
      footer={
        <div className="stack">
          <Button
            variant="accent"
            block
            onClick={() => {
              onSave({ status, note: note.trim() || null })
              onClose()
            }}
          >
            Save
          </Button>
          <Button
            variant="destructive"
            block
            onClick={() => {
              onDelete()
              onClose()
            }}
          >
            Delete this record
          </Button>
        </div>
      }
    >
      <div className="stack">
        <div
          role="group"
          aria-label="Attendance status"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {OPTIONS.map((option) => (
            <motion.button
              key={option.status}
              type="button"
              whileTap={{ scale: 0.96 }}
              transition={transition(spring.snap)}
              aria-pressed={status === option.status}
              onClick={() => setStatus(option.status)}
              className={cx(
                'glass glass-sm type-subheadline min-h-[var(--target-min)] justify-center',
                status === option.status && 'glass-accent',
              )}
              style={status === option.status ? undefined : { color: option.color }}
            >
              {option.label}
            </motion.button>
          ))}
        </div>

        {selected?.hint && (
          <p className="type-footnote text-[var(--label-secondary)]">{selected.hint}</p>
        )}

        <div>
          <label htmlFor="attendance-note" className="type-subheadline mb-1.5 block font-medium">
            Note
          </label>
          <input
            id="attendance-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional — why, or what you missed"
            className="field"
          />
        </div>
      </div>
    </Sheet>
  )
}

export function formatSessionDate(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
}
