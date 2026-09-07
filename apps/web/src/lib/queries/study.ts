'use client'

import {
  type DueCard,
  type Enrollment,
  type Course,
  type Deadline,
  type Flashcard,
  type StudyPack,
  initialCardState,
  manilaDate,
  orderReviewQueue,
} from '@onetup/core'
import { deleteRecord, getMeta, readAll, setMeta } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { currentUserId } from '@/lib/queries/classroom'

/**
 * The study data layer.
 *
 * Packs and cards are read from the local store, because a commute is the
 * single best time to review flashcards and the single worst time for signal
 * (16-NEXT-EIGHT.md §4.4). Chunks and practice questions are deliberately not
 * here — those are the bloat the exclusion comment in `db.ts` is about.
 *
 * **The review queue is computed, never stored.** `due_on` is a column; the
 * order cards are shown in is not. `orderReviewQueue` runs per render against
 * whatever is due today, the same way `deadlines/urgency` recomputes its bands
 * (ADR-007). A stored queue is a queue that is wrong the moment a review lands.
 *
 * **Every write here is queued, not posted.** Packs, cards and reviews are
 * ordinary rows a student owns, with no dedupe to run, no rate limit to meter
 * and no privilege to check — exactly like `deadlines`, which is written the
 * same way. So they go through the mutation queue and there is no
 * `app/api/study` at all. `16-NEXT-EIGHT.md` §4.5 planned five routes; the
 * house idiom for a user-owned row turned out to be the better answer, and it
 * has the property this feature actually needs: a card can be added, edited and
 * reviewed on a train.
 */

export interface PackSummary {
  id: string
  title: string
  status: StudyPack['status']
  /** The subject this pack is attached to, when it is attached to one. */
  courseCode: string | null
  courseTitle: string | null
  enrollmentId: string | null
  cardCount: number
  dueCount: number
  /** The nearest deadline on the linked subject, if it is inside the horizon. */
  compressingUntil: string | null
  createdAt: string
}

export interface ReviewCard {
  id: string
  packId: string
  packTitle: string
  front: string
  back: string
  easeFactor: number
  intervalDays: number
  repetitions: number
  lapses: number
  dueOn: string
  /**
   * The compression context this card's pack is under, carried on the card so
   * the review screen can schedule offline without a second pass over the
   * store. Null when the pack has no deadline inside the horizon.
   */
  daysUntilDeadline: number | null
  cardsInPack: number
}

export interface StudyData {
  packs: PackSummary[]
  dueToday: number
  totalCards: number
  /** Consecutive days ending today with at least one review. */
  streak: number
}

export interface PackDetail {
  pack: StudyPack
  courseCode: string | null
  cards: Flashcard[]
  dueCount: number
  /** The deadline intervals are being compressed toward, if any. */
  compressingUntil: string | null
}

/** The window `compressForDeadline` operates in. Mirrors its `horizonDays`. */
const DEADLINE_HORIZON_DAYS = 7

// --- Reads ---------------------------------------------------------------

export async function loadStudy(now = new Date()): Promise<StudyData> {
  const today = manilaDate(now)
  const [packs, cards, enrollments, courses, deadlines] = await Promise.all([
    readAll<StudyPack & { id: string }>('study_packs'),
    readAll<Flashcard & { id: string }>('flashcards'),
    readAll<Enrollment & { id: string }>('enrollments'),
    readAll<Course & { id: string }>('courses'),
    readAll<Deadline & { id: string }>('deadlines'),
  ])

  const courseOf = subjectLookup(enrollments, courses)
  const byPack = groupBy(cards, (card) => card.pack_id)

  const summaries: PackSummary[] = packs
    .map((pack) => {
      const packCards = byPack.get(pack.id) ?? []
      const subject = pack.enrollment_id ? courseOf.get(pack.enrollment_id) : undefined
      return {
        id: pack.id,
        title: pack.title,
        status: pack.status,
        courseCode: subject?.code ?? null,
        courseTitle: subject?.title ?? null,
        enrollmentId: pack.enrollment_id,
        cardCount: packCards.length,
        dueCount: packCards.filter((card) => card.due_on <= today).length,
        compressingUntil: nearestDeadline(deadlines, pack.enrollment_id, today),
        createdAt: pack.created_at,
      }
    })
    .sort(byDueThenRecent)

  return {
    packs: summaries,
    dueToday: cards.filter((card) => card.due_on <= today).length,
    totalCards: cards.length,
    streak: await readStreak(today),
  }
}

// --- The streak ----------------------------------------------------------

/**
 * Consecutive days ending today on which at least one card was reviewed.
 *
 * This is kept in local metadata rather than derived from `flashcard_reviews`,
 * because that table is queued and never pulled back — it is append-only, and
 * giving it a local copy purely to count days would put the review history of
 * every card a student has ever made onto their phone.
 *
 * The consequence is honest and worth stating: the streak lives on the device.
 * A student who reviews on a laptop and then opens their phone sees the phone's
 * streak. That is a smaller lie than a number that claims to be authoritative
 * and is not, and it costs nothing on the write path.
 */
