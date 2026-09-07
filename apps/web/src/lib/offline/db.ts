'use client'

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { withLocalKey } from './keys'

/**
 * The local store.
 *
 * IndexedDB is the primary read source, not a cache in front of one — the app
 * renders from here first, always, and revalidates against Supabase in the
 * background. That is what makes a student standing in a concrete corridor see
 * their next class instantly rather than a spinner (ADR-005).
 *
 * The offline set is fixed and deliberate. Announcements older than fourteen
 * days, study pack *contents* — the source chunks and the practice questions —
 * and assistant history are excluded: they are not what a student needs while
 * walking between buildings, and keeping them would bloat the store on the
 * mid-range phones this is designed for.
 *
 * Flashcards are the exception, and they were on the wrong side of that line
 * until Study shipped. A commute is the single best time to review cards and
 * the single worst time for signal, and a pack's cards are small text rows —
 * they are the point, not the bloat. So `study_packs` and `flashcards` are in;
 * `study_chunks`, `practice_questions` and `study_sessions` stay out.
 * `flashcard_reviews` is queued and never read back, which is what an
 * append-only table needs and no more.
 */

export type EntityName =
  | 'schedule_blocks'
  | 'enrollments'
  | 'courses'
  | 'deadlines'
  | 'deadline_subtasks'
  | 'attendance_records'
  | 'grades'
  | 'grade_components'
  | 'commute_routes'
  | 'commute_legs'
  | 'campus_places'
  | 'departure_plans'
  | 'announcements'
  | 'user_preferences'
  | 'user_thresholds'
  | 'terms'
  | 'groups'
  | 'group_members'
  | 'class_posts'
  | 'class_post_states'
  | 'study_packs'
  | 'flashcards'
  | 'suspension_advisories'
  /* Queued, never pulled. It is append-only, so it needs no local copy and no
   * conflict target — but a mutation's entity must name a real table, and this
   * is the one the review write lands in. */
  | 'flashcard_reviews'

export interface StoredRecord {
  id: string
  /** Server timestamp, used for last-write-wins comparison. */
  updated_at?: string | null
  [key: string]: unknown
}

export interface Mutation {
  id: string
  entity: EntityName
  operation: 'insert' | 'update' | 'delete'
  payload: Record<string, unknown>
  /** Client clock at the moment of the optimistic write. */
  clientTs: number
  attempts: number
  lastError?: string
  nextAttemptAt: number
}

export interface SyncMeta {
  key: string
  value: unknown
  updatedAt: number
}

export interface Conflict {
  id: string
  entity: EntityName
  recordId: string
  field: string
  localValue: unknown
  serverValue: unknown
  detectedAt: number
}

interface OneTupDB extends DBSchema {
  records: {
    key: [string, string]
    value: StoredRecord & { __entity: EntityName }
    indexes: { by_entity: string }
  }
  mutations: {
    key: string
    value: Mutation
    indexes: { by_next_attempt: number }
  }
  meta: { key: string; value: SyncMeta }
  conflicts: { key: string; value: Conflict }
}

const DB_NAME = 'onetup'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<OneTupDB>> | null = null

export function localDb(): Promise<IDBPDatabase<OneTupDB>> {
  dbPromise ??= openDB<OneTupDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const records = db.createObjectStore('records', { keyPath: ['__entity', 'id'] })
      records.createIndex('by_entity', '__entity')

      const mutations = db.createObjectStore('mutations', { keyPath: 'id' })
      mutations.createIndex('by_next_attempt', 'nextAttemptAt')

      db.createObjectStore('meta', { keyPath: 'key' })
      db.createObjectStore('conflicts', { keyPath: 'id' })
    },
  })
  return dbPromise
}

// --- Reads ---------------------------------------------------------------

export async function readAll<T extends StoredRecord>(entity: EntityName): Promise<T[]> {
  const db = await localDb()
  const rows = await db.getAllFromIndex('records', 'by_entity', entity)
  return rows.map(stripInternal) as T[]
}

export async function readOne<T extends StoredRecord>(
  entity: EntityName,
  id: string,
): Promise<T | null> {
  const db = await localDb()
  const row = await db.get('records', [entity, id])
  return row ? (stripInternal(row) as T) : null
}

function stripInternal(row: StoredRecord & { __entity: EntityName }): StoredRecord {
  const { __entity, ...rest } = row
  void __entity
  return rest
}

// --- Writes --------------------------------------------------------------

/*
 * Key derivation lives in `./keys`, shared with the sync engine so the local
 * store and the queued write can never disagree about what identifies a row.
 */

