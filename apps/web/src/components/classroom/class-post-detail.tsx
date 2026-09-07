'use client'

import { useCallback, useEffect, useState } from 'react'
import { describeTimeLeft } from '@onetup/core'
import {
  currentUserId,
  loadClassPost,
  markPostState,
  type ClassPostSummary,
  type SubmissionEntry,
} from '@/lib/queries/classroom'
import { syncNow } from '@/lib/offline/sync'
import { useNow } from '@/lib/hooks/use-local'
import { NavBar } from '@/components/app/nav-bar'
import { NotFoundView } from '@/components/app/not-found-view'
import { Button, ButtonLink } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/surfaces'
import { FormError } from '@/components/auth/auth-form'
import { SubmissionLog, describeWhen } from './submission-log'

/**
 * One post, and what this student has said about it.
 *
 * The student's own control comes before the log, because the first question on
 * this screen is "have I done this" and the second is "has anyone else". Both
 * are answers about work, not about people, and the order says so.
 *
 * Marking submitted works offline. It is the highest-value write in the whole
 * feature — a student taps it walking out of a room with no signal — so it goes
 * through the offline queue rather than a fetch, and `submitted_at` is stamped
 * by the database when the write lands rather than by the phone that queued it.
 */

export interface ClassPostDetailProps {
  postId: string
}

export function ClassPostDetail({ postId }: ClassPostDetailProps) {
  const now = useNow(60_000)

  const [userId, setUserId] = useState<string | null>(null)
  const [post, setPost] = useState<ClassPostSummary | null>(null)
  const [sectionCode, setSectionCode] = useState<string | null>(null)
  const [log, setLog] = useState<SubmissionEntry[]>([])
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const id = userId ?? (await currentUserId())
    if (!id) return
    setUserId(id)

    const found = await loadClassPost(postId, id)
    if (!found) {
      setMissing(true)
      return
    }

    setPost(found.post)
    setSectionCode(found.group.section_code)
    setLog(found.log)
  }, [postId, userId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void syncNow().then(reload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function setState(status: 'submitted' | 'open' | 'done' | 'dismissed') {
    if (!userId) return
    setBusy(true)
    try {
      await markPostState(postId, userId, status)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function edit(patch: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/classrooms/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const body = (await response.json()) as { error?: { message: string } }
      if (!response.ok) {
        setError(body.error?.message ?? 'That did not go through. Try again.')
        return
      }
      await syncNow()
      await reload()
    } finally {
      setBusy(false)
    }
  }

  if (missing) {
    return (
      <NotFoundView
        title="That post isn't here"
        message="It may have been taken down, or you may have left the classroom it was posted in."
        actions={
          <ButtonLink href="/classroom" variant="accent">
            Back to Classroom
          </ButtonLink>
        }
      />
    )
  }

  if (!post) return <PostSkeleton />

  const mine = post.authorId === userId
  const submitted = post.myState === 'submitted'

  return (
    <>
      <NavBar
        title={post.title}
        subtitle={
          [
            sectionCode,
            post.authorName ? `Posted by ${post.authorName}` : null,
            post.edited ? 'edited' : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        back={{ href: '/classroom', label: 'Classroom' }}
      />

      <div className="app-container stack pb-6">
        {error && <FormError>{error}</FormError>}

        <Card>
          <div className="flex flex-wrap items-center gap-2">
            {post.courseCode && <Badge tone="neutral">{post.courseCode}</Badge>}
            {post.hidden && <Badge tone="stale">Hidden</Badge>}
            {post.dueAt && (
              <span className="type-data type-footnote text-[var(--label-secondary)]">
                Due {describeTimeLeft(post.dueAt, now)}
              </span>
            )}
          </div>

          {post.detail && <p className="type-body mt-3 whitespace-pre-wrap">{post.detail}</p>}

          <p className="type-caption-1 mt-3 text-[var(--label-secondary)]">
            Posted {describeWhen(post.createdAt, now)}
          </p>
        </Card>

        {/* The student's own state. Undo is a peer of the action rather than a
            hidden gesture, because a mistyped tap on a shared list is exactly
            the thing someone wants to take back immediately. */}
        <div>
          {submitted ? (
            <Button block variant="plain" disabled={busy} onClick={() => void setState('open')}>
              Submitted · undo
            </Button>
          ) : (
            <Button
              block
              variant="accent"
              disabled={busy}
              onClick={() => void setState('submitted')}
            >
              I&rsquo;ve submitted
            </Button>
          )}
        </div>

        {post.requiresSubmission && log.length > 0 && <SubmissionLog entries={log} now={now} />}

        {post.dueAt && (
          <Card>
            <p className="type-subheadline font-medium">In your tracker</p>
            <p className="type-footnote mt-1 text-[var(--label-secondary)]">
              This shows up in Today and Deadlines beside your own. Dismissing takes it off your
              list and nobody else&rsquo;s — the post stays where it is.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {post.myState === 'dismissed' ? (
                <Button variant="plain" disabled={busy} onClick={() => void setState('open')}>
                  Put it back
                </Button>
              ) : (
                <Button variant="plain" disabled={busy} onClick={() => void setState('dismissed')}>
                  Dismiss from my tracker
                </Button>
              )}
              <ButtonLink href="/deadlines" variant="plain">
                Open Deadlines
              </ButtonLink>
            </div>
          </Card>
        )}

        {/* Hiding is the rep's one-tap remedy for a post that should not have
            gone out, and it is reversible. RLS decides who sees this at all. */}
        <Card>
          <p className="type-subheadline font-medium">This post</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="plain"
              disabled={busy}
              onClick={() => void edit({ pinned: !post.pinned })}
            >
              {post.pinned ? 'Unpin' : 'Pin to the top'}
            </Button>
            <Button
              variant={post.hidden ? 'plain' : 'destructive'}
              disabled={busy}
              onClick={() => void edit({ status: post.hidden ? 'published' : 'hidden' })}
            >
              {post.hidden ? 'Show it again' : 'Hide from the classroom'}
            </Button>
            {mine && post.requiresSubmission && (
              <Button
                variant="plain"
                disabled={busy}
                onClick={() => void edit({ requires_submission: false })}
              >
                Turn off the submission list
              </Button>
            )}
          </div>
          <p className="type-caption-1 mt-2 text-[var(--label-secondary)]">
            Only the person who posted this, or a class rep, can change it. A submission list can
            be turned off but never turned back on.
          </p>
        </Card>
      </div>
    </>
  )
}

function PostSkeleton() {
  return (
    <>
      <NavBar title="Post" back={{ href: '/classroom', label: 'Classroom' }} />
      <div className="app-container stack" aria-busy="true" aria-label="Loading post">
        <div className="skeleton h-28 rounded-[var(--radius-md)]" />
        <div className="skeleton h-12 rounded-[var(--radius-md)]" />
        <div className="skeleton h-40 rounded-[var(--radius-md)]" />
      </div>
    </>
  )
}
