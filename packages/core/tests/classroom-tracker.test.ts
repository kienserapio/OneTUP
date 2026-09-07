import { describe, expect, it } from 'vitest'
import {
  buildSubmissionLog,
  byPinnedThenRecent,
  byRoleThenName,
  selectTrackerItems,
  summarisePost,
  toMember,
  type ClassPostSummary,
  type ClassroomMember,
} from '@onetup/core'
import type { ClassPost, ClassPostState, GroupMember } from '@onetup/core'

const GROUP = 'group-1'
const ANA = 'user-ana'
const BEN = 'user-ben'
const CY = 'user-cy'

function post(overrides: Partial<ClassPost> = {}): ClassPost {
  return {
    id: 'post-1',
    group_id: GROUP,
    author_id: ANA,
    submission_id: null,
    course_id: null,
    kind: 'task',
    title: 'Case Study 2',
    detail: null,
    due_at: '2026-09-04T13:00:00.000Z',
    requires_submission: false,
    pinned: false,
    status: 'published',
    hidden_by: null,
    edited_at: null,
    content_hash: null,
    created_at: '2026-08-29T01:00:00.000Z',
    updated_at: '2026-08-29T01:00:00.000Z',
    ...overrides,
  }
}

function state(overrides: Partial<ClassPostState> = {}): ClassPostState {
  return {
    post_id: 'post-1',
    user_id: ANA,
    status: 'open',
    submitted_at: null,
    note: null,
    reminder_offsets: null,
    updated_at: '2026-08-29T01:00:00.000Z',
    ...overrides,
  }
}

function member(overrides: Partial<GroupMember> = {}): GroupMember {
  return {
    group_id: GROUP,
    user_id: ANA,
    role: 'member',
    shares_availability: false,
    joined_at: '2026-08-01T00:00:00.000Z',
    term_id: 'term-1',
    display_name: 'Ana Reyes',
    ...overrides,
  }
}

const SECTIONS = new Map([[GROUP, 'BSCS-4B-M']])
const COURSES = new Map([['course-1', 'CS 3105']])

describe('selectTrackerItems', () => {
  it('includes a published post with a due date from a classroom you are in', () => {
    const items = selectTrackerItems({
      posts: [post()],
      states: [],
      sectionByGroup: SECTIONS,
      courseCodeById: COURSES,
      userId: BEN,
    })

    expect(items).toEqual([
      {
        id: 'post-1',
        title: 'Case Study 2',
        dueAt: '2026-09-04T13:00:00.000Z',
        courseCode: null,
        sectionCode: 'BSCS-4B-M',
        status: 'open',
      },
    ])
  })

  it('leaves out a notice, which is a post with no due date', () => {
    const items = selectTrackerItems({
      posts: [post({ due_at: null })],
      states: [],
      sectionByGroup: SECTIONS,
      courseCodeById: COURSES,
      userId: BEN,
    })
    expect(items).toEqual([])
  })

  it('leaves out a hidden post', () => {
    const items = selectTrackerItems({
      posts: [post({ status: 'hidden' })],
      states: [],
      sectionByGroup: SECTIONS,
      courseCodeById: COURSES,
      userId: BEN,
    })
    expect(items).toEqual([])
  })

  it('leaves out a post from a group that is not a classroom', () => {
    const items = selectTrackerItems({
      posts: [post({ group_id: 'some-study-group' })],
      states: [],
      sectionByGroup: SECTIONS,
      courseCodeById: COURSES,
      userId: BEN,
    })
    expect(items).toEqual([])
  })

  /**
   * The one that would be embarrassing to get wrong: dismissing takes a post
   * off *your* list. Reading someone else's dismissal as your own would quietly
   * delete a deadline you meant to keep.
   */
  it('drops a post this student dismissed, and only for them', () => {
    const states = [state({ user_id: BEN, status: 'dismissed' })]
    const common = { posts: [post()], states, sectionByGroup: SECTIONS, courseCodeById: COURSES }

    expect(selectTrackerItems({ ...common, userId: BEN })).toEqual([])
    expect(selectTrackerItems({ ...common, userId: CY })).toHaveLength(1)
  })

  it('carries this student’s own status through', () => {
    const items = selectTrackerItems({
      posts: [post()],
      states: [state({ user_id: BEN, status: 'submitted', submitted_at: '2026-08-29T02:00:00Z' })],
      sectionByGroup: SECTIONS,
      courseCodeById: COURSES,
      userId: BEN,
    })
    expect(items[0].status).toBe('submitted')
  })

  it('resolves the subject code, and tolerates one it does not have', () => {
    const known = selectTrackerItems({
      posts: [post({ course_id: 'course-1' })],
      states: [],
      sectionByGroup: SECTIONS,
      courseCodeById: COURSES,
      userId: BEN,
    })
    expect(known[0].courseCode).toBe('CS 3105')

    const unknown = selectTrackerItems({
      posts: [post({ course_id: 'course-missing' })],
      states: [],
      sectionByGroup: SECTIONS,
      courseCodeById: COURSES,
      userId: BEN,
    })
    expect(unknown[0].courseCode).toBeNull()
  })
})

