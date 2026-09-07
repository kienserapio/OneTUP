'use client'

import { describeTimeLeft } from '@onetup/core'
import type { ClassPostSummary } from '@/lib/queries/classroom'
import { ListRow } from '@/components/ui/surfaces'
import { IconCheck } from '@/components/ui/icon'

/**
 * One post in the classroom list.
 *
 * The trailing slot carries whichever of three things the post actually has —
 * a due date, a submission count, or nothing — rather than reserving space for
 * all three. A row of empty columns is how a list stops being scannable.
 *
 * The submission count is `type-data` and `--label-secondary`. It is not
 * accented: crimson marks the active tab, the primary action and the assistant,
 * and a count that competes with those teaches the colour to mean nothing.
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

export function ClassPostRow({ post, now, memberCount }: ClassPostRowProps) {
  const subtitleParts = [
    post.courseCode,
    KIND_LABEL[post.kind] ?? null,
    post.edited ? 'edited' : null,
    post.hidden ? 'hidden' : null,
  ].filter(Boolean)

  return (
    <ListRow
      href={`/classroom/posts/${post.id}`}
      title={post.title}
      subtitle={subtitleParts.join(' · ')}
      leading={
        post.myState === 'submitted' || post.myState === 'done' ? (
          <IconCheck size={18} style={{ color: 'var(--ok)' }} />
        ) : undefined
      }
      trailing={
        <span className="type-footnote shrink-0 text-right text-[var(--label-secondary)]">
          {post.dueAt && <span className="type-data block">{describeTimeLeft(post.dueAt, now)}</span>}
          {post.requiresSubmission && (
            <span className="type-data block">
              {post.submittedCount}/{memberCount}
            </span>
          )}
        </span>
      }
    />
  )
}
