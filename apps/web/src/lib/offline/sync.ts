'use client'

import { supabaseBrowser } from '../supabase/client'
import { naturalKeyFor, primaryKeyOf } from './keys'
import { singleFlight } from './single-flight'
import {
  type EntityName,
  type Mutation,
  type StoredRecord,
  enqueue,
  failMutation,
  getMeta,
  pendingMutations,
  putRecord,
  recordConflict,
  replaceEntity,
  resolveMutation,
  setMeta,
} from './db'

/**
 * The sync engine.
 *
 * Read path: local first, always. Render, then revalidate in the background.
 * Write path: apply locally, enqueue, flush, retry with backoff.
 *
 * Conflicts resolve last-write-wins per field. That is acceptable because
 * nearly every write is single-device and single-user — but grades and
 * deadlines are surfaced to the student instead of resolved silently, because
 * a quietly overwritten grade is the kind of wrong number that changes a
 * decision (TDD §2.3).
 */

const BACKOFF_BASE_MS = 2000
const BACKOFF_CAP_MS = 5 * 60_000
const MAX_ATTEMPTS = 10

/** Entities where a silent overwrite would be harmful. */
const SURFACE_CONFLICTS: ReadonlySet<EntityName> = new Set(['grades', 'deadlines'])

export function backoffFor(attempts: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempts)
}

// --- Pull ----------------------------------------------------------------

interface PullSpec {
  entity: EntityName
  table: EntityName
  select?: string
  /** Rows outside this filter are not part of the offline set. */
  filter?: (query: PostgrestQuery) => PostgrestQuery
}

type PostgrestQuery = {
  gte: (column: string, value: string) => PostgrestQuery
  eq: (column: string, value: string) => PostgrestQuery
  order: (column: string, options?: { ascending?: boolean }) => PostgrestQuery
  limit: (count: number) => PostgrestQuery
}

/**
 * The sync engine is generic over every entity in the offline set, so the
 * per-table result types the client infers are noise here — the rows go into
 * IndexedDB as plain records either way. This is the one place that erasure
 * happens, rather than an `any` scattered through each call site.
 */
type LooseTable = {
  select: (columns?: string) => PostgrestQuery
  insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
  upsert: (
    values: Record<string, unknown>,
    options?: { onConflict?: string },
  ) => Promise<{ error: { message: string } | null }>
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
  }
  delete: () => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
  }
}

