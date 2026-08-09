import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DAY_BOUNDS,
  blockNow,
  blocksOnDay,
  classDays,
  diffSchedule,
  freeBlocks,
  manilaInstant,
  nextBlock,
  nextClassDay,
  weekLoad,
} from '@onetup/core'
import type { CommittedCourse, DiffCourse, ScheduleBlock, Weekday } from '@onetup/core'

function block(
  id: string,
  day: Weekday,
  startTime: string,
  endTime: string,
  label = id.toUpperCase(),
): ScheduleBlock {
  return {
    id,
    enrollmentId: `e-${id}`,
    label,
    day,
    startTime,
    endTime,
    room: 'RM312',
    source: 'ers_import',
  }
}

const WEEK: ScheduleBlock[] = [
  block('b1', 'monday', '07:00', '09:00', 'CS 3105'),
  block('b2', 'monday', '13:00', '15:00', 'MATH 101'),
  block('b3', 'wednesday', '07:00', '09:00', 'CS 3105'),
  block('b4', 'friday', '10:00', '12:00', 'PE 2'),
]

describe('blocksOnDay', () => {
  it('returns only that day, in start order', () => {
    const out = blocksOnDay(
      [block('late', 'monday', '13:00', '15:00'), ...WEEK],
      'monday',
    )
    expect(out.map((b) => b.startTime)).toEqual(['07:00', '13:00', '13:00'])
    expect(out.every((b) => b.day === 'monday')).toBe(true)
  })

  it('returns nothing for a day with no classes', () => {
    expect(blocksOnDay(WEEK, 'sunday')).toEqual([])
  })
})

describe('blockNow', () => {
  it('finds the block covering the current Manila minute', () => {
    expect(blockNow(WEEK, manilaInstant('2026-03-16', '08:00'))?.id).toBe('b1')
  })

  it('includes the start minute and excludes the end minute', () => {
    // A block that has just ended is over; the next one has not begun.
    expect(blockNow(WEEK, manilaInstant('2026-03-16', '07:00'))?.id).toBe('b1')
    expect(blockNow(WEEK, manilaInstant('2026-03-16', '09:00'))).toBeNull()
  })

  it('is null between classes and on a free day', () => {
    expect(blockNow(WEEK, manilaInstant('2026-03-16', '11:00'))).toBeNull()
    expect(blockNow(WEEK, manilaInstant('2026-03-17', '08:00'))).toBeNull()
  })
})

describe('nextBlock', () => {
  it('finds the next block later the same day', () => {
    const next = nextBlock(WEEK, manilaInstant('2026-03-16', '09:30'))
    expect(next).toMatchObject({ isToday: true, date: '2026-03-16' })
    expect(next?.block.id).toBe('b2')
    expect(next?.minutesUntil).toBe(210)
  })

  it('looks past today once the day is done', () => {
    const next = nextBlock(WEEK, manilaInstant('2026-03-16', '20:00'))
    expect(next).toMatchObject({ isToday: false, date: '2026-03-18' })
    expect(next?.block.id).toBe('b3')
    // Two days minus 20:00, plus the 07:00 start.
    expect(next?.minutesUntil).toBe(2 * 1440 - 20 * 60 + 7 * 60)
  })

  it('answers a Friday evening with Monday morning', () => {
    const next = nextBlock(WEEK, manilaInstant('2026-03-20', '19:00'))
    expect(next?.date).toBe('2026-03-23')
    expect(next?.block.id).toBe('b1')
  })

  it('is null when there are no blocks at all', () => {
    expect(nextBlock([], manilaInstant('2026-03-16', '09:00'))).toBeNull()
  })
})

describe('freeBlocks', () => {
  it('includes the lead-in from the day start and the tail to the day end', () => {
    const gaps = freeBlocks(WEEK, 'monday')
    expect(gaps.map((g) => [g.startTime, g.endTime])).toEqual([
      ['09:00', '13:00'],
      ['15:00', '21:00'],
    ])
    expect(gaps[0]).toMatchObject({ after: 'CS 3105', before: 'MATH 101', minutes: 240 })
    expect(gaps[1]).toMatchObject({ after: 'MATH 101', before: null })
  })

  it('reports the whole day free when nothing is scheduled', () => {
    const gaps = freeBlocks(WEEK, 'sunday')
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({
      startTime: DEFAULT_DAY_BOUNDS.dayStart,
      endTime: DEFAULT_DAY_BOUNDS.dayEnd,
      after: null,
      before: null,
    })
  })

  it('drops gaps shorter than the minimum asked for', () => {
    const tight = [
      block('a', 'tuesday', '07:00', '09:00'),
      block('b', 'tuesday', '09:20', '11:00'),
    ]
    expect(freeBlocks(tight, 'tuesday', 30).map((g) => g.startTime)).toEqual(['11:00'])
    expect(freeBlocks(tight, 'tuesday', 20).map((g) => g.startTime)).toEqual(['09:00', '11:00'])
  })

  it('respects custom day bounds', () => {
    const gaps = freeBlocks(WEEK, 'friday', 30, { dayStart: '09:00', dayEnd: '13:00' })
    expect(gaps.map((g) => [g.startTime, g.endTime])).toEqual([
      ['09:00', '10:00'],
      ['12:00', '13:00'],
    ])
  })

  it('does not invent a gap inside overlapping blocks', () => {
    const overlapping = [
      block('a', 'tuesday', '07:00', '12:00'),
      block('b', 'tuesday', '09:00', '10:00'),
    ]
    expect(freeBlocks(overlapping, 'tuesday').map((g) => g.startTime)).toEqual(['12:00'])
  })
})

