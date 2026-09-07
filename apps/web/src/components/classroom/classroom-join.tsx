'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { syncNow } from '@/lib/offline/sync'
import { currentUserId, loadClassroom, type ClassroomData } from '@/lib/queries/classroom'
import { NavBar } from '@/components/app/nav-bar'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/surfaces'
import { FormError } from '@/components/auth/auth-form'
import { campusName } from './classroom-view'

/**
 * The invite landing.
 *
 * Two things have to happen on this screen before the button is reached, and
 * the order is deliberate. The student sees which classroom this is — the
 * section code, how many people are in it, who the rep is — and then reads what
 * joining means for their own data. The consent copy sits in the same block as
 * the action rather than as a footnote after it, so a screen reader reaches it
 * first and a thumb does not scroll past it.
 *
 * The classroom itself stays invisible: `classroom_by_invite` is a
 * security-definer window that returns those four fields and nothing else. No
 * member list, no posts.
 */

export interface ClassroomJoinProps {
  code: string
}

interface Preview {
  id: string
  section_code: string | null
  campus: string | null
  term_label: string | null
  member_count: number
  rep_name: string | null
  archived: boolean
}

export function ClassroomJoin({ code }: ClassroomJoinProps) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [current, setCurrent] = useState<ClassroomData | null>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = supabaseBrowser()
    /* Signing in is the proxy's job: `/classroom` is a private prefix, so an
     * invite link opened while signed out redirects to sign-in carrying
     * `next=` and lands back here. Nothing on this screen has to handle it. */
    const userId = await currentUserId()
    if (!userId) {
      setLoading(false)
      return
    }

    const [{ data }, mine] = await Promise.all([
      supabase.rpc('classroom_by_invite', { invite: code }),
      loadClassroom(userId),
    ])

    setPreview((data ?? [])[0] ?? null)
    setCurrent(mine)
    setLoading(false)
  }, [code])

  useEffect(() => {
    void load()
  }, [load])

  async function request() {
    if (!preview) return
    setState('sending')
    setError(null)

    try {
      const response = await fetch(`/api/classrooms/${preview.id}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = (await response.json()) as { error?: { message: string }; already?: boolean }

      if (!response.ok) {
        setError(body.error?.message ?? 'That did not go through. Try again.')
        setState('idle')
        return
      }

      setState('sent')
    } catch {
      setError('That did not go through. Try again.')
      setState('idle')
    }
  }

  async function leaveThenRequest() {
    if (!current) return
    setState('sending')
    setError(null)

    const userId = await currentUserId()
    if (!userId) return

    const { error: leaveError } = await supabaseBrowser()
      .from('group_members')
      .delete()
      .eq('group_id', current.group.id)
      .eq('user_id', userId)

    if (leaveError) {
      setError('We could not take you out of the other classroom. Try again.')
      setState('idle')
      return
    }

    await syncNow()
    setCurrent(null)
    await request()
  }

  if (loading) return <JoinSkeleton />

  if (!preview) {
    return (
      <Frame subtitle="That link does not open anything">
        <Card>
          <p className="type-body">
            This invite has been rotated or the classroom is gone. Ask your class rep for the
            current link.
          </p>
          <div className="mt-4">
            <ButtonLink href="/classroom" variant="plain">
              Back to Classroom
            </ButtonLink>
          </div>
        </Card>
      </Frame>
    )
  }

  const alreadyHere = current?.group.id === preview.id

  return (
    <Frame subtitle={preview.term_label ?? undefined}>
      <div className="stack">
        {error && <FormError>{error}</FormError>}

        <Card>
          <p className="type-title-2">{preview.section_code}</p>
          <p className="type-footnote mt-0.5 text-[var(--label-secondary)]">
            {[
              campusName(preview.campus),
              `${preview.member_count} member${preview.member_count === 1 ? '' : 's'}`,
              preview.rep_name ? `Rep: ${preview.rep_name}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </Card>

        {preview.archived ? (
          <Card>
            <p className="type-body">This classroom has been archived for the term. Nothing new
              can be posted to it.</p>
          </Card>
        ) : alreadyHere ? (
          <Card>
            <p className="type-body">You are already in this classroom.</p>
            <div className="mt-4">
              <ButtonLink href="/classroom" variant="accent">
                Open it
              </ButtonLink>
            </div>
          </Card>
        ) : state === 'sent' ? (
          <Card>
            <p className="type-body">
              Asked. {preview.rep_name ?? 'The rep'} will see your name and let you in — you will
              find the classroom waiting here.
            </p>
            <div className="mt-4">
              <ButtonLink href="/today" variant="plain">
                Back to Today
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <Card>
            {/* The consent copy and the button share one block on purpose:
                what joining costs is read before the action is reached. */}
            <p className="type-body">
              Anyone in this classroom will see when you mark work as submitted, and nothing else.
              Your attendance, grades and personal deadlines stay private.
            </p>

            {current && !alreadyHere && (
              <p className="type-footnote mt-3 text-[var(--label-secondary)]">
                You are in {current.group.section_code} this term. Joining this one means leaving
                that — its posts will drop out of your tracker, and anything you marked submitted
                there disappears from its lists.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {current && !alreadyHere ? (
                <Button
                  variant="accent"
                  disabled={state === 'sending'}
                  onClick={() => void leaveThenRequest()}
                >
                  Leave {current.group.section_code} and ask to join
                </Button>
              ) : (
                <Button
                  variant="accent"
                  disabled={state === 'sending'}
                  onClick={() => void request()}
                >
                  {state === 'sending' ? 'Asking…' : 'Request to join'}
                </Button>
              )}
              <ButtonLink href="/today" variant="plain">
                Not now
              </ButtonLink>
            </div>
          </Card>
        )}
      </div>
    </Frame>
  )
}

function Frame({ subtitle, children }: { subtitle?: string; children: React.ReactNode }) {
  return (
    <>
      <NavBar title="Join a classroom" subtitle={subtitle} />
      <div className="app-container stack pb-6">{children}</div>
    </>
  )
}

function JoinSkeleton() {
  return (
    <>
      <NavBar title="Join a classroom" />
      <div className="app-container stack" aria-busy="true" aria-label="Loading invite">
        <div className="skeleton h-20 rounded-[var(--radius-md)]" />
        <div className="skeleton h-32 rounded-[var(--radius-md)]" />
      </div>
    </>
  )
}
