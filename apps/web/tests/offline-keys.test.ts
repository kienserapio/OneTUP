import { describe, expect, it } from 'vitest'
import {
  ALTERNATE_KEY,
  naturalKeyFor,
  primaryKeyOf,
  withLocalKey,
} from '../src/lib/offline/keys'

/**
 * The silent one.
 *
 * A row the local store cannot key is dropped with a console warning, and a
 * queued write aimed at a column the table does not have never lands. Neither
 * failure surfaces at the time — the student finds out days later that a tap
 * they remember making did not save. These are the two tables where that
 * applies, so they get assertions rather than trust.
 */

describe('withLocalKey', () => {
  it('leaves a row that already has an id alone', () => {
    const row = { id: 'abc', title: 'A deadline' }
    expect(withLocalKey('deadlines', row)).toBe(row)
  })

  it('keys user_preferences on its single alternate column', () => {
    expect(withLocalKey('user_preferences', { user_id: 'u1' })).toEqual({
      user_id: 'u1',
      id: 'u1',
    })
  })

  it('joins a composite key so class_post_states is storable at all', () => {
    expect(withLocalKey('class_post_states', { post_id: 'p1', user_id: 'u1', status: 'submitted' })).toEqual(
      { post_id: 'p1', user_id: 'u1', status: 'submitted', id: 'p1:u1' },
    )
  })

  it('does the same for group_members, which also has no id column', () => {
    expect(withLocalKey('group_members', { group_id: 'g1', user_id: 'u1' })?.id).toBe('g1:u1')
  })

  it('gives two students on one post two different local keys', () => {
    const ana = withLocalKey('class_post_states', { post_id: 'p1', user_id: 'ana' })
    const ben = withLocalKey('class_post_states', { post_id: 'p1', user_id: 'ben' })
    expect(ana?.id).not.toBe(ben?.id)
  })

  it('gives one student on two posts two different local keys', () => {
    const first = withLocalKey('class_post_states', { post_id: 'p1', user_id: 'ana' })
    const second = withLocalKey('class_post_states', { post_id: 'p2', user_id: 'ana' })
    expect(first?.id).not.toBe(second?.id)
  })

  it('returns null rather than a half-formed key when part of it is missing', () => {
    expect(withLocalKey('class_post_states', { post_id: 'p1' })).toBeNull()
    expect(withLocalKey('user_preferences', {})).toBeNull()
    expect(withLocalKey('deadlines', { title: 'no id anywhere' })).toBeNull()
  })
})

describe('primaryKeyOf', () => {
  it('defaults to id', () => {
    expect(primaryKeyOf('deadlines')).toBe('id')
    expect(primaryKeyOf('class_posts')).toBe('id')
  })

  it('knows the two tables that are keyed on something else', () => {
    expect(primaryKeyOf('user_preferences')).toBe('user_id')
    expect(primaryKeyOf('class_post_states')).toBe('post_id')
  })
})

describe('naturalKeyFor', () => {
  /**
   * Without this, every offline "I've submitted" replayed on reconnect tries to
   * insert a duplicate primary key and fails — the exact write the classroom
   * feature exists to make reliable.
   */
  it('gives class_post_states its composite conflict target', () => {
    expect(naturalKeyFor('class_post_states')).toBe('post_id,user_id')
  })

  it('keeps the existing tables unchanged', () => {
    expect(naturalKeyFor('attendance_records')).toBe(
      'user_id,enrollment_id,session_date,block_id',
    )
    expect(naturalKeyFor('grades')).toBe('user_id,enrollment_id')
    expect(naturalKeyFor('user_preferences')).toBe('user_id')
  })

  it('is undefined for a table with a plain id, so an upsert stays an insert', () => {
    expect(naturalKeyFor('deadlines')).toBeUndefined()
    expect(naturalKeyFor('class_posts')).toBeUndefined()
  })

  /* Every entity with a composite local key needs a conflict target too, or a
   * queued write for it replays into a duplicate-key error. */
  it('covers every composite-keyed entity', () => {
    for (const [entity, key] of Object.entries(ALTERNATE_KEY)) {
      if (Array.isArray(key)) {
        expect(naturalKeyFor(entity as Parameters<typeof naturalKeyFor>[0]) ?? '').not.toBe('')
      }
    }
  })
})