describe('weekLoad and classDays', () => {
  it('totals scheduled minutes per weekday', () => {
    const load = weekLoad(WEEK)
    expect(load.monday).toBe(240)
    expect(load.wednesday).toBe(120)
    expect(load.friday).toBe(120)
    expect(load.sunday).toBe(0)
  })

  it('lists days with classes in week order starting Monday', () => {
    expect(classDays(WEEK)).toEqual(['monday', 'wednesday', 'friday'])
    expect(classDays([])).toEqual([])
    expect(classDays([block('s', 'sunday', '08:00', '10:00')])).toEqual(['sunday'])
  })
})

describe('nextClassDay', () => {
  it('returns today when today has classes', () => {
    expect(nextClassDay(WEEK, '2026-03-16')?.date).toBe('2026-03-16')
  })

  it('skips forward to the next day that has any', () => {
    const found = nextClassDay(WEEK, '2026-03-17')
    expect(found?.date).toBe('2026-03-18')
    expect(found?.blocks.map((b) => b.id)).toEqual(['b3'])
  })

  it('is null when nothing is scheduled — there is no plan for a day with nothing to get to', () => {
    expect(nextClassDay([], '2026-03-16')).toBeNull()
  })

  it('gives up past the lookahead rather than searching forever', () => {
    expect(nextClassDay([block('s', 'sunday', '08:00', '10:00')], '2026-03-16', 3)).toBeNull()
  })
})

describe('diffSchedule', () => {
  function committed(overrides: Partial<CommittedCourse> = {}): CommittedCourse {
    return {
      code: 'CS 3105',
      title: 'Software Engineering',
      faculty: 'Dela Cruz, J.',
      blockIds: ['b1'],
      meetings: [{ day: 'monday', startTime: '07:00', endTime: '09:00', room: 'RM312' }],
      ...overrides,
    }
  }

  function incoming(overrides: Partial<DiffCourse> = {}): DiffCourse {
    return {
      code: 'CS 3105',
      title: 'Software Engineering',
      faculty: 'Dela Cruz, J.',
      meetings: [{ day: 'monday', startTime: '07:00', endTime: '09:00', room: 'RM312' }],
      ...overrides,
    }
  }

  it('finds nothing to report when nothing moved', () => {
    expect(diffSchedule([committed()], [incoming()])).toEqual([])
  })

  it('reports an added course', () => {
    const changes = diffSchedule([], [incoming()])
    expect(changes).toHaveLength(1)
    expect(changes[0].kind).toBe('course_added')
  })

  it('spells out the cascade when a course disappears', () => {
    const changes = diffSchedule([committed()], [])
    expect(changes[0].kind).toBe('course_removed')
    // Removing it takes attendance and grades with it, so the copy says so.
    expect(changes[0].detail).toContain('attendance and grades')
  })

  it('reports a room change with both sides', () => {
    const changes = diffSchedule(
      [committed()],
      [
        incoming({
          meetings: [{ day: 'monday', startTime: '07:00', endTime: '09:00', room: 'RM401' }],
        }),
      ],
    )
    expect(changes).toEqual([
      expect.objectContaining({ kind: 'room_change', from: 'RM312', to: 'RM401' }),
    ])
  })

  it('reports a time change with both sides', () => {
    const changes = diffSchedule(
      [committed()],
      [
        incoming({
          meetings: [{ day: 'monday', startTime: '08:00', endTime: '10:00', room: 'RM312' }],
        }),
      ],
    )
    expect(changes[0]).toMatchObject({
      kind: 'time_change',
      from: '07:00–09:00',
      to: '08:00–10:00',
    })
  })

  it('reports a faculty change, including one to nobody listed', () => {
    expect(diffSchedule([committed()], [incoming({ faculty: 'Reyes, M.' })])[0]).toMatchObject({
      kind: 'faculty_change',
      from: 'Dela Cruz, J.',
      to: 'Reyes, M.',
    })
    expect(diffSchedule([committed()], [incoming({ faculty: null })])[0]).toMatchObject({
      kind: 'faculty_change',
      to: 'none',
    })
  })

  it('reports a day gained and a day lost separately', () => {
    const gained = diffSchedule(
      [committed()],
      [
        incoming({
          meetings: [
            { day: 'monday', startTime: '07:00', endTime: '09:00', room: 'RM312' },
            { day: 'wednesday', startTime: '07:00', endTime: '09:00', room: 'RM312' },
          ],
        }),
      ],
    )
    expect(gained).toEqual([
      expect.objectContaining({ kind: 'day_change', to: 'wednesday' }),
    ])

    const lost = diffSchedule(
      [
        committed({
          meetings: [
            { day: 'monday', startTime: '07:00', endTime: '09:00', room: 'RM312' },
            { day: 'wednesday', startTime: '07:00', endTime: '09:00', room: 'RM312' },
          ],
        }),
      ],
      [incoming()],
    )
    expect(lost).toEqual([expect.objectContaining({ kind: 'day_change', from: 'wednesday' })])
  })
})
