import type { EntityName, StoredRecord } from './db'

/**
 * How each entity is keyed — locally, and on the way back to the server.
 *
 * This is one small file rather than two constants buried in `db.ts` and
 * `sync.ts` because getting it wrong is silent. A row with no usable key is
 * dropped from the offline store with a console warning nobody reads, and a
 * queued write aimed at a column the table does not have simply never lands.
 * The failure looks like "it didn't save", days later, on the write students
 * make most (12-CLASSROOMS-PLAN.md §10).
 */

/**
 * Tables whose primary key is not `id`.
 *
 * A single column name is used verbatim; a list is joined with `:` into a
 * synthetic local key. That synthetic value never leaves the local store — a
 * queued write carries its own payload with the real columns in it.
 */
export const ALTERNATE_KEY: Partial<Record<EntityName, string | readonly string[]>> = {
  user_preferences: 'user_id',
  group_members: ['group_id', 'user_id'],
  class_post_states: ['post_id', 'user_id'],
}

/**
 * A row as the server hands it over, where `id` may genuinely be absent.
 *
 * `StoredRecord` requires one because everything already in the local store has
 * one — but a `class_post_states` or `group_members` row arrives without any,
 * which is the whole reason this module exists.
 */
export interface UnkeyedRecord {
  id?: string
  updated_at?: string | null
  [key: string]: unknown
}

/** The record as the local store needs it, or null when it cannot be keyed. */
export function withLocalKey(entity: EntityName, record: UnkeyedRecord): StoredRecord | null {
  if (typeof record.id === 'string' && record.id) return record as StoredRecord

  const alternate = ALTERNATE_KEY[entity]
  if (typeof alternate === 'string') {
    const value = record[alternate]
    if (typeof value === 'string' && value) return { ...record, id: value } as StoredRecord
    return null
  }

  if (alternate) {
    const parts = alternate.map((column) => record[column])
    if (parts.every((part) => typeof part === 'string' && part)) {
      return { ...record, id: parts.join(':') } as StoredRecord
    }
  }

  return null
}

/**
 * The column an update targets. Everything not listed is keyed on `id`.
 *
 * `class_post_states` has a composite primary key and this returns only the
 * first half of it. That is safe rather than sloppy for one specific reason:
 * `states_all_own` restricts every write on that table to the caller's own
 * rows, so `.eq('post_id', …)` can only ever reach the one row that is theirs.
 */
export function primaryKeyOf(entity: EntityName): string {
  if (entity === 'user_preferences') return 'user_id'
  if (entity === 'class_post_states') return 'post_id'
  return 'id'
}

/**
 * The conflict target for an upsert, so a queued write replayed on reconnect
 * updates the same row rather than duplicating it or failing on a primary key.
 */
export function naturalKeyFor(entity: EntityName): string | undefined {
  switch (entity) {
    case 'attendance_records':
      return 'user_id,enrollment_id,session_date,block_id'
    case 'grades':
      return 'user_id,enrollment_id'
    case 'user_preferences':
      return 'user_id'
    /* The highest-value offline write in the classroom: a student taps
     * "I've submitted" walking out of a room with no signal. */
    case 'class_post_states':
      return 'post_id,user_id'
    /* Nothing queues a membership write today — joining goes through a route
     * and leaving is a direct delete — but a composite key with no conflict
     * target is a trap set for whoever adds one, and it costs a line to
     * disarm. */
    case 'group_members':
      return 'group_id,user_id'
    default:
      return undefined
  }
}
