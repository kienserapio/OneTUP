'use client'

import {
  buildSubmissionLog,
  byPinnedThenRecent,
  byRoleThenName,
  selectTrackerItems,
  summarisePost,
  toMember,
  type ClassPost,
  type ClassPostState,
  type ClassPostSummary,
  type ClassTrackerItem,
  type ClassroomMember,
  type Course,
  type Group,
  type GroupMember,
  type MemberRole,
  type PostState,
  type SubmissionEntry,
  type Term,
} from '@onetup/core'
import { readAll } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * The classroom, assembled from the local store.
 *
 * Same contract as `today.ts`: everything a member reads renders with no
 * network, because the room a student is standing in is exactly where the
 * signal is worst. The two things that cannot be local are the rep's request
 * queue — a list about people who are not members yet, so their rows are not in
 * anyone's offline set — and publishing, which needs the dedupe check and the
 * rate limiter that only the server has.
 *
 * Nothing here reads `profiles`. Names come from `group_members.display_name`,
 * copied at join time, because widening `profiles` so a log could render a name
 * would hand every classmate a student number as a side effect (§8).
 */

export type {
  ClassPostSummary,
  ClassTrackerItem,
  ClassroomMember,
  MemberRole,
  PostState,
  SubmissionEntry,
}

export interface ClassroomData {
  group: Group
  termLabel: string | null
  role: MemberRole
  isRep: boolean
  memberCount: number
  members: ClassroomMember[]
  posts: ClassPostSummary[]
}

/**
 * Who is signed in, without asking the network.
 *
 * `getSession()` reads the stored session; `getUser()` verifies it against the
 * server, which is the right call before a write and the wrong one on the read
 * path of a screen that has to render in a corridor with no signal. The id is
 * only used here to pick out this student's own rows from a local store that
 * RLS already filtered.
 */
export async function currentUserId(): Promise<string | null> {
  const supabase = supabaseBrowser()
  const { data: session } = await supabase.auth.getSession()
  if (session.session?.user?.id) return session.session.user.id

  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * The one classroom this student is in, if any.
 *
 * "One" is not an assumption the client makes on its own —
 * `idx_one_classroom_per_student_per_term` enforces it — but a student who was
 * in one last term still has that membership, so the current term wins and the
 * most recent membership breaks any remaining tie.
 */
export async function loadClassroom(userId: string): Promise<ClassroomData | null> {
  const [groups, memberships, posts, states, courses, terms] = await Promise.all([
    readAll<Group & { id: string }>('groups'),
    readAll<GroupMember & { id: string }>('group_members'),
    readAll<ClassPost & { id: string }>('class_posts'),
    readAll<ClassPostState & { id: string }>('class_post_states'),
    readAll<Course & { id: string }>('courses'),
    readAll<Term & { id: string }>('terms'),
  ])

  const classrooms = new Map(
    groups.filter((group) => group.kind === 'classroom').map((group) => [group.id, group]),
  )

  const mine = memberships
    .filter((row) => row.user_id === userId && classrooms.has(row.group_id))
    .sort((a, b) => (b.joined_at ?? '').localeCompare(a.joined_at ?? ''))

  const currentTermId = terms.find((term) => term.is_current)?.id ?? null
  const membership =
    mine.find((row) => row.term_id === currentTermId) ?? mine[0] ?? null
  if (!membership) return null

  const group = classrooms.get(membership.group_id)!
  const term = terms.find((row) => row.id === group.term_id) ?? null

  const members = memberships
    .filter((row) => row.group_id === group.id)
    .map(toMember)
    .sort(byRoleThenName)

  const nameById = new Map(members.map((member) => [member.userId, member.name]))
  const courseById = new Map(courses.map((course) => [course.id, course.code]))

  const role = (membership.role ?? 'member') as MemberRole

  return {
    group,
    termLabel: term?.label ?? null,
    role,
    isRep: role === 'owner' || role === 'rep',
    memberCount: members.length,
    members,
    posts: posts
      .filter((post) => post.group_id === group.id)
      .map((post) => summarisePost(post, states, userId, courseById, nameById))
      .sort(byPinnedThenRecent),
  }
}

export async function loadClassPost(
  postId: string,
  userId: string,
): Promise<{ post: ClassPostSummary; group: Group; log: SubmissionEntry[] } | null> {
  const [groups, memberships, posts, states, courses] = await Promise.all([
    readAll<Group & { id: string }>('groups'),
    readAll<GroupMember & { id: string }>('group_members'),
    readAll<ClassPost & { id: string }>('class_posts'),
    readAll<ClassPostState & { id: string }>('class_post_states'),
    readAll<Course & { id: string }>('courses'),
  ])

  const row = posts.find((post) => post.id === postId)
  if (!row) return null

  const group = groups.find((entry) => entry.id === row.group_id)
  if (!group) return null

  const members = memberships.filter((entry) => entry.group_id === group.id).map(toMember)
  const nameById = new Map(members.map((member) => [member.userId, member.name]))
  const courseById = new Map(courses.map((course) => [course.id, course.code]))

  const post = summarisePost(row, states, userId, courseById, nameById)

  return {
    post,
    group,
    log: row.requires_submission ? buildSubmissionLog(members, states, postId) : [],
  }
}

/**
 * Class posts with a due date, as the tracker wants them.
 *
 * Dismissed posts are gone from the tracker and nowhere else: the shared row is
 * untouched, so dismissing is a statement about one student's list rather than
 * an edit to everyone's.
 */
export async function loadClassTrackerItems(userId: string): Promise<ClassTrackerItem[]> {
  const [groups, posts, states, courses] = await Promise.all([
    readAll<Group & { id: string }>('groups'),
    readAll<ClassPost & { id: string }>('class_posts'),
    readAll<ClassPostState & { id: string }>('class_post_states'),
    readAll<Course & { id: string }>('courses'),
  ])

  return selectTrackerItems({
    posts,
    states,
    sectionByGroup: new Map(
      groups
        .filter((group) => group.kind === 'classroom' && group.section_code)
        .map((group) => [group.id, group.section_code!]),
    ),
    courseCodeById: new Map(courses.map((course) => [course.id, course.code])),
    userId,
  })
}

/**
 * Marks this student's own state on a post.
 *
 * An upsert on the natural key rather than an update, so the same tap replayed
 * on reconnect lands on the same row. `submitted_at` is deliberately not sent —
 * a trigger sets it, because a client that could write it could backdate a
 * submission mark and the timestamp beside a name is the whole point.
 */
export async function markPostState(
  postId: string,
  userId: string,
  status: PostState,
): Promise<void> {
  await queueWrite({
    entity: 'class_post_states',
    operation: 'insert',
    payload: { post_id: postId, user_id: userId, status },
    optimistic: {
      id: `${postId}:${userId}`,
      post_id: postId,
      user_id: userId,
      status,
      submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
  })
}

// --- Network-only reads ---------------------------------------------------

export interface JoinRequest {
  id: string
  userId: string
  name: string | null
  studentNumber: string | null
  claimedSection: string | null
  message: string | null
  createdAt: string
}

/** The rep's queue. Not offline: these people are not members yet. */
export async function loadJoinRequests(groupId: string): Promise<JoinRequest[]> {
  const { data } = await supabaseBrowser()
    .from('group_join_requests')
    .select('id, user_id, claimed_full_name, claimed_student_number, claimed_section_code, message, created_at')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.claimed_full_name,
    studentNumber: row.claimed_student_number,
    claimedSection: row.claimed_section_code,
    message: row.message,
    createdAt: row.created_at,
  }))
}
