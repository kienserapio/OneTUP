'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { NavBar } from '@/components/app/nav-bar'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/surfaces'
import { Field, FormError } from '@/components/auth/auth-form'
import { IconSparkleSmall } from '@/components/ui/icon'

/**
 * Sharing an announcement into OneTUP.
 *
 * The extraction is a proposal, never a publication. Every field is editable
 * before anything reaches a section, and below 0.5 confidence the fields arrive
 * blank rather than pre-filled — a low-confidence read that quietly fills in a
 * plausible wrong date is worse than one that admits it could not tell.
 */

interface Proposal {
  course_code: string | null
  type: string
  event_date: string | null
  event_time: string | null
  summary: string
  detail: string
  creates_deadline: boolean
  confidence: number
  low_confidence: boolean
  course_id: string | null
  enrollment_id: string | null
  term_id: string | null
}

export function ShareIntake() {
  return (
    <Suspense fallback={<div className="app-container"><div className="skeleton h-64 rounded-[var(--radius-lg)]" /></div>}>
      <ShareIntakeInner />
    </Suspense>
  )
}

function ShareIntakeInner() {
  const router = useRouter()
  const params = useSearchParams()
  const submissionId = params.get('submission')

  const [text, setText] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A share-target POST parks the content and sends the browser here, so the
  // text is already waiting rather than needing to be pasted again.
  useEffect(() => {
    if (!submissionId) return
    void (async () => {
      const { data } = await supabaseBrowser()
        .from('announcement_submissions')
        .select('raw_content')
        .eq('id', submissionId)
        .maybeSingle()
      if (data?.raw_content) setText(data.raw_content)
    })()
  }, [submissionId])

  async function read() {
    setError(null)
    setBusy(true)

    try {
      const response = await fetch('/api/announcements/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source: 'paste' }),
      })
      const body = await response.json()

      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not work. You can still add it by hand.')
        return
      }

      if (body.duplicate_of) {
        setDuplicateOf(body.duplicate_of)
        return
      }

      setProposal(body.proposal)
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (!proposal) return
    setBusy(true)

    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return

    const { error: insertError } = await supabase.from('announcements').insert({
      course_id: proposal.course_id,
      term_id: proposal.term_id,
      type: proposal.type as never,
      summary: proposal.summary.slice(0, 140),
      detail: proposal.detail,
      event_date: proposal.event_date,
      event_time: proposal.event_time,
      trust: 'community',
      submitted_by: data.user.id,
      content_hash: crypto.randomUUID().slice(0, 16),
    })

    setBusy(false)

    if (insertError) {
      setError(
        "That couldn't be posted — check the subject is one you're actually enrolled in.",
      )
      return
    }

    router.push('/announcements')
  }

  if (duplicateOf) {
    return (
      <>
        <NavBar title="Already shared" back={{ href: '/announcements' }} largeTitle={false} />
        <div className="app-container stack pt-2">
          <Card>
            <p className="type-body">
              Someone in your section already shared this. We&rsquo;ve counted yours as a
              confirmation instead of posting it twice.
            </p>
          </Card>
          <Button variant="accent" block onClick={() => router.push('/announcements')}>
            See it
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <NavBar
        title="Share an announcement"
        back={{ href: '/announcements', label: 'Announcements' }}
        largeTitle={false}
      />

      <div className="app-container stack pt-2">
        {error && <FormError>{error}</FormError>}

        {!proposal ? (
          <>
            <p className="type-body text-[var(--label-secondary)]">
              Paste what your beadle posted. We&rsquo;ll pull out the subject, the date and what it
              is, and you check it before anyone else sees it.
            </p>

            <label htmlFor="announcement-text" className="sr-only">
              The announcement
            </label>
            <textarea
              id="announcement-text"
              rows={8}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste the message here"
              className="field resize-none"
            />

            <Button
              variant="accent"
              block
              onClick={() => void read()}
              disabled={busy || !text.trim()}
            >
              {busy ? 'Reading…' : 'Read it'}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge tone="generated">
                <IconSparkleSmall size={11} />
                Generated
              </Badge>
              <span className="type-footnote text-[var(--label-secondary)]">
                {proposal.low_confidence
                  ? 'Not much to go on — fill in what you know.'
                  : 'Check this before posting.'}
              </span>
            </div>

            <Field
              id="summary"
              label="What is it?"
              value={proposal.summary}
              onChange={(value) => setProposal({ ...proposal, summary: value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="event-date" className="type-subheadline mb-1.5 block font-medium">
                  Date
                </label>
                <input
                  id="event-date"
                  type="date"
                  value={proposal.event_date ?? ''}
                  onChange={(event) =>
                    setProposal({ ...proposal, event_date: event.target.value || null })
                  }
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="event-time" className="type-subheadline mb-1.5 block font-medium">
                  Time
                </label>
                <input
                  id="event-time"
                  type="time"
                  value={proposal.event_time ?? ''}
                  onChange={(event) =>
                    setProposal({ ...proposal, event_time: event.target.value || null })
                  }
                  className="field"
                />
              </div>
            </div>

            <div>
              <label htmlFor="type" className="type-subheadline mb-1.5 block font-medium">
                Kind
              </label>
              <select
                id="type"
                value={proposal.type}
                onChange={(event) => setProposal({ ...proposal, type: event.target.value })}
                className="field"
              >
                {[
                  ['quiz', 'Quiz'],
                  ['exam', 'Exam'],
                  ['deadline', 'Deadline'],
                  ['room_change', 'Room change'],
                  ['suspension', 'No class'],
                  ['schedule_change', 'Schedule change'],
                  ['general', 'Something else'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {!proposal.course_id && (
              <Card>
                <p className="type-footnote text-[var(--label-secondary)]">
                  We couldn&rsquo;t match this to one of your subjects, so it will post without one.
                  You can only post into subjects you&rsquo;re enrolled in.
                </p>
              </Card>
            )}

            <div className="flex gap-2">
              <Button variant="plain" onClick={() => setProposal(null)} disabled={busy}>
                Back
              </Button>
              <Button variant="accent" block onClick={() => void publish()} disabled={busy}>
                {busy ? 'Posting…' : 'Post to my section'}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
