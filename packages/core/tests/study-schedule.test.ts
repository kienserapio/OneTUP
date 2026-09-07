import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EASE_FACTOR,
  MINIMUM_EASE_FACTOR,
  QUALITY,
  daysBetweenDates,
  dueDateAfter,
  initialCardState,
  orderReviewQueue,
  scheduleReview,
} from '../src/study/sm2'

/**
 * The scheduling decision, which is the one place in study packs where a
 * half-done implementation looks completely fine for weeks.
 *
 * `sm2.test.ts` covers `reviewCard` itself. These are about `scheduleReview` —
 * the function both the offline write path and any server caller go through, so
 * that "when does this card come back" has exactly one answer.
 */

const NO_DEADLINE = { daysUntilDeadline: null, cardsInPack: 0 }

describe('scheduleReview', () => {
  it('applies the plain SM-2 interval when nothing is compressing', () => {
    const outcome = scheduleReview(initialCardState(), QUALITY.good, NO_DEADLINE)

    expect(outcome.appliedIntervalDays).toBe(outcome.nextIntervalDays)
    expect(outcome.compressed).toBe(false)
    expect(outcome.repetitions).toBe(1)
    expect(outcome.appliedIntervalDays).toBe(1)
  })

  it('walks the 1 → 6 → ×ease ladder', () => {
    let state = initialCardState()

    const first = scheduleReview(state, QUALITY.good, NO_DEADLINE)
    expect(first.appliedIntervalDays).toBe(1)

    state = first
    const second = scheduleReview(state, QUALITY.good, NO_DEADLINE)
    expect(second.appliedIntervalDays).toBe(6)

    state = { ...second, intervalDays: second.appliedIntervalDays }
    const third = scheduleReview(state, QUALITY.good, NO_DEADLINE)
    expect(third.appliedIntervalDays).toBeGreaterThan(6)
  })

  /**
   * The failure this pins down: a student answers "Again", and the card comes
   * back a week later because the streak was never reset.
   */
  it('resets the streak and counts a lapse below quality 3', () => {
    const learnt = { easeFactor: 2.5, intervalDays: 30, repetitions: 5, lapses: 1 }

    const outcome = scheduleReview(learnt, QUALITY.again, NO_DEADLINE)

    expect(outcome.repetitions).toBe(0)
    expect(outcome.lapses).toBe(2)
    expect(outcome.appliedIntervalDays).toBe(1)
  })

  it('never lets the ease factor fall through its floor', () => {
    let state = { easeFactor: MINIMUM_EASE_FACTOR, intervalDays: 1, repetitions: 0, lapses: 0 }
    for (let i = 0; i < 10; i += 1) {
      state = scheduleReview(state, QUALITY.again, NO_DEADLINE)
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(MINIMUM_EASE_FACTOR)
  })

  it('starts a new card at the documented default ease', () => {
    expect(initialCardState().easeFactor).toBe(DEFAULT_EASE_FACTOR)
  })

  describe('deadline compression', () => {
    /** A well-learnt card that SM-2 would push far past the exam. */
    const wellLearnt = { easeFactor: 2.5, intervalDays: 40, repetitions: 6, lapses: 0 }

    it('pulls an interval in so the card is seen before the date', () => {
      const outcome = scheduleReview(wellLearnt, QUALITY.good, {
        daysUntilDeadline: 3,
        cardsInPack: 20,
      })

      expect(outcome.nextIntervalDays).toBeGreaterThan(3)
      expect(outcome.appliedIntervalDays).toBeLessThanOrEqual(3)
      expect(outcome.compressed).toBe(true)
    })

    /** The rule the algorithm turns on: compression shortens, never stretches. */
    it('leaves a short interval alone rather than stretching it to the deadline', () => {
      const outcome = scheduleReview(initialCardState(), QUALITY.good, {
        daysUntilDeadline: 6,
        cardsInPack: 4,
      })

      expect(outcome.appliedIntervalDays).toBeLessThanOrEqual(outcome.nextIntervalDays)
      expect(outcome.compressed).toBe(false)
    })

    it('ignores a deadline beyond the horizon', () => {
      const outcome = scheduleReview(wellLearnt, QUALITY.good, {
        daysUntilDeadline: 30,
        cardsInPack: 20,
      })

      expect(outcome.appliedIntervalDays).toBe(outcome.nextIntervalDays)
      expect(outcome.compressed).toBe(false)
    })

    it('brings everything back today once the deadline is today', () => {
      const outcome = scheduleReview(wellLearnt, QUALITY.good, {
        daysUntilDeadline: 0,
        cardsInPack: 20,
      })

      expect(outcome.appliedIntervalDays).toBe(0)
    })
  })
})

/**
 * `flashcards.due_on` is a `date`. Every one of these would pass and every one
 * would be wrong by a day if the arithmetic went through a local `Date`.
 */
describe('dueDateAfter', () => {
  it('adds whole days to a calendar date', () => {
    expect(dueDateAfter('2026-09-07', 1)).toBe('2026-09-08')
    expect(dueDateAfter('2026-09-07', 6)).toBe('2026-09-13')
    expect(dueDateAfter('2026-09-07', 0)).toBe('2026-09-07')
  })

  it('crosses a month and a year boundary', () => {
    expect(dueDateAfter('2026-09-30', 1)).toBe('2026-10-01')
    expect(dueDateAfter('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles the leap day rather than skipping it', () => {
    expect(dueDateAfter('2028-02-28', 1)).toBe('2028-02-29')
    expect(dueDateAfter('2027-02-28', 1)).toBe('2027-03-01')
  })
})

describe('daysBetweenDates', () => {
  it('counts whole days in both directions', () => {
    expect(daysBetweenDates('2026-09-07', '2026-09-10')).toBe(3)
    expect(daysBetweenDates('2026-09-07', '2026-09-07')).toBe(0)
    expect(daysBetweenDates('2026-09-10', '2026-09-07')).toBe(-3)
  })

  it('is the inverse of dueDateAfter', () => {
    for (const days of [0, 1, 6, 45, 365]) {
      expect(daysBetweenDates('2026-09-07', dueDateAfter('2026-09-07', days))).toBe(days)
    }
  })
})

/**
 * The queue is recomputed per render, never stored. These pin the ordering it
 * produces — most overdue first, then the cards this student keeps forgetting.
 */
describe('orderReviewQueue', () => {
  const card = (id: string, dueOn: string, lapses = 0, intervalDays = 1) => ({
    id,
    dueOn,
    lapses,
    intervalDays,
  })

  it('drops anything not due yet', () => {
    const queue = orderReviewQueue(
      [card('today', '2026-09-07'), card('tomorrow', '2026-09-08')],
      '2026-09-07',
    )
    expect(queue.map((c) => c.id)).toEqual(['today'])
  })

  it('puts the most overdue card first', () => {
    const queue = orderReviewQueue(
      [card('recent', '2026-09-06'), card('ancient', '2026-09-01')],
      '2026-09-07',
    )
    expect(queue.map((c) => c.id)).toEqual(['ancient', 'recent'])
  })

  it('breaks a tie on the same day by lapses, hardest first', () => {
    const queue = orderReviewQueue(
      [card('easy', '2026-09-07', 0), card('hard', '2026-09-07', 4)],
      '2026-09-07',
    )
    expect(queue.map((c) => c.id)).toEqual(['hard', 'easy'])
  })

  it('does not mutate what it was handed', () => {
    const cards = [card('b', '2026-09-07'), card('a', '2026-09-01')]
    orderReviewQueue(cards, '2026-09-07')
    expect(cards.map((c) => c.id)).toEqual(['b', 'a'])
  })

  /**
   * The one that matters for a session: a card answered today is scheduled
   * forward, so recomputing the queue must not hand it straight back.
   */
  it('excludes a card that was just reviewed forward', () => {
    const today = '2026-09-07'
    const outcome = scheduleReview(initialCardState(), QUALITY.good, NO_DEADLINE)
    const reviewed = card('just-done', dueDateAfter(today, outcome.appliedIntervalDays))

    expect(orderReviewQueue([reviewed], today)).toEqual([])
  })

  /**
   * And the deliberate exception: "Again" means one day, not today. A card
   * answered `Again` must not reappear in the same session's recomputed queue
   * either — which it does not, because its interval is 1.
   */
  it('sends an "Again" card to tomorrow, not back to the front of today', () => {
    const today = '2026-09-07'
    const outcome = scheduleReview(
      { easeFactor: 2.5, intervalDays: 10, repetitions: 3, lapses: 0 },
      QUALITY.again,
      NO_DEADLINE,
    )

    expect(outcome.appliedIntervalDays).toBe(1)
    expect(orderReviewQueue([card('again', dueDateAfter(today, 1))], today)).toEqual([])
  })
})
