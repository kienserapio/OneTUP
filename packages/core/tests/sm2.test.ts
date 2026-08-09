import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EASE_FACTOR,
  MINIMUM_EASE_FACTOR,
  QUALITY,
  compressForDeadline,
  initialCardState,
  orderReviewQueue,
  reviewCard,
} from '@onetup/core'
import type { CardState, ReviewQuality } from '@onetup/core'

function state(overrides: Partial<CardState> = {}): CardState {
  return { ...initialCardState(), ...overrides }
}

describe('initialCardState', () => {
  it('starts a card unseen at the default ease', () => {
    expect(initialCardState()).toEqual({
      easeFactor: DEFAULT_EASE_FACTOR,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
    })
  })
})

describe('the 1 / 6 / interval × EF progression', () => {
  it('schedules the first successful review one day out', () => {
    const first = reviewCard(initialCardState(), QUALITY.good)
    expect(first.repetitions).toBe(1)
    expect(first.intervalDays).toBe(1)
    expect(first.nextIntervalDays).toBe(1)
  })

  it('schedules the second six days out', () => {
    const second = reviewCard(state({ intervalDays: 1, repetitions: 1 }), QUALITY.good)
    expect(second.repetitions).toBe(2)
    expect(second.intervalDays).toBe(6)
  })

  it('multiplies by the ease factor from the third review on', () => {
    // 6 × 2.5 = 15
    const third = reviewCard(state({ intervalDays: 6, repetitions: 2 }), QUALITY.good)
    expect(third.repetitions).toBe(3)
    expect(third.intervalDays).toBe(15)

    // 15 × 2.5 = 37.5, rounded to 38
    const fourth = reviewCard(state({ intervalDays: 15, repetitions: 3 }), QUALITY.good)
    expect(fourth.intervalDays).toBe(38)
  })

  it('runs the whole 1, 6, 15, 38 chain from a fresh card', () => {
    let card: CardState = initialCardState()
    const intervals: number[] = []
    for (let i = 0; i < 4; i++) {
      const outcome = reviewCard(card, QUALITY.good)
      intervals.push(outcome.intervalDays)
      card = outcome
    }
    expect(intervals).toEqual([1, 6, 15, 38])
  })
})

describe('the ease factor', () => {
  it('is unchanged by a "good" answer', () => {
    expect(reviewCard(initialCardState(), QUALITY.good).easeFactor).toBeCloseTo(2.5, 10)
  })

  it('rises on "easy" and falls on "hard"', () => {
    expect(reviewCard(initialCardState(), QUALITY.easy).easeFactor).toBeCloseTo(2.6, 10)
    expect(reviewCard(initialCardState(), QUALITY.hard).easeFactor).toBeCloseTo(2.36, 10)
  })

  it('falls sharply on a failure', () => {
    expect(reviewCard(initialCardState(), QUALITY.again).easeFactor).toBeCloseTo(1.7, 10)
  })

  /**
   * Below 1.3 the interval stops growing and the card recurs forever, so the
   * floor is what stops a hard card becoming a permanent one.
   */
  it('never falls below 1.3', () => {
    expect(MINIMUM_EASE_FACTOR).toBe(1.3)
    expect(reviewCard(state({ easeFactor: 1.3 }), QUALITY.again).easeFactor).toBe(1.3)
    expect(reviewCard(state({ easeFactor: 1.4 }), QUALITY.again).easeFactor).toBe(1.3)
    // The floor applies on a successful review too, not only on a lapse.
    expect(reviewCard(state({ easeFactor: 1.3, repetitions: 3 }), QUALITY.hard).easeFactor).toBe(1.3)
  })

  it('settles at the floor under repeated failure rather than diverging', () => {
    let card: CardState = initialCardState()
    for (let i = 0; i < 12; i++) card = reviewCard(card, QUALITY.again)
    expect(card.easeFactor).toBe(1.3)
    expect(card.lapses).toBe(12)
  })
})

