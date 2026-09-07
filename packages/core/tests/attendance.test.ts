import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_THRESHOLDS,
  attendanceState,
  countStatuses,
  describeAttendance,
  shouldNotifyAttendance,
  summariseAttendance,
} from '@onetup/core'
import type { AttendanceCounts, AttendanceState, AttendanceStatus } from '@onetup/core'

function counts(overrides: Partial<AttendanceCounts> = {}): AttendanceCounts {
  return { present: 0, absent: 0, late: 0, excused: 0, cancelled: 0, ...overrides }
}

const RULES = { allowedAbsences: 5, latesPerAbsence: 3 }

describe('countStatuses', () => {
  it('tallies each status', () => {
    const statuses: AttendanceStatus[] = [
      'present',
      'present',
      'absent',
      'late',
      'late',
      'excused',
      'cancelled',
    ]
    expect(countStatuses(statuses)).toEqual({
      present: 2,
      absent: 1,
      late: 2,
      excused: 1,
      cancelled: 1,
    })
  })

  it('returns zeroes for an empty record set', () => {
    expect(countStatuses([])).toEqual({
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      cancelled: 0,
    })
  })

  /** The database enum can gain a value before every client has been redeployed. */
  it('ignores a status this build does not know about', () => {
    const statuses = ['present', 'teleported'] as unknown as AttendanceStatus[]
    expect(countStatuses(statuses).present).toBe(1)
  })
})

describe('lates converting into absence units', () => {
  /**
   * `absence_units = absent + floor(late / lates_per_absence)`. Partial lates
   * never round up: a student must never be told they have used an absence they
   * have not used.
   */
  it('turns exactly three lates into exactly one absence unit', () => {
    expect(summariseAttendance(counts({ late: 3 }), RULES).absenceUnits).toBe(1)
  })

  it('turns two lates into zero absence units', () => {
    expect(summariseAttendance(counts({ late: 2 }), RULES).absenceUnits).toBe(0)
    expect(summariseAttendance(counts({ late: 1 }), RULES).absenceUnits).toBe(0)
  })

  it('never rounds a partial group up, at any multiple', () => {
    for (const [late, units] of [
      [0, 0],
      [2, 0],
      [3, 1],
      [5, 1],
      [6, 2],
      [8, 2],
      [9, 3],
    ] as const) {
      expect(summariseAttendance(counts({ late }), RULES).absenceUnits, `${late} lates`).toBe(units)
    }
  })

  it('adds converted lates on top of real absences', () => {
    expect(summariseAttendance(counts({ absent: 2, late: 3 }), RULES).absenceUnits).toBe(3)
  })

  it('counts down the lates still needed to tip into the next unit', () => {
    expect(summariseAttendance(counts({ late: 0 }), RULES).latesUntilNextUnit).toBe(3)
    expect(summariseAttendance(counts({ late: 1 }), RULES).latesUntilNextUnit).toBe(2)
    expect(summariseAttendance(counts({ late: 2 }), RULES).latesUntilNextUnit).toBe(1)
    // Having just tipped over, the next unit is a full group away again.
    expect(summariseAttendance(counts({ late: 3 }), RULES).latesUntilNextUnit).toBe(3)
    expect(summariseAttendance(counts({ late: 4 }), RULES).latesUntilNextUnit).toBe(2)
  })

  it('never converts lates when the subject has no lates rule', () => {
    const summary = summariseAttendance(counts({ late: 12 }), {
      allowedAbsences: 5,
      latesPerAbsence: 0,
    })
    expect(summary.absenceUnits).toBe(0)
    expect(summary.latesUntilNextUnit).toBe(Infinity)
  })
})

