'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { manilaInstant } from '@onetup/core'
import { supabaseBrowser } from '@/lib/supabase/client'
import { NavBar } from '@/components/app/nav-bar'
import { Button } from '@/components/ui/button'
import { Card, GeneratedMark, SectionHeader } from '@/components/ui/surfaces'
import { currentUserId, loadClassroom, type ClassroomData } from '@/lib/queries/classroom'
import { syncNow } from '@/lib/offline/sync'
import { Field, FormError } from '@/components/auth/auth-form'

/**
 * Sharing an announcement into OneTUP.
 *
 * The extraction is a proposal, never a publication. Every field is editable
 * before anything reaches a section, and below 0.5 confidence the fields arrive
 * blank rather than pre-filled — a low-confidence read that quietly fills in a
 * plausible wrong date is worse than one that admits it could not tell.
 *
 * The read is what carries the generated marker. What the student types over it
 * is theirs, so the original message sits beside the fields on a wide screen and
 * the two can be compared without scrolling.
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

const KINDS: [string, string][] = [
  ['quiz', 'Quiz'],
  ['exam', 'Exam'],
  ['deadline', 'Deadline'],
  ['room_change', 'Room change'],
  ['suspension', 'No class'],
  ['schedule_change', 'Schedule change'],
  ['general', 'Something else'],
]

export function ShareIntake() {
  return (
    <Suspense
      fallback={
        <div className="app-container pt-2">
          <div className="skeleton h-64 rounded-[var(--radius-md)]" />
        </div>
      }
    >
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
  const [classroom, setClassroom] = useState<ClassroomData | null>(null)
  const [alsoPost, setAlsoPost] = useState(false)
  const [askSubmissions, setAskSubmissions] = useState(false)

  // Whether this student has a classroom to post into at all. The control
  // below simply does not exist for someone who has not joined one.
  useEffect(() => {
    void (async () => {
      const id = await currentUserId()
      if (id) setClassroom(await loadClassroom(id))
    })()
  }, [])

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
    if (!data.user) {
      setBusy(false)
      return
    }

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

    if (insertError) {
      setBusy(false)
      setError("That couldn't be posted — check the subject is one you're actually enrolled in.")
      return
    }

    /* The classroom is a second audience, not a second copy of the same one: a
     * classroom is thirty people who share a timetable, the feed is everyone
     * taking CS 3105. The post carries the original message so the dedupe index
     * catches the next classmate who shares it. */
    if (alsoPost && classroom) {
      const response = await fetch(`/api/classrooms/${classroom.group.id}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: proposal.summary.slice(0, 140),
          detail: proposal.detail || undefined,
          kind: classPostKind(proposal.type),
          due_at:
            proposal.creates_deadline && proposal.event_date
              ? manilaInstant(proposal.event_date, proposal.event_time?.slice(0, 5) || '23:59').toISOString()
              : null,
          course_id: proposal.course_id,
          requires_submission: askSubmissions,
          submission_id: submissionId,
          source_text: text || proposal.detail,
        }),
      })

      if (!response.ok) {
        setBusy(false)
        setError(
          'It went to your section feed, but not to your classroom. Try posting it there yourself.',
        )
        return
      }

      await syncNow()
    }

    setBusy(false)
    router.push(alsoPost && classroom ? '/classroom' : '/announcements')
  }

  if (duplicateOf) {
    return (
      <>
        <NavBar title="Already shared" back={{ href: '/announcements' }} largeTitle={false} />
        <div className="app-container stack max-w-[36rem] pt-2">
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
        subtitle={
          proposal
            ? 'Check every field before your section sees it'
            : 'Paste what your class representative posted'
        }
        back={{ href: '/announcements', label: 'Announcements' }}
        largeTitle={false}
      />

      <div className="app-container pb-6">
        {error && (
          <div className="pb-4">
            <FormError>{error}</FormError>
          </div>
        )}

        {!proposal ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <Card className="flex flex-col gap-3">
              <label htmlFor="announcement-text" className="type-subheadline font-medium">
                The message
              </label>
              <textarea
                id="announcement-text"
                rows={10}
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
            </Card>

            {/* The offset clears the sticky top bar, which is drawn above this. */}
            <aside
              className="lg:sticky"
              style={{ top: 'calc(var(--topbar-height) + var(--space-4))' }}
            >
              <Card className="flex flex-col gap-2">
                <h2 className="type-headline">What happens next</h2>
                <p className="type-footnote text-[var(--label-secondary)]">
                  We pull out the subject, the date and what kind of thing it is. You check every
                  field, and nothing reaches your section until you post it.
                </p>
                <p className="type-footnote text-[var(--label-secondary)]">
                  You can only post into subjects you&rsquo;re enrolled in.
                </p>
              </Card>
            </aside>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Card className="flex flex-col gap-3">
              <GeneratedMark>
                <span className="type-footnote text-[var(--label-secondary)]">
                  {proposal.low_confidence
                    ? 'Not much to go on — fill in what you know.'
                    : 'Check this before posting.'}
                </span>
              </GeneratedMark>

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
                    className="field type-data"
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
                    className="field type-data"
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
                  {KINDS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {!proposal.course_id && (
                <p className="type-footnote text-[var(--label-secondary)]">
                  We couldn&rsquo;t match this to one of your subjects, so it will post without one.
                  You can only post into subjects you&rsquo;re enrolled in.
                </p>
              )}

              {classroom && (
                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex min-h-[var(--target-min)] items-center gap-3">
                    <input
                      type="checkbox"
                      checked={alsoPost}
                      onChange={(event) => {
                        setAlsoPost(event.target.checked)
                        if (!event.target.checked) setAskSubmissions(false)
                      }}
                      className="size-5 shrink-0"
                    />
                    <span className="type-subheadline">
                      Also post to {classroom.group.section_code}
                    </span>
                  </label>

                  <label className="flex min-h-[var(--target-min)] items-start gap-3">
                    <input
                      type="checkbox"
                      checked={askSubmissions}
                      disabled={!alsoPost}
                      onChange={(event) => setAskSubmissions(event.target.checked)}
                      className="mt-1 size-5 shrink-0"
                    />
                    <span>
                      <span className="type-subheadline block">Ask who has submitted</span>
                      <span className="type-caption-1 block text-[var(--label-secondary)]">
                        {alsoPost
                          ? 'Everyone in the classroom will see who has marked this submitted. It can be turned off later, never back on.'
                          : 'Available once this is going to your classroom.'}
                      </span>
                    </span>
                  </label>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="plain" onClick={() => setProposal(null)} disabled={busy}>
                  Back
                </Button>
                <Button variant="accent" block onClick={() => void publish()} disabled={busy}>
                  {busy
                    ? 'Posting…'
                    : alsoPost && classroom
                      ? 'Post to my section and classroom'
                      : 'Post to my section'}
                </Button>
              </div>
            </Card>

            <section
              className="lg:sticky"
              style={{ top: 'calc(var(--topbar-height) + var(--space-4))' }}
            >
              <SectionHeader>What you pasted</SectionHeader>
              <Card>
                <p className="type-footnote max-h-[24rem] overflow-y-auto whitespace-pre-wrap text-[var(--label-secondary)]">
                  {text || proposal.detail}
                </p>
              </Card>
            </section>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * The announcement kinds and the class-post kinds are two lists that agree on
 * most of their members and not all of them. `deadline` and `schedule_change`
 * have no classroom equivalent worth adding a value for, so they land on the
 * nearest honest one rather than inventing a sixth.
 */
function classPostKind(announcementType: string): string {
  switch (announcementType) {
    case 'quiz':
    case 'exam':
    case 'suspension':
    case 'room_change':
      return announcementType
    case 'deadline':
      return 'task'
    default:
      return 'note'
  }
}