interface StreakState {
  lastDate: string
  days: number
}

const STREAK_KEY = 'study.streak'

export async function readStreak(today: string): Promise<number> {
  const state = await getMeta<StreakState>(STREAK_KEY)
  if (!state) return 0
  /* A streak is only alive if it reaches today or yesterday. Anything older
   * has been broken, and showing the stale number would tell a student they
   * are on a run they have already lost. */
  const gap = daysBetween(state.lastDate, today)
  return gap === 0 || gap === 1 ? state.days : 0
}

/** Called once per review. Idempotent within a day. */
export async function recordReviewDay(today: string): Promise<number> {
  const state = await getMeta<StreakState>(STREAK_KEY)
  const gap = state === null ? null : daysBetween(state.lastDate, today)

  let days: number
  if (state === null || gap === null || gap > 1 || gap < 0) days = 1
  else if (gap === 0) days = state.days
  else days = state.days + 1

  await setMeta(STREAK_KEY, { lastDate: today, days } satisfies StreakState)
  return days
}

export async function loadPack(packId: string, now = new Date()): Promise<PackDetail | null> {
  const today = manilaDate(now)
  const [packs, cards, enrollments, courses, deadlines] = await Promise.all([
    readAll<StudyPack & { id: string }>('study_packs'),
    readAll<Flashcard & { id: string }>('flashcards'),
    readAll<Enrollment & { id: string }>('enrollments'),
    readAll<Course & { id: string }>('courses'),
    readAll<Deadline & { id: string }>('deadlines'),
  ])

  const pack = packs.find((entry) => entry.id === packId)
  if (!pack) return null

  const packCards = cards
    .filter((card) => card.pack_id === packId)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))

  const subject = pack.enrollment_id ? subjectLookup(enrollments, courses).get(pack.enrollment_id) : undefined

  return {
    pack,
    courseCode: subject?.code ?? null,
    cards: packCards,
    dueCount: packCards.filter((card) => card.due_on <= today).length,
    compressingUntil: nearestDeadline(deadlines, pack.enrollment_id, today),
  }
}

/**
 * Everything due today, across every pack, in the order to show it.
 *
 * The ordering is `orderReviewQueue`'s: most overdue first, then the cards this
 * student has lapsed on most, then the shortest intervals — struggling cards
 * while attention is still fresh.
 *
 * `due_on` is a `date`, so the comparison happens against the Manila calendar
 * day the same way `attendance_records.session_date` does. Comparing in UTC
 * shifts the queue by a day for eight months of the year.
 */
export async function dueToday(now = new Date()): Promise<ReviewCard[]> {
  const today = manilaDate(now)
  const [packs, cards, deadlines] = await Promise.all([
    readAll<StudyPack & { id: string }>('study_packs'),
    readAll<Flashcard & { id: string }>('flashcards'),
    readAll<Deadline & { id: string }>('deadlines'),
  ])

  const titleOf = new Map(packs.map((pack) => [pack.id, pack.title]))
  const sizeOf = new Map<string, number>()
  for (const card of cards) sizeOf.set(card.pack_id, (sizeOf.get(card.pack_id) ?? 0) + 1)

  const compressionOf = new Map<string, number | null>(
    packs.map((pack) => {
      const deadline = nearestDeadline(deadlines, pack.enrollment_id, today)
      return [pack.id, deadline === null ? null : daysBetween(today, deadline)]
    }),
  )

  const queue = orderReviewQueue<DueCard & { card: Flashcard }>(
    cards.map((card) => ({
      id: card.id,
      dueOn: card.due_on,
      lapses: card.lapses,
      intervalDays: card.interval_days,
      card,
    })),
    today,
  )

  return queue.map(({ card }) => ({
    id: card.id,
    packId: card.pack_id,
    packTitle: titleOf.get(card.pack_id) ?? 'Study',
    front: card.front,
    back: card.back,
    easeFactor: Number(card.ease_factor),
    intervalDays: card.interval_days,
    repetitions: card.repetitions,
    lapses: card.lapses,
    dueOn: card.due_on,
    daysUntilDeadline: compressionOf.get(card.pack_id) ?? null,
    cardsInPack: sizeOf.get(card.pack_id) ?? 1,
  }))
}

// --- Helpers -------------------------------------------------------------

interface Subject {
  code: string
  title: string | null
}

function subjectLookup(
  enrollments: readonly Enrollment[],
  courses: readonly Course[],
): Map<string, Subject> {
  const byCourse = new Map(courses.map((course) => [course.id, course]))
  const out = new Map<string, Subject>()
  for (const enrollment of enrollments) {
    const course = byCourse.get(enrollment.course_id)
    if (course) out.set(enrollment.id, { code: course.code, title: course.title })
  }
  return out
}

/**
 * The nearest open deadline on this pack's subject, inside the compression
 * horizon. Outside it, intervals are left alone — which is why this returns
 * null rather than the date.
 */