describe('a failed review', () => {
  it('resets the streak and shows the card again tomorrow', () => {
    const outcome = reviewCard(
      state({ easeFactor: 2.5, intervalDays: 38, repetitions: 4, lapses: 1 }),
      QUALITY.again,
    )
    expect(outcome.repetitions).toBe(0)
    expect(outcome.intervalDays).toBe(1)
    expect(outcome.nextIntervalDays).toBe(1)
    expect(outcome.lapses).toBe(2)
  })

  it('treats every quality below 3 as a failure', () => {
    for (const quality of [0, 1, 2] as ReviewQuality[]) {
      const outcome = reviewCard(state({ intervalDays: 20, repetitions: 3 }), quality)
      expect(outcome.repetitions, `q=${quality}`).toBe(0)
      expect(outcome.intervalDays, `q=${quality}`).toBe(1)
    }
  })

  it('leaves the lapse count alone on a success', () => {
    expect(reviewCard(state({ lapses: 2 }), QUALITY.good).lapses).toBe(2)
  })
})

describe('compressForDeadline', () => {
  it('leaves the interval alone when there is no deadline in the horizon', () => {
    expect(compressForDeadline(15, 10, 20)).toBe(15)
    expect(compressForDeadline(15, 8, 20)).toBe(15)
    expect(compressForDeadline(15, -1, 20)).toBe(15)
  })

  it('starts compressing at the horizon boundary', () => {
    expect(compressForDeadline(15, 7, 7)).toBeLessThan(15)
    expect(compressForDeadline(15, 7, 7)).toBeLessThanOrEqual(7)
  })

  it('is due today when the deadline is today', () => {
    expect(compressForDeadline(15, 0, 20)).toBe(0)
  })

  it('spreads the pack across the days left rather than piling it on the last one', () => {
    // 20 cards over 3 days is 7 a day, so each card comes back the next day.
    expect(compressForDeadline(15, 3, 20)).toBe(1)
    // 3 cards over 6 days needs only one a day, so the spread can be wide.
    expect(compressForDeadline(15, 6, 3)).toBe(6)
  })

  it('never stretches an interval, only shortens it', () => {
    expect(compressForDeadline(2, 6, 3)).toBe(2)
    expect(compressForDeadline(1, 7, 1)).toBe(1)
    for (const [interval, days, cards] of [
      [1, 1, 1],
      [3, 5, 4],
      [10, 7, 2],
      [4, 2, 30],
    ] as const) {
      expect(compressForDeadline(interval, days, cards)).toBeLessThanOrEqual(interval)
    }
  })

  it('never schedules a card past the deadline', () => {
    for (let days = 1; days <= 7; days++) {
      for (const cards of [1, 5, 40]) {
        expect(compressForDeadline(30, days, cards)).toBeLessThanOrEqual(days)
      }
    }
  })

  it('respects a custom horizon', () => {
    expect(compressForDeadline(30, 10, 5, 14)).toBeLessThanOrEqual(10)
    expect(compressForDeadline(30, 15, 5, 14)).toBe(30)
  })

  it('does not divide by zero for an empty pack', () => {
    expect(Number.isFinite(compressForDeadline(10, 4, 0))).toBe(true)
  })
})

describe('orderReviewQueue', () => {
  const TODAY = '2026-03-16'

  it('leaves out cards that are not due yet', () => {
    const queue = orderReviewQueue(
      [
        { id: 'due', dueOn: '2026-03-16', lapses: 0, intervalDays: 1 },
        { id: 'later', dueOn: '2026-03-17', lapses: 0, intervalDays: 1 },
      ],
      TODAY,
    )
    expect(queue.map((c) => c.id)).toEqual(['due'])
  })

  it('surfaces the most overdue first, then the most lapsed, then the shortest interval', () => {
    const queue = orderReviewQueue(
      [
        { id: 'today-easy', dueOn: '2026-03-16', lapses: 0, intervalDays: 20 },
        { id: 'today-short', dueOn: '2026-03-16', lapses: 0, intervalDays: 2 },
        { id: 'today-lapsed', dueOn: '2026-03-16', lapses: 4, intervalDays: 30 },
        { id: 'overdue', dueOn: '2026-03-10', lapses: 0, intervalDays: 30 },
      ],
      TODAY,
    )
    expect(queue.map((c) => c.id)).toEqual([
      'overdue',
      'today-lapsed',
      'today-short',
      'today-easy',
    ])
  })

  it('does not mutate the array it was handed', () => {
    const cards = [
      { id: 'b', dueOn: '2026-03-16', lapses: 0, intervalDays: 1 },
      { id: 'a', dueOn: '2026-03-10', lapses: 0, intervalDays: 1 },
    ]
    orderReviewQueue(cards, TODAY)
    expect(cards.map((c) => c.id)).toEqual(['b', 'a'])
  })
})
