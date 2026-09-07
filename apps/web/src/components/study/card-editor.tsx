'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Writing one card.
 *
 * The same component adds and edits, because they are the same two fields and a
 * separate edit screen would only differ in its heading.
 *
 * After a save the front field takes focus again and both fields clear, so
 * writing ten cards in a row is ten pairs of typing rather than ten round trips
 * through a button. That is the whole interaction this screen exists for.
 */

export interface CardDraft {
  front: string
  back: string
}

export function CardEditor({
  initial,
  submitLabel = 'Add card',
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  initial?: CardDraft
  submitLabel?: string
  onSubmit: (draft: CardDraft) => Promise<void>
  onCancel?: () => void
  autoFocus?: boolean
}) {
  const [front, setFront] = useState(initial?.front ?? '')
  const [back, setBack] = useState(initial?.back ?? '')
  const [busy, setBusy] = useState(false)
  const frontRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) frontRef.current?.focus()
  }, [autoFocus])

  const ready = front.trim().length > 0 && back.trim().length > 0

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    try {
      await onSubmit({ front: front.trim(), back: back.trim() })
      /* Only a fresh card clears. Editing an existing one keeps what was typed,
       * because the sheet closes and re-clearing would flash the old text. */
      if (!initial) {
        setFront('')
        setBack('')
        frontRef.current?.focus()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <label className="block">
        <span className="type-section-header">Front</span>
        <textarea
          ref={frontRef}
          value={front}
          onChange={(event) => setFront(event.target.value)}
          onKeyDown={(event) => {
            /* Enter alone inserts a newline — a card front is sometimes two
             * lines. The deliberate save is the modifier. */
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit()
          }}
          maxLength={1000}
          rows={2}
          placeholder="What is the worst case of quicksort?"
          className="field mt-1.5 w-full resize-y"
          aria-label="Card front"
        />
      </label>

      <label className="block">
        <span className="type-section-header">Back</span>
        <textarea
          value={back}
          onChange={(event) => setBack(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit()
          }}
          maxLength={2000}
          rows={3}
          placeholder="O(n²), when the pivot is always the smallest or largest element."
          className="field mt-1.5 w-full resize-y"
          aria-label="Card back"
        />
      </label>

      <div className="flex gap-2">
        <Button variant="accent" block disabled={!ready || busy} onClick={() => void submit()}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="plain" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