function nearestDeadline(
  deadlines: readonly Deadline[],
  enrollmentId: string | null,
  today: string,
): string | null {
  if (!enrollmentId) return null

  const horizon = addDays(today, DEADLINE_HORIZON_DAYS)
  const upcoming = deadlines
    .filter(
      (deadline) =>
        deadline.enrollment_id === enrollmentId &&
        deadline.status === 'open' &&
        deadline.due_at !== null,
    )
    .map((deadline) => deadline.due_at!.slice(0, 10))
    .filter((date) => date >= today && date <= horizon)
    .sort()

  return upcoming[0] ?? null
}

export function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

/** Days between two calendar dates, ignoring clocks entirely. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** Packs with work waiting come first; otherwise the most recent. */
function byDueThenRecent(a: PackSummary, b: PackSummary): number {
  if ((a.dueCount > 0) !== (b.dueCount > 0)) return a.dueCount > 0 ? -1 : 1
  if (a.dueCount !== b.dueCount) return b.dueCount - a.dueCount
  return a.createdAt < b.createdAt ? 1 : -1
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = out.get(k)
    if (bucket) bucket.push(item)
    else out.set(k, [item])
  }
  return out
}

// --- Writes --------------------------------------------------------------

/**
 * A new pack. `status` goes straight to `ready`.
 *
 * The `processing` state exists for generation from an uploaded document, which
 * is a later phase. A pack a student typed themselves has nothing to wait for,
 * and a spinner over a row that is already complete is a lie about what is
 * happening.
 */
export async function createPack(input: {
  title: string
  enrollmentId: string | null
}): Promise<string | null> {
  const userId = await currentUserId()
  if (!userId) return null

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const row = {
    id,
    user_id: userId,
    title: input.title,
    enrollment_id: input.enrollmentId,
    status: 'ready' as const,
    created_at: now,
    updated_at: now,
  }

  await queueWrite({ entity: 'study_packs', operation: 'insert', payload: row, optimistic: row })
  return id
}

export async function renamePack(packId: string, title: string): Promise<void> {
  const payload = { id: packId, title }
  await queueWrite({
    entity: 'study_packs',
    operation: 'update',
    payload,
    optimistic: { ...payload, updated_at: new Date().toISOString() },
  })
}

/**
 * Deleting a pack takes its cards and their review history with it —
 * `flashcards.pack_id` and `flashcard_reviews.flashcard_id` both cascade in the
 * database. The local cards are removed here too, so the count on the list is
 * right before the delete has even reached the server.
 */
export async function deletePack(packId: string): Promise<void> {
  const cards = await readAll<Flashcard & { id: string }>('flashcards')
  for (const card of cards) {
    if (card.pack_id === packId) await deleteRecord('flashcards', card.id)
  }
  await deleteRecord('study_packs', packId)
  await queueWrite({ entity: 'study_packs', operation: 'delete', payload: { id: packId } })
}

/**
 * A new card.
 *
 * The SM-2 columns come from `initialCardState()` rather than from the table
 * defaults. They agree today, and the day somebody tunes the starting ease
 * factor they will tune it in the algorithm — a hand-written card and a
 * generated one have to start in the same place, or the two halves of a pack
 * drift apart.
 *
 * `source_chunk_id` stays null. A hand-written card has no source to check it
 * against, which is exactly why the column is nullable.
 */
export async function addCard(input: {
  packId: string
  front: string
  back: string
  now?: Date
}): Promise<string | null> {
  const userId = await currentUserId()
  if (!userId) return null

  const state = initialCardState()
  const id = crypto.randomUUID()
  const now = (input.now ?? new Date()).toISOString()

  const row = {
    id,
    user_id: userId,
    pack_id: input.packId,
    front: input.front,
    back: input.back,
    source_chunk_id: null,
    ease_factor: state.easeFactor,
    interval_days: state.intervalDays,
    repetitions: state.repetitions,
    lapses: state.lapses,
    /* Due immediately. A card written today is a card the student wants to see
     * today — waiting a day to show it for the first time is the one place
     * spaced repetition is obviously wrong about a new fact. */
    due_on: manilaDate(input.now ?? new Date()),
    created_at: now,
    updated_at: now,
  }

  await queueWrite({ entity: 'flashcards', operation: 'insert', payload: row, optimistic: row })
  return id
}

/**
 * Editing the wording deliberately leaves the SM-2 state alone. Fixing a typo
 * on the back of a card is not the same as never having learnt it, and
 * resetting the schedule for a corrected comma throws away weeks of spacing. A
 * card that has genuinely changed meaning is a new card.
 */
export async function editCard(
  cardId: string,
  changes: { front: string; back: string },
): Promise<void> {
  const payload = { id: cardId, front: changes.front, back: changes.back }
  await queueWrite({
    entity: 'flashcards',
    operation: 'update',
    payload,
    optimistic: { ...payload, updated_at: new Date().toISOString() },
  })
}

export async function deleteCard(cardId: string): Promise<void> {
  await deleteRecord('flashcards', cardId)
  await queueWrite({ entity: 'flashcards', operation: 'delete', payload: { id: cardId } })
}
