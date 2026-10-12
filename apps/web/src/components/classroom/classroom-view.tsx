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
import { Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { IconClassroom, IconPlus } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
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
        <Card className="flex items-center gap-3.5">
          <IconTile Icon={IconClassroom} tone="crimson" variant="solid" size={52} />
          <span className="min-w-0">
            <p className="type-title-2 truncate">{data.group.section_code}</p>
            <p className="type-footnote mt-0.5 truncate text-[var(--label-secondary)]">
              {[data.termLabel, campusName(data.group.campus)].filter(Boolean).join(' · ')}
            </p>
          </span>
        </Card>

        {pinned.length > 0 && (
          <section>
            <SectionHeader>Pinned</SectionHeader>
            <div className="row-list">
              {pinned.map((post) => (
                <ClassPostRow
                  key={post.id}
                  post={post}
                  now={now}
                  memberCount={data.memberCount}
                />
              ))}
            </div>
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
                icon={<IconTile Icon={IconClassroom} tone="gray" size={52} />}
                title="Nothing posted yet. Anyone in this classroom can post."
              />
            </Card>
          ) : (
            <div className="row-list">
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
            </div>
          )}
        </section>

        {/* Only the rep and the author can see these at all — RLS decides that,
            not this component. Showing them here is what makes hiding
            reversible rather than a delete with a nicer name. */}
        {hidden.length > 0 && (
          <section>
            <SectionHeader>Hidden</SectionHeader>
            <div className="row-list">
              {hidden.map((post) => (
                <ClassPostRow key={post.id} post={post} now={now} memberCount={data.memberCount} />
              ))}
            </div>
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
      <NavBar
        title="Classroom"
        info={
          <InfoTip title="Classroom">
            One shared tracker for your block section: tasks, exams, room changes and who has
            submitted what.
          </InfoTip>
        }
      />
      <div className="app-container stack pb-6">
        <Card>
          <EmptyState
            icon={<IconTile Icon={IconClassroom} tone="crimson" variant="solid" size={64} />}
            title="You're not in a classroom yet. Join the one your section already uses, or start it."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/classroom/new" variant="accent" leading={<IconPlus size={18} />}>
                  Start a classroom
                </ButtonLink>
              </div>
            }
          />
        </Card>

        <Card className="flex items-center gap-3">
          <IconTile Icon={IconPlus} tone="gray" size={40} />
          <p className="type-subheadline flex-1 font-medium">Joining one? Use the invite link.</p>
          <InfoTip title="Invite links">
            Ask whoever set yours up. It looks like /classroom/join/ followed by a code, and usually
            lives in the section group chat.
          </InfoTip>
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