describe('excused entries', () => {
  /**
   * `excused` exists so a student can record an approved absence without it
   * inflating a total that would push them toward dropping a subject.
   */
  it('are excluded from absence units, the ratio and the state', () => {
    const withExcused = summariseAttendance(counts({ absent: 1, late: 1, excused: 6 }), RULES)
    const without = summariseAttendance(counts({ absent: 1, late: 1 }), RULES)

    expect(withExcused.absenceUnits).toBe(without.absenceUnits)
    expect(withExcused.ratio).toBe(without.ratio)
    expect(withExcused.remaining).toBe(without.remaining)
    expect(withExcused.state).toBe(without.state)
  })

  it('are still reported, so the record is complete', () => {
    expect(summariseAttendance(counts({ excused: 6 }), RULES).excused).toBe(6)
  })

  it('alone leave a student at zero absence units', () => {
    const summary = summariseAttendance(counts({ present: 10, excused: 4 }), RULES)
    expect(summary.absenceUnits).toBe(0)
    expect(summary.state).toBe('normal')
    expect(summary.remaining).toBe(5)
  })
})

describe('cancelled classes', () => {
  /**
   * A suspension is not an outcome the student produced. Counting it as an
   * absence would punish them for a typhoon; counting it as present would put a
   * class in their record that nobody held.
   */
  it('are excluded from absence units, the ratio and the state', () => {
    const withCancelled = summariseAttendance(counts({ absent: 1, late: 1, cancelled: 6 }), RULES)
    const without = summariseAttendance(counts({ absent: 1, late: 1 }), RULES)

    expect(withCancelled.absenceUnits).toBe(without.absenceUnits)
    expect(withCancelled.ratio).toBe(without.ratio)
    expect(withCancelled.remaining).toBe(without.remaining)
    expect(withCancelled.state).toBe(without.state)
  })

  it('are still reported, so a term of suspensions is visible afterwards', () => {
    expect(summariseAttendance(counts({ cancelled: 6 }), RULES).cancelled).toBe(6)
  })

  it('never convert into a late, however many of them there are', () => {
    const summary = summariseAttendance(counts({ cancelled: 12 }), RULES)
    expect(summary.absenceUnits).toBe(0)
    expect(summary.latesUntilNextUnit).toBe(3)
    expect(summary.state).toBe('normal')
  })
})

describe('the ratio and the state', () => {
  it('is absenceUnits over allowed', () => {
    expect(summariseAttendance(counts({ absent: 1 }), RULES).ratio).toBeCloseTo(0.2, 10)
    expect(summariseAttendance(counts({ absent: 4 }), RULES).ratio).toBeCloseTo(0.8, 10)
  })

  it('escalates at each documented threshold', () => {
    expect(attendanceState(0, 5)).toBe('normal')
    expect(attendanceState(0.49, 5)).toBe('normal')
    expect(attendanceState(ATTENDANCE_THRESHOLDS.caution, 5)).toBe('caution')
    expect(attendanceState(0.79, 5)).toBe('caution')
    expect(attendanceState(ATTENDANCE_THRESHOLDS.warning, 5)).toBe('warning')
    expect(attendanceState(0.99, 5)).toBe('warning')
    expect(attendanceState(ATTENDANCE_THRESHOLDS.atLimit, 5)).toBe('at_limit')
    expect(attendanceState(2, 5)).toBe('at_limit')
  })

  it('never reports negative remaining absences', () => {
    const summary = summariseAttendance(counts({ absent: 9 }), RULES)
    expect(summary.remaining).toBe(0)
    expect(summary.state).toBe('at_limit')
  })
})

