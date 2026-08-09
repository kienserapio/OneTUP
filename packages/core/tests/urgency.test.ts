import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REMINDER_OFFSETS,
  URGENCY_HOURS,
  compareByUrgency,
  describeTimeLeft,
  hoursUntil,
  planReminders,
  subtaskProgress,
  urgencyOf,
} from '@onetup/core'
import type { DeadlineLike } from '@onetup/core'

const NOW = new Date('2026-03-16T09:00:00+08:00')
const HOUR = 3_600_000

/** A due date `hours` from NOW. Fractions are allowed, and used for boundaries. */
function due(hours: number): Date {
  return new Date(NOW.getTime() + hours * HOUR)
}

function open(hours: number): DeadlineLike {
  return { dueAt: due(hours), status: 'open' }
}

describe('hoursUntil', () => {
  it('accepts a Date or an ISO string identically', () => {
    expect(hoursUntil(due(6), NOW)).toBeCloseTo(6, 10)
    expect(hoursUntil(due(6).toISOString(), NOW)).toBeCloseTo(6, 10)
  })

  it('is negative once the deadline has passed', () => {
    expect(hoursUntil(due(-2), NOW)).toBeCloseTo(-2, 10)
  })
})

describe('urgencyOf boundaries', () => {
  it('uses the documented cutoffs', () => {
    expect(URGENCY_HOURS).toEqual({ critical: 6, urgent: 24, soon: 72, upcoming: 168 })
  })

  it('is critical up to and including 6 hours', () => {
    expect(urgencyOf(open(0), NOW)).toBe('critical')
    expect(urgencyOf(open(0.25), NOW)).toBe('critical')
    expect(urgencyOf(open(6), NOW)).toBe('critical')
  })

  it('is urgent just past 6 hours and up to 24', () => {
    expect(urgencyOf(open(6.01), NOW)).toBe('urgent')
    expect(urgencyOf(open(12), NOW)).toBe('urgent')
    expect(urgencyOf(open(24), NOW)).toBe('urgent')
  })

  it('is soon just past 24 hours and up to 72', () => {
    expect(urgencyOf(open(24.01), NOW)).toBe('soon')
    expect(urgencyOf(open(48), NOW)).toBe('soon')
    expect(urgencyOf(open(72), NOW)).toBe('soon')
  })

  it('is upcoming just past 72 hours and up to 168', () => {
    expect(urgencyOf(open(72.01), NOW)).toBe('upcoming')
    expect(urgencyOf(open(120), NOW)).toBe('upcoming')
    expect(urgencyOf(open(168), NOW)).toBe('upcoming')
  })

  it('is later past 168 hours', () => {
    expect(urgencyOf(open(168.01), NOW)).toBe('later')
    expect(urgencyOf(open(24 * 30), NOW)).toBe('later')
  })

  it('is overdue only while the deadline is still open', () => {
    expect(urgencyOf({ dueAt: due(-0.01), status: 'open' }, NOW)).toBe('overdue')
    expect(urgencyOf({ dueAt: due(-72), status: 'open' }, NOW)).toBe('overdue')
    // A finished or dismissed item drops out of the urgency ladder entirely.
    expect(urgencyOf({ dueAt: due(-72), status: 'done' }, NOW)).toBe('later')
    expect(urgencyOf({ dueAt: due(-72), status: 'dismissed' }, NOW)).toBe('later')
  })

  it('defaults `now` to the current clock', () => {
    expect(urgencyOf({ dueAt: new Date(Date.now() + 3 * HOUR), status: 'open' })).toBe('critical')
  })
})

describe('compareByUrgency', () => {
  it('orders overdue first, then by band, then by due date within a band', () => {
    const items: DeadlineLike[] = [
      { dueAt: due(100), status: 'open' },
      { dueAt: due(-5), status: 'open' },
      { dueAt: due(30), status: 'open' },
      { dueAt: due(2), status: 'open' },
      { dueAt: due(40), status: 'open' },
    ]
    const sorted = [...items].sort((a, b) => compareByUrgency(a, b, NOW))
    expect(sorted.map((d) => urgencyOf(d, NOW))).toEqual([
      'overdue',
      'critical',
      'soon',
      'soon',
      'upcoming',
    ])
    // Within 'soon', 30 hours out comes before 40 hours out.
    expect(new Date(sorted[2].dueAt).getTime()).toBeLessThan(new Date(sorted[3].dueAt).getTime())
  })
})

