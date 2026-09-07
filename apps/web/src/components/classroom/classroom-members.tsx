'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  currentUserId,
  loadClassroom,
  loadJoinRequests,
  type ClassroomData,
  type ClassroomMember,
  type JoinRequest,
} from '@/lib/queries/classroom'
import { supabaseBrowser } from '@/lib/supabase/client'
import { syncNow } from '@/lib/offline/sync'
import { NavBar } from '@/components/app/nav-bar'
import { Button, ButtonLink, IconButton } from '@/components/ui/button'
import { Badge, Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { Sheet } from '@/components/ui/sheet'
import { FormError } from '@/components/auth/auth-form'
import { IconCheck, IconClassroom, IconClose, IconRefresh } from '@/components/ui/icon'

/**
 * Who is in, and who is asking.
 *
 * Requests come first, because that is the only thing on this screen with
 * someone waiting on the other end of it.
 *
 * The line above them is the honest one: OneTUP cannot check any of this
 * against the registrar, and pretending otherwise with a confidence score would
 * be worse than saying so. What a rep is genuinely good at is recognising their
 * own classmates by name, and the screen asks them to do exactly that.
 *
 * Rep-only actions are absent for a member rather than present and disabled. A
 * greyed-out Remove teaches a member that removing is a thing they nearly have.
 */

export function ClassroomMembers() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [data, setData] = useState<ClassroomData | null>(null)
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [selected, setSelected] = useState<ClassroomMember | null>(null)
  const [invite, setInvite] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const id = userId ?? (await currentUserId())
    if (!id) return
    setUserId(id)

    const classroom = await loadClassroom(id)
    setData(classroom)
    setInvite(classroom?.group.invite_code ?? null)

    if (classroom?.isRep) setRequests(await loadJoinRequests(classroom.group.id))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void syncNow().then(reload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function decide(requestId: string, approve: boolean) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/classrooms/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
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

  async function act(path: string, method: 'PATCH' | 'DELETE' | 'POST', body?: unknown) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const parsed = (await response.json()) as { error?: { message: string }; invite_code?: string }
      if (!response.ok) {
        setError(parsed.error?.message ?? 'That did not go through. Try again.')
        return false
      }
      if (parsed.invite_code) setInvite(parsed.invite_code)
      await syncNow()
      await reload()
      return true
    } finally {
      setBusy(false)
      setSelected(null)
    }
  }

  async function leave() {
    if (!data || !userId) return
    setBusy(true)
    const { error: leaveError } = await supabaseBrowser()
      .from('group_members')
      .delete()
      .eq('group_id', data.group.id)
      .eq('user_id', userId)

    setBusy(false)
    if (leaveError) {
      setError('We could not take you out. Try again.')
      return
    }
    await syncNow()
    router.push('/classroom')
  }

  if (loading) return <MembersSkeleton />
  if (!data) {
    return (
      <>
        <NavBar title="Members" back={{ href: '/classroom', label: 'Classroom' }} />
        <div className="app-container">
          <Card>
            <EmptyState
              icon={<IconClassroom size={28} />}
              title="You're not in a classroom yet."
              action={
                <ButtonLink href="/classroom" variant="plain">
                  Back
                </ButtonLink>
              }
            />
          </Card>
        </div>
      </>
    )
  }

  const inviteUrl =
    typeof window !== 'undefined' && invite ? `${window.location.origin}/classroom/join/${invite}` : null

  return (
    <>
      <NavBar
        title="Members"
        subtitle={`${data.group.section_code} · ${data.memberCount} member${data.memberCount === 1 ? '' : 's'}`}
        back={{ href: '/classroom', label: 'Classroom' }}
      />

      <div className="app-container stack pb-6">
        {error && <FormError>{error}</FormError>}

        {data.isRep && requests.length > 0 && (
          <section>
            <SectionHeader>Requests</SectionHeader>
            <p className="type-footnote mb-2 px-1 text-[var(--label-secondary)]">
              OneTUP cannot verify these. Approve people you recognise.
            </p>
            <ListGroup>
              {requests.map((request) => (
                <ListRow
                  key={request.id}
                  title={request.name ?? 'Someone'}
                  subtitle={[request.studentNumber, request.claimedSection, request.message]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <span className="flex shrink-0 gap-1">
                      <IconButton
                        label={`Approve ${request.name ?? 'this request'}`}
                        disabled={busy}
                        onClick={() => void decide(request.id, true)}
                      >
                        <IconCheck size={18} style={{ color: 'var(--ok)' }} />
                      </IconButton>
                      <IconButton
                        label={`Decline ${request.name ?? 'this request'}`}
                        disabled={busy}
                        onClick={() => void decide(request.id, false)}
                      >
                        <IconClose size={18} />
                      </IconButton>
                    </span>
                  }
                />
              ))}
            </ListGroup>
          </section>
        )}

        {data.isRep && inviteUrl && (
          <Card>
            <p className="type-subheadline font-medium">Invite link</p>
            <p className="type-caption-1 mt-1 break-all text-[var(--label-secondary)]">{inviteUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="plain"
                onClick={() => void navigator.clipboard?.writeText(inviteUrl)}
              >
                Copy
              </Button>
              <Button
                size="sm"
                variant="plain"
                leading={<IconRefresh size={16} />}
                disabled={busy}
                onClick={() => void act(`/api/classrooms/${data.group.id}/invite`, 'POST')}
              >
                New link
              </Button>
            </div>
            <p className="type-caption-1 mt-2 text-[var(--label-secondary)]">
              A new link stops the old one working straight away. Use it if the link went somewhere
              it should not have.
            </p>
          </Card>
        )}

        <section>
          <SectionHeader>In this classroom</SectionHeader>
          <ListGroup>
            {data.members.map((member) => (
              <ListRow
                key={member.userId}
                title={member.name}
                subtitle={member.userId === userId ? 'You' : undefined}
                trailing={
                  member.role === 'member' ? undefined : (
                    <Badge tone="neutral">{member.role === 'owner' ? 'Rep · owner' : 'Rep'}</Badge>
                  )
                }
                onClick={
                  data.isRep && member.userId !== userId ? () => setSelected(member) : undefined
                }
              />
            ))}
          </ListGroup>
        </section>

        {/* The stranded classroom, §6 step 6. Offered to any rep, and refused
            by the database unless the owner really has been quiet for sixty
            days — so the button does not have to guess, and the reason comes
            back as a sentence when it is declined. */}
        {data.role === 'rep' && (
          <Card>
            <p className="type-subheadline font-medium">If the owner has gone quiet</p>
            <p className="type-footnote mt-1 text-[var(--label-secondary)]">
              After 60 days with no sign of them, a rep can take the classroom over so joins can be
              approved again. They stay in it as a rep.
            </p>
            <div className="mt-3">
              <Button
                variant="plain"
                disabled={busy}
                onClick={() => void act(`/api/classrooms/${data.group.id}/claim`, 'POST')}
              >
                Take over this classroom
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <p className="type-subheadline font-medium">Leaving</p>
          <p className="type-footnote mt-1 text-[var(--label-secondary)]">
            Its posts drop out of your tracker, and anything you marked submitted disappears from
            every list in this classroom at the same moment.
          </p>
          <div className="mt-3">
            <Button variant="destructive" disabled={busy} onClick={() => void leave()}>
              Leave {data.group.section_code}
            </Button>
          </div>
          {data.role === 'owner' && (
            <p className="type-caption-1 mt-2 text-[var(--label-secondary)]">
              You own this classroom. Hand it to someone else first, or the section is left without
              anyone who can approve a join.
            </p>
          )}
        </Card>
      </div>

      <Sheet open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name}>
        {selected && (
          <div className="stack">
            {selected.role === 'member' ? (
              <Button
                block
                disabled={busy}
                onClick={() =>
                  void act(`/api/classrooms/${data.group.id}/members/${selected.userId}`, 'PATCH', {
                    role: 'rep',
                  })
                }
              >
                Make rep
              </Button>
            ) : (
              data.role === 'owner' && (
                <Button
                  block
                  disabled={busy}
                  onClick={() =>
                    void act(`/api/classrooms/${data.group.id}/members/${selected.userId}`, 'PATCH', {
                      role: 'member',
                    })
                  }
                >
                  Remove rep
                </Button>
              )
            )}

            {data.role === 'owner' && (
              <Button
                block
                disabled={busy}
                onClick={() =>
                  void act(`/api/classrooms/${data.group.id}/members/${selected.userId}`, 'PATCH', {
                    role: 'owner',
                  })
                }
              >
                Hand the classroom over to {selected.name}
              </Button>
            )}

            <Button
              block
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void act(`/api/classrooms/${data.group.id}/members/${selected.userId}`, 'DELETE')
              }
            >
              Remove {selected.name} from {data.group.section_code}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  )
}

function MembersSkeleton() {
  return (
    <>
      <NavBar title="Members" back={{ href: '/classroom', label: 'Classroom' }} />
      <div className="app-container stack" aria-busy="true" aria-label="Loading members">
        <div className="skeleton h-32 rounded-[var(--radius-md)]" />
        <div className="skeleton h-40 rounded-[var(--radius-md)]" />
      </div>
    </>
  )
}