function keyed(entity: EntityName, records: readonly StoredRecord[]): StoredRecord[] {
  return records
    .map((record) => withLocalKey(entity, record))
    .filter((record): record is StoredRecord => record !== null)
}

export async function putRecords(
  entity: EntityName,
  records: readonly StoredRecord[],
): Promise<void> {
  if (records.length === 0) return
  const db = await localDb()
  const tx = db.transaction('records', 'readwrite')
  await Promise.all([
    ...keyed(entity, records).map((record) => tx.store.put({ ...record, __entity: entity })),
    tx.done,
  ])
}

export async function putRecord(entity: EntityName, record: StoredRecord): Promise<void> {
  const stored = withLocalKey(entity, record)
  if (!stored) return
  const db = await localDb()
  await db.put('records', { ...stored, __entity: entity })
}

export async function deleteRecord(entity: EntityName, id: string): Promise<void> {
  const db = await localDb()
  await db.delete('records', [entity, id])
}

/**
 * Replaces an entity's whole set. Used after a successful full sync, so rows
 * deleted on another device disappear here too rather than lingering forever.
 */
export async function replaceEntity(
  entity: EntityName,
  records: readonly StoredRecord[],
): Promise<void> {
  const rows = keyed(entity, records)
  const db = await localDb()

  // Reading the existing keys happens in its own transaction. An IndexedDB
  // transaction commits as soon as the microtask queue drains with no pending
  // request, so awaiting a read and then issuing writes on the same handle is
  // a race that fails intermittently under load.
  const existing = await db.getAllKeysFromIndex('records', 'by_entity', entity)

  const tx = db.transaction('records', 'readwrite')
  try {
    await Promise.all([
      ...existing.map((key) => tx.store.delete(key)),
      ...rows.map((record) => tx.store.put({ ...record, __entity: entity })),
      tx.done,
    ])
  } catch (cause) {
    tx.abort()
    throw new Error(
      `Could not cache ${entity} (${rows.length} rows): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

// --- Mutation queue ------------------------------------------------------

export async function enqueue(
  mutation: Omit<Mutation, 'id' | 'attempts' | 'nextAttemptAt'>,
): Promise<string> {
  const db = await localDb()
  const id = crypto.randomUUID()
  await db.put('mutations', { ...mutation, id, attempts: 0, nextAttemptAt: Date.now() })
  return id
}

export async function pendingMutations(now = Date.now()): Promise<Mutation[]> {
  const db = await localDb()
  const all = await db.getAll('mutations')
  return all
    .filter((m) => m.nextAttemptAt <= now)
    .sort((a, b) => a.clientTs - b.clientTs)
}

export async function queueDepth(): Promise<number> {
  const db = await localDb()
  return db.count('mutations')
}

export async function resolveMutation(id: string): Promise<void> {
  const db = await localDb()
  await db.delete('mutations', id)
}

export async function failMutation(id: string, error: string, backoffMs: number): Promise<void> {
  const db = await localDb()
  const mutation = await db.get('mutations', id)
  if (!mutation) return
  await db.put('mutations', {
    ...mutation,
    attempts: mutation.attempts + 1,
    lastError: error,
    nextAttemptAt: Date.now() + backoffMs,
  })
}

// --- Conflicts -----------------------------------------------------------

export async function recordConflict(conflict: Omit<Conflict, 'id' | 'detectedAt'>): Promise<void> {
  const db = await localDb()
  await db.put('conflicts', {
    ...conflict,
    id: crypto.randomUUID(),
    detectedAt: Date.now(),
  })
}

export async function openConflicts(): Promise<Conflict[]> {
  const db = await localDb()
  return db.getAll('conflicts')
}

export async function dismissConflict(id: string): Promise<void> {
  const db = await localDb()
  await db.delete('conflicts', id)
}

// --- Metadata ------------------------------------------------------------

export async function getMeta<T>(key: string): Promise<T | null> {
  const db = await localDb()
  const row = await db.get('meta', key)
  return row ? (row.value as T) : null
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await localDb()
  await db.put('meta', { key, value, updatedAt: Date.now() })
}

/**
 * Clears everything. Used on sign-out — including any device-side ERS
 * credential entry, which must not survive a student handing their phone over.
 */
export async function clearLocalData(): Promise<void> {
  const db = await localDb()
  await Promise.all(
    (['records', 'mutations', 'meta', 'conflicts'] as const).map((store) => db.clear(store)),
  )
}
