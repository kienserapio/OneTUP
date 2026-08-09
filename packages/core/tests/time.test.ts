import { describe, expect, it } from 'vitest'
import {
  MANILA_OFFSET_MINUTES,
  addDays,
  addMinutes,
  daysBetween,
  formatTime12,
  formatWeekday,
  fromMinutes,
  isDateOnly,
  isTimeOfDay,
  manilaDate,
  manilaInstant,
  manilaMinutes,
  manilaTime,
  manilaWeekday,
  minutesBetween,
  nextWeekdayOnOrAfter,
  toMinutes,
  weekdayOf,
} from '@onetup/core'

describe('minutes conversion', () => {
  it('reads HH:MM as minutes since midnight', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('07:30')).toBe(450)
    expect(toMinutes('23:59')).toBe(1439)
  })

  it('rejects anything that is not a 24-hour HH:MM', () => {
    expect(() => toMinutes('24:00')).toThrow(RangeError)
    expect(() => toMinutes('7:30')).toThrow(RangeError)
    expect(() => toMinutes('07:60')).toThrow(RangeError)
  })

  it('wraps out-of-range minutes into a real time of day', () => {
    expect(fromMinutes(0)).toBe('00:00')
    expect(fromMinutes(1439)).toBe('23:59')
    expect(fromMinutes(1440)).toBe('00:00')
    // A departure computed backwards from a morning class can land before
    // midnight, so a negative offset has to come back as a valid clock time.
    expect(fromMinutes(-60)).toBe('23:00')
    expect(fromMinutes(-1)).toBe('23:59')
  })

  it('round-trips every minute of the day', () => {
    for (let m = 0; m < 1440; m += 7) {
      expect(toMinutes(fromMinutes(m))).toBe(m)
    }
  })
})

describe('shape guards', () => {
  it('accepts only well-formed times', () => {
    expect(isTimeOfDay('00:00')).toBe(true)
    expect(isTimeOfDay('23:59')).toBe(true)
    expect(isTimeOfDay('24:00')).toBe(false)
    expect(isTimeOfDay('9:00')).toBe(false)
    expect(isTimeOfDay('09:00:00')).toBe(false)
  })

  it('accepts only well-formed dates', () => {
    expect(isDateOnly('2026-03-16')).toBe(true)
    expect(isDateOnly('2026-3-16')).toBe(false)
    expect(isDateOnly('2026-03-16T00:00:00Z')).toBe(false)
  })
})

describe('Asia/Manila instants', () => {
  it('is a fixed +08:00 offset', () => {
    expect(MANILA_OFFSET_MINUTES).toBe(480)
  })

  it('round-trips a wall-clock date and time through manilaDate/manilaTime', () => {
    for (const [date, time] of [
      ['2026-03-16', '07:30'],
      ['2026-03-16', '00:00'],
      ['2026-03-16', '23:59'],
      ['2025-12-31', '23:00'],
      ['2026-01-01', '00:30'],
      // The Philippines has observed no DST since 1978, so a date that would
      // be a transition elsewhere must still round-trip exactly.
      ['2026-06-21', '02:00'],
    ] as const) {
      const instant = manilaInstant(date, time)
      expect(manilaDate(instant)).toBe(date)
      expect(manilaTime(instant)).toBe(time)
      expect(manilaMinutes(instant)).toBe(toMinutes(time))
    }
  })

  it('places a Manila midnight at 16:00 UTC the day before', () => {
    expect(manilaInstant('2026-03-16', '00:00').toISOString()).toBe('2026-03-15T16:00:00.000Z')
  })

  it('rejects malformed inputs rather than producing an Invalid Date', () => {
    expect(() => manilaInstant('2026-3-16', '07:00')).toThrow(RangeError)
    expect(() => manilaInstant('2026-03-16', '7:00')).toThrow(RangeError)
  })

  it('reports the Manila weekday, not the UTC one', () => {
    // 22:00 UTC on Sunday is already Monday morning in Manila.
    expect(manilaWeekday(new Date('2026-03-15T22:00:00.000Z'))).toBe('monday')
    expect(manilaWeekday(new Date('2026-03-15T15:00:00.000Z'))).toBe('sunday')
    expect(manilaWeekday(manilaInstant('2026-03-16', '00:05'))).toBe('monday')
  })
})

