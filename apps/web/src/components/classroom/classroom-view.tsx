'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CAMPUS_LABEL, type Campus } from '@onetup/core'
import {
  currentUserId,
  loadClassroom,
  type ClassroomData,
} from '@/lib/queries/classroom'
import { syncNow } from '@/lib/offline/sync'
import { useNow } from '@/lib/hooks/use-local'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, EmptyState, ListGroup, SectionHeader } from '@/components/ui/surfaces'
import { IconClassroom, IconPlus } from '@/components/ui/icon'
import { ClassPostRow } from './class-post-row'
import { ClassPostComposer, useOnline } from './class-post-composer'

/**
 * The classroom.
 *
 * The default screen once a student is in one, and an invitation to create or
 * join when they are not. Everything on it comes out of the local store, so it
 * renders in a corridor with no signal — which is where a student actually
 * checks what the class said.
 *
 * Pinned posts sit above the rest because a suspension notice that scrolls away
 * under three quiz reminders is a notice nobody reads.
 */

export function ClassroomView() {
  const now = useNow(60_000)
  const online = useOnline()

  const [userId, setUserId] = useState<string | null>(null)
  const [data, setData] = useState<ClassroomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)

  const reload = useCallback(async () => {
    const id = userId ?? (await currentUserId())
    if (!id) {
      setLoading(false)
      return
    }
    setUserId(id)
    setData(await loadClassroom(id))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void syncNow().then(reload)
    // Once, on mount: the local store answers first and the network catches up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <ClassroomSkeleton />
  if (!data) return <NoClassroom />

  const pinned = data.posts.filter((post) => post.pinned && !post.hidden)
  const rest = data.posts.filter((post) => !post.pinned && !post.hidden)
  const hidden = data.posts.filter((post) => post.hidden)

  return (
    <>
      <NavBar
        title="Classroom"
        subtitle={data.termLabel ?? undefined}
        trailing={
          <ButtonLink href="/classroom/members" size="sm" variant="plain">
            {data.memberCount} member{data.memberCount === 1 ? '' : 's'}
          </ButtonLink>
        }
      />

      <div className="app-container stack pb-6">
        <Card>
          <p className="type-title-2">{data.group.section_code}</p>
          <p className="type-footnote mt-0.5 text-[var(--label-secondary)]">
            {[data.termLabel, campusName(data.group.campus)].filter(Boolean).join(' · ')}
          </p>
        </Card>

        {pinned.length > 0 && (
          <section>
            <SectionHeader>Pinned</SectionHeader>
            <ListGroup>
              {pinned.map((post) => (
                <ClassPostRow
                  key={post.id}
                  post={post}
                  now={now}
                  memberCount={data.memberCount}
                />
              ))}
            </ListGroup>
          </section>
        )}

        <section>
          <SectionHeader
            action={
              <Button
                size="sm"
                variant="plain"
                leading={<IconPlus size={16} />}
                disabled={!online}
                onClick={() => setComposing(true)}
              >
                New post
              </Button>
            }
          >
            Recent
          </SectionHeader>

          {rest.length === 0 ? (
            <Card>
              <EmptyState
                icon={<IconClassroom size={28} />}
                title="Nothing posted yet. Anyone in this classroom can post."
              />
            </Card>
          ) : (
            <ListGroup>
              <AnimatePresence initial={false}>
                {rest.map((post) => (
                  <motion.div
                    key={post.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={transition(spring.ui)}
                  >
                    <ClassPostRow post={post} now={now} memberCount={data.memberCount} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </ListGroup>
          )}
        </section>

        {/* Only the rep and the author can see these at all — RLS decides that,
            not this component. Showing them here is what makes hiding
            reversible rather than a delete with a nicer name. */}
        {hidden.length > 0 && (
          <section>
            <SectionHeader>Hidden</SectionHeader>
            <ListGroup>
              {hidden.map((post) => (
                <ClassPostRow key={post.id} post={post} now={now} memberCount={data.memberCount} />
              ))}
            </ListGroup>
          </section>
        )}
      </div>

      <ClassPostComposer
        groupId={data.group.id}
        sectionCode={data.group.section_code ?? 'your classroom'}
        open={composing}
        onClose={() => setComposing(false)}
        onPublished={reload}
      />
    </>
  )
}

export function campusName(campus: string | null): string | null {
  if (!campus) return null
  return CAMPUS_LABEL[campus as Campus] ?? null
}

function NoClassroom() {
  return (
    <>
      <NavBar title="Classroom" subtitle="One shared tracker for your block section" />
      <div className="app-container stack pb-6">
        <Card>
          <EmptyState
            icon={<IconClassroom size={28} />}
            title="You're not in a classroom yet. Join the one your section already uses, or start it."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/classroom/new" variant="accent">
                  Start a classroom
                </ButtonLink>
              </div>
            }
          />
        </Card>

        <Card>
          <p className="type-subheadline font-medium">Joining one</p>
          <p className="type-footnote mt-1 text-[var(--label-secondary)]">
            A classroom is joined by invite link. Ask whoever set yours up for it — it looks like
            /classroom/join/ followed by a code, and it usually lives in the section group chat.
          </p>
        </Card>
      </div>
    </>
  )
}

function ClassroomSkeleton() {
  return (
    <>
      <NavBar title="Classroom" />
      <div className="app-container stack" aria-busy="true" aria-label="Loading classroom">
        <div className="skeleton h-20 rounded-[var(--radius-md)]" />
        <div className="skeleton h-40 rounded-[var(--radius-md)]" />
      </div>
    </>
  )
}