describe('buildSubmissionLog', () => {
  const members: ClassroomMember[] = [
    toMember(member({ user_id: ANA, display_name: 'Ana Reyes', role: 'owner' })),
    toMember(member({ user_id: BEN, display_name: 'Ben Cruz' })),
    toMember(member({ user_id: CY, display_name: 'Cy dela Peña' })),
  ]

  it('lists every member exactly once, whether or not they have marked anything', () => {
    const log = buildSubmissionLog(members, [], 'post-1')
    expect(log.map((entry) => entry.name)).toEqual(['Ana Reyes', 'Ben Cruz', 'Cy dela Peña'])
    expect(log.every((entry) => entry.submittedAt === null)).toBe(true)
  })

  it('puts submitted first, then alphabetical, and nothing else', () => {
    const log = buildSubmissionLog(
      members,
      [
        state({ post_id: 'post-1', user_id: CY, status: 'submitted', submitted_at: '2026-08-29T05:00:00Z' }),
        state({ post_id: 'post-1', user_id: BEN, status: 'submitted', submitted_at: '2026-08-29T01:00:00Z' }),
      ],
      'post-1',
    )

    // Ben before Cy alphabetically, even though Cy marked it later — there is
    // no ordering by time, because that would rank people.
    expect(log.map((entry) => entry.name)).toEqual(['Ben Cruz', 'Cy dela Peña', 'Ana Reyes'])
  })

  it('ignores state rows belonging to another post', () => {
    const log = buildSubmissionLog(
      members,
      [state({ post_id: 'post-2', user_id: BEN, status: 'submitted', submitted_at: '2026-08-29T01:00:00Z' })],
      'post-1',
    )
    expect(log.every((entry) => entry.submittedAt === null)).toBe(true)
  })

  it('counts only a submitted mark, not done or dismissed', () => {
    const log = buildSubmissionLog(
      members,
      [
        state({ post_id: 'post-1', user_id: BEN, status: 'done' }),
        state({ post_id: 'post-1', user_id: CY, status: 'dismissed' }),
      ],
      'post-1',
    )
    expect(log.filter((entry) => entry.submittedAt).length).toBe(0)
  })
})

describe('summarisePost', () => {
  const names = new Map([[ANA, 'Ana Reyes']])

  it('defaults an untouched post to open', () => {
    const summary = summarisePost(post(), [], BEN, COURSES, names)
    expect(summary.myState).toBe('open')
    expect(summary.authorName).toBe('Ana Reyes')
  })

  it('reports a submitted count only where a log was asked for', () => {
    const states = [
      state({ user_id: ANA, status: 'submitted', submitted_at: '2026-08-29T02:00:00Z' }),
      state({ user_id: BEN, status: 'submitted', submitted_at: '2026-08-29T03:00:00Z' }),
    ]

    expect(summarisePost(post({ requires_submission: true }), states, CY, COURSES, names).submittedCount).toBe(2)
    expect(summarisePost(post({ requires_submission: false }), states, CY, COURSES, names).submittedCount).toBe(0)
  })

  it('says edited when, and only when, edited_at is set', () => {
    expect(summarisePost(post(), [], ANA, COURSES, names).edited).toBe(false)
    expect(
      summarisePost(post({ edited_at: '2026-08-29T04:00:00Z' }), [], ANA, COURSES, names).edited,
    ).toBe(true)
  })
})

describe('ordering', () => {
  it('puts the owner, then reps, then members, alphabetically inside each', () => {
    const members = [
      toMember(member({ user_id: 'z', display_name: 'Zoe', role: 'member' })),
      toMember(member({ user_id: 'a', display_name: 'Ana', role: 'member' })),
      toMember(member({ user_id: 'r', display_name: 'Rey', role: 'rep' })),
      toMember(member({ user_id: 'o', display_name: 'Owen', role: 'owner' })),
    ].sort(byRoleThenName)

    expect(members.map((m) => m.name)).toEqual(['Owen', 'Rey', 'Ana', 'Zoe'])
  })

  it('falls back to a placeholder rather than an empty name', () => {
    expect(toMember(member({ display_name: null })).name).toBe('A classmate')
    expect(toMember(member({ display_name: '   ' })).name).toBe('A classmate')
  })

  it('keeps pinned posts above the rest, newest first inside each', () => {
    const summaries = [
      { id: 'a', pinned: false, createdAt: '2026-08-01T00:00:00Z' },
      { id: 'b', pinned: true, createdAt: '2026-07-01T00:00:00Z' },
      { id: 'c', pinned: false, createdAt: '2026-08-20T00:00:00Z' },
      { id: 'd', pinned: true, createdAt: '2026-08-25T00:00:00Z' },
    ] as ClassPostSummary[]

    expect([...summaries].sort(byPinnedThenRecent).map((s) => s.id)).toEqual(['d', 'b', 'c', 'a'])
  })
})
