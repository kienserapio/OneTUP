'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadSubjects, type SubjectSummary } from '@/lib/queries/subjects'
import { createPack } from '@/lib/queries/study'
import { syncNow } from '@/lib/offline/sync'
import { Card } from '@/components/ui/surfaces'
import { Button } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { cx } from '@/lib/cx'

/**
 * A new pack.
 *
 * Two fields, and the second one is optional — but it is the one that makes the
 * feature work harder than a stack of index cards. A pack attached to a subject
 * knows when that subject's next deadline is, and compresses its intervals so
 * every card is seen before the date.
 *
 * Then a choice: write the cards yourself, or paste your notes and have them
 * written for you. Writing them yourself is first and is the default, because
 * it works with no signal, costs nothing, and is a better way to learn. The
 * generated path is metered — three a day — and every card it produces is
 * marked and linked to the paragraph it came from.
 */

type Mode = 'write' | 'generate'

export function PackCreate() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [enrollmentId, setEnrollmentId] = useState('')
  const [subjects, setSubjects] = useState<SubjectSummary[] | null>(null)
  const [mode, setMode] = useState<Mode>('write')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  useEffect(() => {
    void loadSubjects(new Date()).then((data) => setSubjects(data.subjects))
  }, [])

  const submit = async () => {
    const trimmed = title.trim()
    if (!trimmed || busy) return

    setBusy(true)
    setError(null)
    try {
      if (mode === 'generate') {
        setProgress('Reading your notes and writing cards. This takes a minute.')
        const response = await fetch('/api/study/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: trimmed,
            enrollment_id: enrollmentId || null,
            text: notes,
          }),
        })
        const payload = (await response.json()) as {
          pack?: { id: string }
          cards?: number
          chunks_skipped?: number
          error?: { message: string }
        }
        if (!response.ok || !payload.pack) {
          setError(payload.error?.message ?? 'That did not work. Try again in a moment.')
          return
        }
        /* Pull before navigating, so the pack and its cards are in the local
         * store by the time the detail screen reads from it. */
        await syncNow()
        router.replace(`/study/${payload.pack.id}` as never)
        return
      }

      const id = await createPack({ title: trimmed, enrollmentId: enrollmentId || null })
      if (!id) {
        setError('You need to be signed in to make a pack.')
        return
      }
      router.replace(`/study/${id}` as never)
    } catch {
      setError("That didn't go through. Check your connection and try again.")
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const ready = title.trim().length > 0 && (mode === 'write' || notes.trim().length >= 200)

  return (
    <>
      <NavBar title="New pack" back={{ href: '/study', label: 'Study' }} largeTitle={false} />

      <div className="app-container stack pb-4">
        <Card className="stack">
          <label className="block">
            <span className="type-section-header">What is it about?</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
              maxLength={120}
              autoFocus
              placeholder="Midterm — sorting algorithms"
              className="field mt-1.5 w-full"
              aria-label="Pack title"
            />
          </label>

          <label className="block">
            <span className="type-section-header">For a subject?</span>
            <select
              value={enrollmentId}
              onChange={(event) => setEnrollmentId(event.target.value)}
              className="field mt-1.5 w-full"
              aria-label="Subject"
            >
              <option value="">Not tied to one</option>
              {(subjects ?? []).map((subject) => (
                <option key={subject.enrollmentId} value={subject.enrollmentId}>
                  {subject.code} — {subject.title}
                </option>
              ))}
            </select>
            <span className="type-footnote mt-1.5 block text-[var(--label-secondary)]">
              Picking one lets the schedule pull cards in before that subject&rsquo;s next
              deadline, so nothing is still queued for the day after the exam.
            </span>
          </label>

          <div>
            <span className="type-section-header">Where do the cards come from?</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <ModeButton active={mode === 'write'} onClick={() => setMode('write')}>
                I&rsquo;ll write them
              </ModeButton>
              <ModeButton active={mode === 'generate'} onClick={() => setMode('generate')}>
                From my notes
              </ModeButton>
            </div>
          </div>

          {mode === 'generate' && (
            <label className="block">
              <span className="type-section-header">Paste your notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={8}
                maxLength={200_000}
                placeholder="Paste a lecture handout, a reviewer, your own notes…"
                className="field mt-1.5 w-full resize-y"
                aria-label="Notes to make cards from"
              />
              <span className="type-footnote mt-1.5 block text-[var(--label-secondary)]">
                {notes.trim().length < 200
                  ? `${notes.trim().length} of 200 characters — a bit more and there is something to work with.`
                  : 'Every card will be marked as generated and linked to the paragraph it came from, so you can check it. Three of these a day.'}
              </span>
            </label>
          )}

          {error && (
            <p className="type-footnote" style={{ color: 'var(--danger)' }} role="alert">
              {error}
            </p>
          )}

          {progress && (
            <p className="type-footnote text-[var(--label-secondary)]" role="status">
              {progress}
            </p>
          )}

          <Button variant="accent" block disabled={busy || !ready} onClick={() => void submit()}>
            {busy
              ? mode === 'generate'
                ? 'Writing cards…'
                : 'Making it…'
              : mode === 'generate'
                ? 'Make cards from these notes'
                : 'Make the pack'}
          </Button>
        </Card>
      </div>
    </>
  )
}

/** A two-up segmented choice. Selected reads as filled, not merely outlined. */
function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex min-h-[var(--target-min)] items-center justify-center',
        'rounded-[var(--radius-sm)] text-[0.9375rem] font-semibold',
      )}
      style={
        active
          ? {
              color: 'var(--accent)',
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            }
          : {
              color: 'var(--label-secondary)',
              background: 'var(--fill-quaternary)',
              border: '1px solid var(--separator)',
            }
      }
    >
      {children}
    </button>
  )
}
