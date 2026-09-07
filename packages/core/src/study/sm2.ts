/**
 * SM-2 spaced repetition.
 *
 * Standard parameters, with one product-specific addition: when a pack is
 * linked to a deadline inside the next week, intervals compress so every card
 * is seen at least once before the date. A perfect algorithm that schedules a
 * card for the day after the exam is useless to a student.
 */

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5

export const QUALITY = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
} as const

export const MINIMUM_EASE_FACTOR = 1.3
export const DEFAULT_EASE_FACTOR = 2.5

export interface CardState {
  easeFactor: number
  intervalDays: number
  repetitions: number
  lapses: number
}

export interface ReviewOutcome extends CardState {
  /** Days from today the card is next due. */
  nextIntervalDays: number
}

export function initialCardState(): CardState {
  return {
    easeFactor: DEFAULT_EASE_FACTOR,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
  }
}

/**
 * One review.
 *
 *   q < 3  → the card was not recalled: reset the streak, see it again tomorrow
 *   q ≥ 3  → 1 day, then 6 days, then previous × ease factor
 *
 * The ease factor moves on every review and is floored at 1.3, below which
 * intervals stop growing and the card would recur forever.
 */
export function reviewCard(state: CardState, quality: ReviewQuality): ReviewOutcome {
  const easeFactor = Math.max(
    MINIMUM_EASE_FACTOR,
    state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  )

  if (quality < 3) {
    return {
      easeFactor,
      intervalDays: 1,
      repetitions: 0,
      lapses: state.lapses + 1,
      nextIntervalDays: 1,
    }
  }

  const repetitions = state.repetitions + 1
  let intervalDays: number
  if (repetitions === 1) intervalDays = 1
  else if (repetitions === 2) intervalDays = 6
  else intervalDays = Math.round(state.intervalDays * easeFactor)

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lapses: state.lapses,
    nextIntervalDays: intervalDays,
  }
}

/**
 * Compresses an interval so the card lands before a deadline.
 *
 * Cards are spread across the days remaining rather than all piled on the last
 * one, and the interval is never stretched — only shortened.
 */
export function compressForDeadline(
  intervalDays: number,
  daysUntilDeadline: number,
  cardsInPack: number,
  horizonDays = 7,
): number {
  if (daysUntilDeadline < 0 || daysUntilDeadline > horizonDays) return intervalDays
  if (daysUntilDeadline === 0) return 0

  // Every card gets at least one pass before the date; spread them evenly.
  const perDay = Math.ceil(cardsInPack / Math.max(1, daysUntilDeadline))
  const spread = Math.max(1, Math.floor(daysUntilDeadline / Math.max(1, perDay)))
  return Math.min(intervalDays, Math.min(daysUntilDeadline, spread))
}

export interface DueCard {
  id: string
  dueOn: string
  lapses: number
  intervalDays: number
}

/**
 * Ordering for a review session: most overdue first, then cards the student has
 * lapsed on most, then the shortest intervals. Struggling cards surface early
 * while attention is still fresh.
 */
export function orderReviewQueue<T extends DueCard>(cards: readonly T[], today: string): T[] {
  return [...cards]
    .filter((c) => c.dueOn <= today)
    .sort((a, b) => {
      if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1
      if (a.lapses !== b.lapses) return b.lapses - a.lapses
      return a.intervalDays - b.intervalDays
    })
}

export interface ScheduleContext {
  /**
   * Days until the pack's nearest open deadline, or null when it has none — or
   * none inside the compression horizon.
   */
  daysUntilDeadline: number | null
  cardsInPack: number
}

export interface ScheduledReview extends ReviewOutcome {
  /** The interval actually applied, after any deadline compression. */
  appliedIntervalDays: number
  /** True when the deadline pulled the interval in. Worth saying out loud. */
  compressed: boolean
}

/**
 * The whole scheduling decision for one review: the SM-2 step, then the
 * deadline compression, then what actually gets written.
 *
 * This exists so there is exactly one answer to "when does this card come
 * back". A review can be made offline — a commute is the best time to review
 * and the worst time for signal — so the queued write computes the interval on
 * the device, while an online review computes it on the server. Two
 * implementations of that arithmetic would drift, and the drift would present
 * as a card reappearing on the wrong day weeks later, which is close to
 * undebuggable.
 */
export function scheduleReview(
  state: CardState,
  quality: ReviewQuality,
  context: ScheduleContext,
): ScheduledReview {
  const outcome = reviewCard(state, quality)

  const appliedIntervalDays =
    context.daysUntilDeadline === null
      ? outcome.nextIntervalDays
      : compressForDeadline(
          outcome.nextIntervalDays,
          context.daysUntilDeadline,
          context.cardsInPack,
        )

  return {
    ...outcome,
    appliedIntervalDays,
    compressed: appliedIntervalDays < outcome.nextIntervalDays,
  }
}

/**
 * The calendar date a card next falls due.
 *
 * `flashcards.due_on` is a `date`, not a `timestamptz`, and the comparison that
 * builds tomorrow's queue happens against the student's local day the way
 * `attendance_records.session_date` does. Doing this with a local `Date` shifts
 * the queue by a day for eight months of the year, which is why it is here
 * rather than re-derived at each call site.
 */
export function dueDateAfter(today: string, intervalDays: number): string {
  const shifted = new Date(`${today}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + intervalDays)
  return shifted.toISOString().slice(0, 10)
}

/** Whole days between two calendar dates, ignoring clocks entirely. */
export function daysBetweenDates(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  )
}
