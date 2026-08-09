import { describe, expect, it } from 'vitest'
import { parseScheduleTable } from '../src/schedule/parse'

/**
 * Rows captured from the live ERS schedule page, with the faculty names
 * replaced. Everything else — the column order, the doubled section prefix, the
 * mixed rooms and TBAs — is exactly what the portal returned.
 *
 * The synthetic tests cover the day-code and time-range rules in isolation.
 * This one is the check that those rules survive contact with the real thing,
 * and it is the file to update first when the portal's layout changes.
 */
const LIVE_ROWS: string[][] = [
  ['1', 'GEE11D-M', 'Living in the IT Era', '3', '0', '3', 'FACULTY, A.', 'BSCS-4B-M - BSCS-4B-M - W 02:30PM-05:30PM COS322'],
  ['2', 'GEE12D-M', 'The Entrepreneurial Mind', '3', '0', '3', 'FACULTY, B.', 'BSCS-4B-M - BSCS-4B-M - W 11:00AM-02:00PM TBA'],
  ['3', 'GEE13D-M', 'Reading Visual Arts', '3', '0', '3', 'FACULTY, C.', 'BSCS-4B-M - BSCS-4B-M - M 04:30PM-07:30PM TBA'],
  ['4', 'GEM14-M', 'Life and Works of Rizal', '3', '0', '3', 'FACULTY, D.', 'BSCS-4B-M - BSCS-4B-M - M 12:00PM-03:00PM TBA'],
  ['5', 'CS413-M', 'Thesis Writing 1', '3', '0', '3', 'FACULTY, E.', 'BSCS-4B-M - BSCS-4B-M - TH 03:00PM-06:00PM COS322'],
  ['6', 'CS433-M', 'Social and Professional Issues', '3', '0', '3', 'FACULTY, F.', 'BSCS-4B-M - BSCS-4B-M - TH 12:00PM-03:00PM COSCOMLAB2'],
]

describe('a real ERS schedule page', () => {
  const result = parseScheduleTable(LIVE_ROWS)

  it('reads every row, with nothing left unparsed', () => {
    expect(result.courses).toHaveLength(6)
    expect(result.unparsed).toHaveLength(0)
    expect(result.courses.every((course) => course.parseStatus !== 'failed')).toBe(true)
  })

  it('takes the meeting from after the last separator, not the section prefix', () => {
    // The cell reads "BSCS-4B-M - BSCS-4B-M - W 02:30PM-05:30PM COS322". Only
    // the final segment describes when the class actually meets.
    const course = result.courses.find((c) => c.code === 'GEE11D-M')!
    expect(course.meetings).toEqual([
      { day: 'wednesday', startTime: '14:30', endTime: '17:30', room: 'COS322', parseStatus: 'ok' },
    ])
  })

  it('reads TH as Thursday', () => {
    // The bug class this parser exists to avoid: matching T before TH moves a
    // whole semester of Thursday classes onto Tuesday, silently.
    const thursdays = result.courses.filter((course) =>
      course.meetings.some((meeting) => meeting.day === 'thursday'),
    )
    expect(thursdays.map((course) => course.code)).toEqual(['CS413-M', 'CS433-M'])
    expect(result.courses.some((c) => c.meetings.some((m) => m.day === 'tuesday'))).toBe(false)
  })

  it('converts afternoon times past noon rather than wrapping them', () => {
    const thesis = result.courses.find((c) => c.code === 'CS413-M')!
    expect(thesis.meetings[0]).toMatchObject({ startTime: '15:00', endTime: '18:00' })

    // 12:00PM is noon, not midnight — the one hour a 12-hour clock gets wrong.
    const issues = result.courses.find((c) => c.code === 'CS433-M')!
    expect(issues.meetings[0]).toMatchObject({ startTime: '12:00', endTime: '15:00' })
  })

  it('keeps a course with no room and flags it rather than dropping it', () => {
    const noRoom = result.courses.find((c) => c.code === 'GEE13D-M')!
    expect(noRoom.meetings[0].room).toBe('TBA')

    const flagged = result.warnings.filter((w) => w.code === 'missing_room').map((w) => w.courseCode)
    expect(flagged).toEqual(['GEE12D-M', 'GEE13D-M', 'GEM14-M'])
  })

  it('reads the unit columns in the right order', () => {
    const course = result.courses.find((c) => c.code === 'CS413-M')!
    expect(course).toMatchObject({ lecUnits: 3, labUnits: 0, units: 3 })
  })

  it('does not flag a plausible 18-unit load', () => {
    expect(result.warnings.some((w) => w.code === 'unit_total_implausible')).toBe(false)
  })
})