describe('describeTimeLeft', () => {
  it('is coarse in the future — a to-the-minute countdown reads as pressure', () => {
    expect(describeTimeLeft(due(0.001), NOW)).toBe('in 1 min')
    expect(describeTimeLeft(due(0.5), NOW)).toBe('in 30 min')
    expect(describeTimeLeft(due(0.99), NOW)).toBe('in 59 min')
    expect(describeTimeLeft(due(1), NOW)).toBe('in 1 hour')
    expect(describeTimeLeft(due(1.9), NOW)).toBe('in 1 hour')
    expect(describeTimeLeft(due(5), NOW)).toBe('in 5 hours')
    expect(describeTimeLeft(due(6), NOW)).toBe('in 6 hours')
    expect(describeTimeLeft(due(23.9), NOW)).toBe('in 23 hours')
  })

  it('switches to days at 24 hours and to weeks at 7 days', () => {
    expect(describeTimeLeft(due(24), NOW)).toBe('tomorrow')
    expect(describeTimeLeft(due(47), NOW)).toBe('tomorrow')
    expect(describeTimeLeft(due(48), NOW)).toBe('in 2 days')
    expect(describeTimeLeft(due(72), NOW)).toBe('in 3 days')
    expect(describeTimeLeft(due(24 * 6), NOW)).toBe('in 6 days')
    expect(describeTimeLeft(due(168), NOW)).toBe('in 1 week')
    expect(describeTimeLeft(due(24 * 13), NOW)).toBe('in 1 week')
    expect(describeTimeLeft(due(24 * 14), NOW)).toBe('in 2 weeks')
  })

  it('reads overdue time in the same register', () => {
    expect(describeTimeLeft(due(-0.5), NOW)).toBe('Overdue')
    expect(describeTimeLeft(due(-0.99), NOW)).toBe('Overdue')
    expect(describeTimeLeft(due(-1), NOW)).toBe('1h overdue')
    expect(describeTimeLeft(due(-5), NOW)).toBe('5h overdue')
    expect(describeTimeLeft(due(-23.5), NOW)).toBe('23h overdue')
    expect(describeTimeLeft(due(-24), NOW)).toBe('1 day overdue')
    expect(describeTimeLeft(due(-25), NOW)).toBe('1 day overdue')
    expect(describeTimeLeft(due(-48), NOW)).toBe('2 days overdue')
  })
})

describe('planReminders', () => {
  it('defaults to 72h, 24h and 6h before the deadline', () => {
    expect(DEFAULT_REMINDER_OFFSETS).toEqual([259_200, 86_400, 21_600])
  })

  it('schedules every offset for a deadline far enough out', () => {
    const reminders = planReminders(due(200), DEFAULT_REMINDER_OFFSETS, NOW)
    expect(reminders.map((r) => r.offsetSeconds)).toEqual([259_200, 86_400, 21_600])
    expect(reminders[0].fireAt.getTime()).toBe(due(200 - 72).getTime())
    expect(reminders[2].fireAt.getTime()).toBe(due(200 - 6).getTime())
  })

  it('drops offsets that already sit in the past', () => {
    // Due in 30 hours: the 72h reminder would have fired 42 hours ago. Firing
    // it now would tell a student something is due in 72 hours when it is due
    // in 30, which teaches them to ignore the channel.
    const reminders = planReminders(due(30), DEFAULT_REMINDER_OFFSETS, NOW)
    expect(reminders.map((r) => r.offsetSeconds)).toEqual([86_400, 21_600])
    expect(reminders.every((r) => r.fireAt.getTime() > NOW.getTime())).toBe(true)
  })

  it('returns nothing when every offset has passed', () => {
    expect(planReminders(due(1), DEFAULT_REMINDER_OFFSETS, NOW)).toEqual([])
    expect(planReminders(due(-5), DEFAULT_REMINDER_OFFSETS, NOW)).toEqual([])
  })

  it('drops an offset landing exactly on now rather than firing it immediately', () => {
    // Due in exactly 6 hours: the 6h reminder is due this instant.
    const reminders = planReminders(due(6), DEFAULT_REMINDER_OFFSETS, NOW)
    expect(reminders).toEqual([])
  })

  it('returns the survivors in firing order', () => {
    const reminders = planReminders(due(100), [21_600, 259_200, 86_400], NOW)
    const times = reminders.map((r) => r.fireAt.getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(reminders.map((r) => r.offsetSeconds)).toEqual([259_200, 86_400, 21_600])
  })

  it('accepts an ISO string as the due date', () => {
    expect(planReminders(due(200).toISOString(), DEFAULT_REMINDER_OFFSETS, NOW)).toHaveLength(3)
  })
})

describe('subtaskProgress', () => {
  it('counts done against total', () => {
    expect(subtaskProgress([{ isDone: true }, { isDone: false }, { isDone: true }])).toEqual({
      done: 2,
      total: 3,
      ratio: 2 / 3,
      allDone: false,
    })
  })

  it('reports allDone only when there is something to have done', () => {
    expect(subtaskProgress([{ isDone: true }])).toMatchObject({ ratio: 1, allDone: true })
    // No subtasks is not "all complete", and must not divide by zero.
    expect(subtaskProgress([])).toEqual({ done: 0, total: 0, ratio: 0, allDone: false })
  })
})
