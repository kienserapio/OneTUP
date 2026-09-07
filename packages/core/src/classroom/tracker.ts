/**
 * The classroom, as arithmetic.
 *
 * Everything a classroom screen shows is a projection of four plain tables —
 * posts, per-member state, membership, courses — and none of it needs a
 * network, a database handle or React to compute. It lives here for the same
 * reason the attendance arithmetic does: the rules that matter are testable
 * only when they are pure, and two of these rules are ones the product has
 * promised not to break.
 *
 * The promises, restated where the code that keeps them can be read:
 *
 *   * **Per post, never across posts** (12-CLASSROOMS-PLAN.md §9.4). Every
 *     function here takes one post and returns facts about that post. There is
 *     no shape in this file that can hold a per-member total, which is what
 *     makes "Cy: 4 of 9" something a future screen cannot casually assemble.
 *   * **Dismissing is personal.** A dismissed post leaves one student's tracker
 *     and stays exactly where it was for the other thirty; nothing here writes
 *     to, or reasons about, the shared row.
 */

import type { ClassPost, ClassPostState, GroupMember } from '../db'

export type PostState = 'open' | 'done' | 'submitted' | 'dismissed'
export type MemberRole = 'owner' | 'rep' | 'member'

export interface ClassroomMember {
  userId: string
  name: string
  role: MemberRole
  joinedAt: string
}

export interface ClassPostSummary {
  id: string
  title: string
  detail: string | null
  kind: string
  dueAt: string | null
  courseCode: string | null
  authorId: string | null
  authorName: string | null
  requiresSubmission: boolean
  pinned: boolean
  hidden: boolean
  edited: boolean
  createdAt: string
  /** This student's own state. No row means `open`, which is the default. */
  myState: PostState
  /** How many classmates have marked it submitted. Zero unless there is a log. */
  submittedCount: number
}

/** A class post carrying a due date, shaped for the tracker it appears in. */
export interface ClassTrackerItem {
  id: string
  title: string
  dueAt: string
  courseCode: string | null
  sectionCode: string
  status: PostState
}

export interface SubmissionEntry {
  userId: string
  name: string
  submittedAt: string | null
}

/** A name for the person, and never anything else about them. */
export function toMember(row: GroupMember): ClassroomMember {
  return {
    userId: row.user_id,
    name: row.display_name?.trim() || 'A classmate',
    role: (row.role ?? 'member') as MemberRole,
    joinedAt: row.joined_at,
  }
}

const ROLE_ORDER: Record<MemberRole, number> = { owner: 0, rep: 1, member: 2 }

export function byRoleThenName(a: ClassroomMember, b: ClassroomMember): number {
  return ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name)
}

/** Pinned first, then newest. A suspension notice that scrolls away is unread. */
export function byPinnedThenRecent(a: ClassPostSummary, b: ClassPostSummary): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return b.createdAt.localeCompare(a.createdAt)
}

export function summarisePost(
  post: ClassPost,
  states: readonly ClassPostState[],
  userId: string,
  courseCodeById: ReadonlyMap<string, string>,
  nameById: ReadonlyMap<string, string>,
): ClassPostSummary {
  const own = states.find((state) => state.post_id === post.id && state.user_id === userId)

  return {
    id: post.id,
    title: post.title,
    detail: post.detail,
    kind: post.kind,
    dueAt: post.due_at,
    courseCode: post.course_id ? (courseCodeById.get(post.course_id) ?? null) : null,
    authorId: post.author_id,
    authorName: post.author_id ? (nameById.get(post.author_id) ?? null) : null,
    requiresSubmission: post.requires_submission,
    pinned: post.pinned,
    hidden: post.status === 'hidden',
    edited: Boolean(post.edited_at),
    createdAt: post.created_at,
    myState: (own?.status ?? 'open') as PostState,
    // Only a post that asked for a log has one, so a post that did not cannot
    // report a number even if state rows happen to be in hand.
    submittedCount: post.requires_submission
      ? states.filter((state) => state.post_id === post.id && state.status === 'submitted').length
      : 0,
  }
}

/**
 * The log for one post: every member exactly once, submitted first and then
 * alphabetically.
 *
 * There is no other ordering, no percentage, and no per-person tally, because
 * the moment the list can be sorted by "how much" it has become a scoreboard
 * about people rather than a note about one piece of work.
 */
export function buildSubmissionLog(
  members: readonly ClassroomMember[],
  states: readonly ClassPostState[],
  postId: string,
): SubmissionEntry[] {
  const submittedAt = new Map(
    states
      .filter((state) => state.post_id === postId && state.status === 'submitted')
      .map((state) => [state.user_id, state.submitted_at]),
  )

  return members
    .map((member) => ({
      userId: member.userId,
      name: member.name,
      submittedAt: submittedAt.get(member.userId) ?? null,
    }))
    .sort((a, b) => {
      if (Boolean(a.submittedAt) !== Boolean(b.submittedAt)) return a.submittedAt ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export interface TrackerSelection {
  posts: readonly ClassPost[]
  states: readonly ClassPostState[]
  /** Group id to canonical section code, for classrooms only. */
  sectionByGroup: ReadonlyMap<string, string>
  courseCodeById: ReadonlyMap<string, string>
  userId: string
}

/**
 * The class posts that belong in a student's tracker.
 *
 * Four conditions, and each one is load-bearing: it has a due date (a notice is
 * not a task), it is published (a hidden post is not a task either), it belongs
 * to a classroom this student is in, and they have not dismissed it. Dismissal
 * is read from their own state row and nowhere else.
 */
export function selectTrackerItems(input: TrackerSelection): ClassTrackerItem[] {
  const stateByPost = new Map(
    input.states.filter((state) => state.user_id === input.userId).map((s) => [s.post_id, s]),
  )

  const items: ClassTrackerItem[] = []

  for (const post of input.posts) {
    const sectionCode = input.sectionByGroup.get(post.group_id)
    if (!post.due_at || post.status !== 'published' || !sectionCode) continue

    const status = (stateByPost.get(post.id)?.status ?? 'open') as PostState
    if (status === 'dismissed') continue

    items.push({
      id: post.id,
      title: post.title,
      dueAt: post.due_at,
      courseCode: post.course_id ? (input.courseCodeById.get(post.course_id) ?? null) : null,
      sectionCode,
      status,
    })
  }

  return items
}