describe('calendar arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-03-16', 1)).toBe('2026-03-17')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-03-16', 0)).toBe('2026-03-16')
  })

  it('counts whole days between dates, signed', () => {
    expect(daysBetween('2026-03-16', '2026-03-23')).toBe(7)
    expect(daysBetween('2026-03-23', '2026-03-16')).toBe(-7)
    expect(daysBetween('2026-03-16', '2026-03-16')).toBe(0)
  })

  it('names the weekday of a date', () => {
    expect(weekdayOf('2026-03-16')).toBe('monday')
    expect(weekdayOf('2026-03-15')).toBe('sunday')
    expect(weekdayOf('2026-03-14')).toBe('saturday')
  })
})

describe('nextWeekdayOnOrAfter', () => {
  it('returns the same date when it already falls on the weekday', () => {
    expect(nextWeekdayOnOrAfter('2026-03-16', 'monday')).toBe('2026-03-16')
    expect(nextWeekdayOnOrAfter('2026-03-15', 'sunday')).toBe('2026-03-15')
  })

  it('walks forward within the same week', () => {
    expect(nextWeekdayOnOrAfter('2026-03-16', 'thursday')).toBe('2026-03-19')
    expect(nextWeekdayOnOrAfter('2026-03-16', 'saturday')).toBe('2026-03-21')
  })

  it('wraps into the following week rather than looking backwards', () => {
    // Sunday is index 0, so a Monday start must not resolve to yesterday.
    expect(nextWeekdayOnOrAfter('2026-03-16', 'sunday')).toBe('2026-03-22')
    expect(nextWeekdayOnOrAfter('2026-03-19', 'wednesday')).toBe('2026-03-25')
  })

  it('always lands on the weekday it was asked for', () => {
    for (let offset = 0; offset < 14; offset++) {
      const from = addDays('2026-03-16', offset)
      const result = nextWeekdayOnOrAfter(from, 'friday')
      expect(weekdayOf(result)).toBe('friday')
      expect(daysBetween(from, result)).toBeGreaterThanOrEqual(0)
      expect(daysBetween(from, result)).toBeLessThan(7)
    }
  })
})

describe('instant arithmetic', () => {
  it('adds and measures minutes', () => {
    const base = manilaInstant('2026-03-16', '07:00')
    expect(manilaTime(addMinutes(base, 90))).toBe('08:30')
    expect(manilaTime(addMinutes(base, -90))).toBe('05:30')
    expect(minutesBetween(base, addMinutes(base, 45))).toBe(45)
    expect(minutesBetween(addMinutes(base, 45), base)).toBe(-45)
  })

  it('crosses midnight backwards onto the previous Manila date', () => {
    const base = manilaInstant('2026-03-16', '00:30')
    const earlier = addMinutes(base, -60)
    expect(manilaDate(earlier)).toBe('2026-03-15')
    expect(manilaTime(earlier)).toBe('23:30')
  })
})

describe('display formatting', () => {
  it('renders 12-hour times with the right meridiem at both noons', () => {
    expect(formatTime12('00:00')).toBe('12:00 AM')
    expect(formatTime12('00:30')).toBe('12:30 AM')
    expect(formatTime12('07:00')).toBe('7:00 AM')
    expect(formatTime12('11:59')).toBe('11:59 AM')
    expect(formatTime12('12:00')).toBe('12:00 PM')
    expect(formatTime12('13:05')).toBe('1:05 PM')
    expect(formatTime12('23:59')).toBe('11:59 PM')
  })

  it('renders weekday labels', () => {
    expect(formatWeekday('monday')).toBe('Monday')
    expect(formatWeekday('thursday', 'short')).toBe('Thu')
    expect(formatWeekday('sunday', 'short')).toBe('Sun')
  })
})
