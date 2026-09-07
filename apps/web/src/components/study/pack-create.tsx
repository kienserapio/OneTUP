'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadSubjects, type SubjectSummary } from '@/lib/queries/subjects'
import { createPack } from '@/lib/queries/study'
import { Card } from '@/components/ui/surfaces'
import { Button } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'

/**
 * A new pack.
 *
 * Two fields, and the second one is optional — but it is the one that makes the
 * feature work harder than a stack of index cards. A pack attached to a subject
 * knows when that subject's next deadline is, and compresses its intervals so
 * every card is seen before the date.
 */
export function PackCreate() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [enrollmentId, setEnrollmentId] = useState('')
  const [subjects, setSubjects] = useState<SubjectSummary[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadSubjects(new Date()).then((data) => setSubjects(data.subjects))
  }, [])

  const submit = async () => {
    const trimmed = title.trim()
    if (!trimmed || busy) return

    setBusy(true)
    setError(null)
    try {
      const id = await createPack({ title: trimmed, enrollmentId: enrollmentId || null })
      if (!id) {
        setError('You need to be signed in to make a pack.')
        return
      }
      router.replace(`/study/${id}` as never)
    } finally {
      setBusy(false)
    }
  }

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

          {error && (
            <p className="type-footnote" style={{ color: 'var(--danger)' }} role="alert">
              {error}
            </p>
          )}

          <Button
            variant="accent"
            block
            disabled={busy || title.trim().length === 0}
            onClick={() => void submit()}
          >
            {busy ? 'Making it…' : 'Make the pack'}
          </Button>
        </Card>
      </div>
    </>
  )
}