function table(client: SupabaseClient, name: EntityName): LooseTable {
  return client.from(name) as unknown as LooseTable
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

/**
 * The offline set (TDD §2.2). Everything here must be readable with no network.
 */
export const OFFLINE_SET: PullSpec[] = [
  { entity: 'user_preferences', table: 'user_preferences' },
  { entity: 'user_thresholds', table: 'user_thresholds' },
  { entity: 'courses', table: 'courses' },
  // Reference, and tiny. It is here because the catch-up window has to know
  // when the term began: without it, backfilling four weeks invents classes
  // for dates that fell in the semestral break.
  { entity: 'terms', table: 'terms' },
  { entity: 'enrollments', table: 'enrollments' },
  { entity: 'schedule_blocks', table: 'schedule_blocks' },
  { entity: 'grades', table: 'grades' },
  { entity: 'grade_components', table: 'grade_components' },
  {
    entity: 'attendance_records',
    table: 'attendance_records',
    filter: (q) => q.gte('session_date', daysAgo(180).slice(0, 10)),
  },
  {
    entity: 'deadlines',
    table: 'deadlines',
    filter: (q) => q.gte('due_at', daysAgo(30)),
  },
  { entity: 'deadline_subtasks', table: 'deadline_subtasks' },
  { entity: 'departure_plans', table: 'departure_plans', filter: (q) => q.gte('plan_date', daysAgo(1).slice(0, 10)) },
  { entity: 'campus_places', table: 'campus_places' },
  { entity: 'commute_routes', table: 'commute_routes' },
  { entity: 'commute_legs', table: 'commute_legs' },
  {
    entity: 'announcements',
    table: 'announcements',
    filter: (q) => q.gte('created_at', daysAgo(14)),
  },
  /* The classroom. Small — a term of posts for one section is tens of rows —
   * and read-only offline apart from a student's own state. `groups` is here
   * because the section badge in Deadlines reads `section_code` from it, and a
   * badge that disappears without signal is worse than no badge. */
  { entity: 'groups', table: 'groups' },
  { entity: 'group_members', table: 'group_members' },
  {
    entity: 'class_posts',
    table: 'class_posts',
    filter: (q) => q.gte('created_at', daysAgo(60)),
  },
  { entity: 'class_post_states', table: 'class_post_states' },
  /* Study. The cards are here for the commute — the one place a student has
   * twenty spare minutes and no signal — and the packs come with them so a card
   * can say which pack it belongs to without a second lookup. `flashcard_reviews`
   * is deliberately absent: it is written, never read. */
  { entity: 'study_packs', table: 'study_packs' },
  { entity: 'flashcards', table: 'flashcards' },
  /* Reference, and tiny. It is offline for the obvious reason: the day a
   * suspension is announced is a typhoon day, and a typhoon day is when the
   * signal is worst. A week is plenty — the card only ever renders for today. */
  {
    entity: 'suspension_advisories',
    table: 'suspension_advisories',
    filter: (q) => q.gte('effective_on', daysAgo(7).slice(0, 10)),
  },
]

export interface SyncResult {
  pulled: number
  pushed: number
  failed: number
  conflicts: number
  at: number
}

export async function pullAll(): Promise<number> {
  const supabase = supabaseBrowser()
  let total = 0

  for (const spec of OFFLINE_SET) {
    // Each entity is isolated: one table failing — a missing grant, a schema
    // drift, a row the local store cannot key — must not blank the rest of the
    // offline set and leave a student staring at an empty app.
    try {
      let query = table(supabase, spec.table).select(spec.select ?? '*')
      if (spec.filter) query = spec.filter(query)

      const { data, error } = (await query) as unknown as {
        data: StoredRecord[] | null
        error: { message: string } | null
      }

      if (error || !data) {
        if (error) console.warn(`onetup: could not pull ${spec.entity} — ${error.message}`)
        continue
      }

      await replaceEntity(spec.entity, data)
      total += data.length
    } catch (cause) {
      console.warn(`onetup: could not cache ${spec.entity}`, cause)
    }
  }

  await setMeta('lastPullAt', Date.now())
  return total
}

// --- Push ----------------------------------------------------------------

export interface QueueWriteOptions {
  entity: EntityName
  operation: Mutation['operation']
  payload: Record<string, unknown>
  /** The record as it should appear locally, applied before the flush. */
  optimistic?: StoredRecord
}

/**
 * Applies a write locally, enqueues it, and tries to flush. The caller gets an
 * instantly updated UI whether or not there is a network.
 */
export async function queueWrite(options: QueueWriteOptions): Promise<string> {
  if (options.optimistic) {
    await putRecord(options.entity, options.optimistic)
  }

  const id = await enqueue({
    entity: options.entity,
    operation: options.operation,
    payload: options.payload,
    clientTs: Date.now(),
  })

  void flush()
  return id
}

function emptyResult(): SyncResult {
  return { pulled: 0, pushed: 0, failed: 0, conflicts: 0, at: Date.now() }
}

/**
 * One flush at a time, and one more if anything was queued during it.
 *
 * The deferral is the part that matters. A flush reads the mutation queue once,
 * at the start, so anything enqueued after that read is invisible to it. A
 * guard that simply *drops* a concurrent call therefore does not mean "already
 * handled" — it means "your write waits for the next trigger", which here is up
 * to fifteen minutes.
 *
 * That was a real bug, found by reviewing one flashcard. A review is two queued
 * writes in immediate succession — the history row and the SM-2 state — and
 * only the first reached the server. The student saw it save, because locally
 * it had; their other device disagreed. See `single-flight.ts`.
 */
const runFlush = singleFlight(async (): Promise<SyncResult> => {
  const result = emptyResult()
  const supabase = supabaseBrowser()
  const queue = await pendingMutations()

  for (const mutation of queue) {
    if (mutation.attempts >= MAX_ATTEMPTS) {
      // Keep the local value and let the student retry by hand. Dropping it
      // silently would lose data they believe they recorded.
      result.failed += 1
      continue
    }

    try {
      const conflict = await applyMutation(supabase, mutation)
      if (conflict) result.conflicts += 1
      await resolveMutation(mutation.id)
      result.pushed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await failMutation(mutation.id, message, backoffFor(mutation.attempts))
      result.failed += 1
    }
  }

  await setMeta('lastFlushAt', result.at)
  return result
}, emptyResult)

export async function flush(): Promise<SyncResult> {
  /* Offline is checked here rather than inside the gated job, so being offline
   * never occupies the gate or schedules a pointless re-run. */
  if (typeof navigator !== 'undefined' && !navigator.onLine) return emptyResult()
  return runFlush()
}

type SupabaseClient = ReturnType<typeof supabaseBrowser>

/**
 * Sends one mutation. Returns true when a conflict was recorded for the
 * student to look at.
 */
async function applyMutation(supabase: SupabaseClient, mutation: Mutation): Promise<boolean> {
  const target = table(supabase, mutation.entity)

  if (mutation.operation === 'delete') {
    const { error } = await target
      .delete()
      .eq(primaryKeyOf(mutation.entity), mutation.payload[primaryKeyOf(mutation.entity)] as string)
    if (error) throw new Error(error.message)
    return false
  }

  if (mutation.operation === 'insert') {
    const { error } = await target.upsert(mutation.payload, {
      // Attendance carries a natural key, so a queued write replayed twice on
      // reconnect updates the same row rather than duplicating it.
      onConflict: naturalKeyFor(mutation.entity),
    })
    if (error) throw new Error(error.message)
    return false
  }

  // Update. Read the server row first so a genuinely newer value can be kept.
  //
  // Not every table is keyed on `id` — `user_preferences` is one row per student
  // keyed on `user_id` — so the column is looked up rather than assumed. Getting
  // this wrong is silent: `.eq('id', undefined)` matches nothing and the write
  // simply never lands.
  const keyColumn = primaryKeyOf(mutation.entity)
  const id = mutation.payload[keyColumn] as string
  if (!id) throw new Error(`Cannot update ${mutation.entity}: payload has no ${keyColumn}`)

  const { data } = (await target.select('*').eq(keyColumn, id)) as unknown as {
    data: StoredRecord[] | null
  }
  const serverRow = data?.[0] ?? null

  let conflicted = false
  if (serverRow && typeof serverRow === 'object') {
    const serverUpdated = Date.parse((serverRow as StoredRecord).updated_at ?? '')
    if (Number.isFinite(serverUpdated) && serverUpdated > mutation.clientTs) {
      for (const [field, localValue] of Object.entries(mutation.payload)) {
        if (field === 'id') continue
        const serverValue = (serverRow as StoredRecord)[field]
        if (serverValue === localValue) continue

        if (SURFACE_CONFLICTS.has(mutation.entity)) {
          await recordConflict({
            entity: mutation.entity,
            recordId: id,
            field,
            localValue,
            serverValue,
          })
          conflicted = true
        }
      }

      if (conflicted) {
        // The server value wins; the student decides what to do about it.
        await putRecord(mutation.entity, serverRow as StoredRecord)
        return true
      }
    }
  }

  const { error } = await target.update(mutation.payload).eq(keyColumn, id)
  if (error) throw new Error(error.message)
  return false
}

// --- Triggers ------------------------------------------------------------

const FOREGROUND_INTERVAL_MS = 15 * 60_000
let intervalHandle: ReturnType<typeof setInterval> | null = null

/**
 * Wires the sync triggers: app foreground, network reconnect, and a quiet
 * fifteen-minute interval while the app is actually in front of the student.
 * Nothing polls in the background — battery on a mid-range phone matters more
 * than freshness the student is not looking at.
 */
export function startSync(): () => void {
  if (typeof window === 'undefined') return () => {}

  const onOnline = () => void syncNow()
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  intervalHandle = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, FOREGROUND_INTERVAL_MS)

  void syncNow()

  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    if (intervalHandle) clearInterval(intervalHandle)
    intervalHandle = null
  }
}

export async function syncNow(): Promise<SyncResult> {
  const pushResult = await flush()
  const pulled = await pullAll()
  return { ...pushResult, pulled }
}

export async function lastSyncAt(): Promise<number | null> {
  return getMeta<number>('lastPullAt')
}