describe('an allowance of zero', () => {
  /** `absenceUnits / 0` would be Infinity or NaN and drive the whole UI. */
  it('does not divide by zero', () => {
    const summary = summariseAttendance(counts({ absent: 3, late: 3 }), {
      allowedAbsences: 0,
      latesPerAbsence: 3,
    })
    expect(summary.ratio).toBe(0)
    expect(Number.isFinite(summary.ratio)).toBe(true)
    expect(summary.allowed).toBe(0)
    expect(summary.remaining).toBe(0)
    // The absence arithmetic still runs; only the limit is absent.
    expect(summary.absenceUnits).toBe(4)
    expect(summary.state).toBe('normal')
  })

  it('says plainly that no limit is set', () => {
    const summary = summariseAttendance(counts({ absent: 3 }), {
      allowedAbsences: 0,
      latesPerAbsence: 3,
    })
    expect(describeAttendance(summary)).toBe('No absence limit set for this subject.')
  })

  it('treats a negative allowance as no allowance rather than propagating it', () => {
    const summary = summariseAttendance(counts({ absent: 1 }), {
      allowedAbsences: -3,
      latesPerAbsence: 3,
    })
    expect(summary.allowed).toBe(0)
    expect(summary.ratio).toBe(0)
    expect(summary.state).toBe('normal')
  })
})

describe('shouldNotifyAttendance', () => {
  it('fires on a transition to a more serious state', () => {
    expect(shouldNotifyAttendance(null, 'caution')).toBe(true)
    expect(shouldNotifyAttendance('normal', 'caution')).toBe(true)
    expect(shouldNotifyAttendance('caution', 'warning')).toBe(true)
    expect(shouldNotifyAttendance('warning', 'at_limit')).toBe(true)
    expect(shouldNotifyAttendance('normal', 'at_limit')).toBe(true)
  })

  it('stays quiet while the state holds', () => {
    expect(shouldNotifyAttendance('warning', 'warning')).toBe(false)
    expect(shouldNotifyAttendance('at_limit', 'at_limit')).toBe(false)
  })

  it('stays quiet on recovery and on returning to normal', () => {
    expect(shouldNotifyAttendance('at_limit', 'warning')).toBe(false)
    expect(shouldNotifyAttendance('warning', 'caution')).toBe(false)
    expect(shouldNotifyAttendance('warning', 'normal')).toBe(false)
    expect(shouldNotifyAttendance(null, 'normal')).toBe(false)
  })

  it('warns once when the ratio crosses 0.8, not on every recount afterwards', () => {
    // 5 allowed: the fourth absence unit puts the ratio at exactly 0.8.
    let previous: AttendanceState | null = null
    const fired: AttendanceState[] = []

    for (const absent of [0, 1, 2, 3, 4, 4, 4]) {
      const summary = summariseAttendance(counts({ absent }), RULES)
      if (shouldNotifyAttendance(previous, summary.state)) fired.push(summary.state)
      previous = summary.state
    }

    // caution at 0.5 (absent 3), warning at 0.8 (absent 4), then silence.
    expect(fired).toEqual(['caution', 'warning'])
  })

  it('warns once when the crossing is driven by lates rather than absences', () => {
    let previous: AttendanceState | null = null
    let warnings = 0

    // 12 lates is 4 units at 3-per-absence, i.e. exactly the 0.8 ratio; the
    // three further lates after that must not re-fire.
    for (const late of [3, 6, 9, 12, 13, 14, 15]) {
      const summary = summariseAttendance(counts({ late }), RULES)
      if (shouldNotifyAttendance(previous, summary.state) && summary.state === 'warning') {
        warnings++
      }
      previous = summary.state
    }

    expect(warnings).toBe(1)
  })
})

describe('describeAttendance', () => {
  it('reads plainly, with no hedging and no alarm', () => {
    expect(describeAttendance(summariseAttendance(counts({ absent: 0 }), RULES))).toBe(
      '5 absences left.',
    )
    expect(describeAttendance(summariseAttendance(counts({ absent: 4 }), RULES))).toBe(
      '1 absence left.',
    )
    expect(describeAttendance(summariseAttendance(counts({ absent: 5 }), RULES))).toBe(
      'You are at the limit for this subject.',
    )
    expect(describeAttendance(summariseAttendance(counts({ absent: 8 }), RULES))).toBe(
      'You are at the limit for this subject.',
    )
  })
})
