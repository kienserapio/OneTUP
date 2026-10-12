'use client'

import { describeTimeLeft } from '@onetup/core'
import type { ClassPostSummary } from '@/lib/queries/classroom'

import {
  IconCampus,
  IconCancelled,
  IconCards,
  IconCheck,
  IconDeadlines,
  IconDocs,
  IconGrades,
} from '@/components/ui/icon'
import { IconTile, type Tone } from '@/components/ui/icon-tile'
import { Row, RowPill } from '@/components/ui/row'

/**
 * One post in the classroom list.
 *
 * The pills under the title carry whichever of three things the post actually
 * has — a due date, a submission count, or nothing — rather than reserving
 * space for all three. A row of empty slots is how a list stops being
 * scannable.
 *
 * Only an overdue date takes a colour. The submission count stays grey:
 * crimson marks the active tab, the primary action and the assistant, and a
 * count that competes with those teaches the colour to mean nothing.
 *
 * The leading tile says what kind of post it is before the title is read, and
 * turns into a green check once the student has done or submitted it.
 */

export interface ClassPostRowProps {
  post: ClassPostSummary
  now: Date
  memberCount: number
}

const KIND_LABEL: Record<string, string> = {
  note: 'Note',
  task: 'Task',
  exam: 'Exam',
  quiz: 'Quiz',
  suspension: 'Suspended',
  room_change: 'Room change',
}

const KIND_ICON: Record<string, { Icon: typeof IconDocs; tone: Tone }> = {
  note: { Icon: IconDocs, tone: 'gray' },
  task: { Icon: IconDeadlines, tone: 'crimson' },
  exam: { Icon: IconGrades, tone: 'crimson' },
  quiz: { Icon: IconCards, tone: 'gray' },
  suspension: { Icon: IconCancelled, tone: 'crimson' },
  room_change: { Icon: IconCampus, tone: 'blue' },
}

export function ClassPostRow({ post, now, memberCount }: ClassPostRowProps) {
  const subtitleParts = [
    KIND_LABEL[post.kind] ?? null,
    post.edited ? 'edited' : null,
    post.hidden ? 'hidden' : null,
  ].filter(Boolean)
  const done = post.myState === 'submitted' || post.myState === 'done'
  const overdue = !done && post.dueAt !== null && new Date(post.dueAt) < now
  const kind = KIND_ICON[post.kind] ?? KIND_ICON.note

  return (
    <Row
      as="div"
      href={`/classroom/posts/${post.id}`}
      title={post.title}
      detail={subtitleParts.join(' · ')}
      muted={done && !post.dueAt}
      leading={
        done ? (
          <IconTile Icon={IconCheck} tone="green" variant="solid" size={38} />
        ) : (
          <IconTile Icon={kind.Icon} tone={kind.tone} size={38} />
        )
      }
      meta={
        <>
          {post.courseCode && (
            <RowPill>
              <span className="type-data">{post.courseCode}</span>
            </RowPill>
          )}
          {post.dueAt && (
            <RowPill tone={overdue ? 'crimson' : undefined}>
              <span className="type-data">{describeTimeLeft(post.dueAt, now)}</span>
            </RowPill>
          )}
          {post.requiresSubmission && (
            <RowPill>
              <span className="type-data">
                {post.submittedCount}/{memberCount} in
              </span>
            </RowPill>
          )}
        </>
      }
    />
  )
}
