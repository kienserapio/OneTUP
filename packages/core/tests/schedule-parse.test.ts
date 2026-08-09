import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARSER_CONFIG,
  PARSER_VERSION,
  parseClockTime,
  parseDayCode,
  parseRow,
  parseScheduleString,
  parseScheduleTable,
  validateCourses,
} from '@onetup/core'
import type { ParsedCourse, ParsedMeeting } from '@onetup/core'

/** A full ERS row in the default column layout, with only the cells we vary. */
function row(overrides: Partial<Record<'code' | 'title' | 'lec' | 'lab' | 'units' | 'faculty' | 'schedule', string>> = {}): string[] {
  const cells = new Array<string>(8).fill('')
  cells[0] = '1'
  cells[DEFAULT_PARSER_CONFIG.columns.code] = overrides.code ?? 'CS 3105'
  cells[DEFAULT_PARSER_CONFIG.columns.title] = overrides.title ?? 'Software Engineering'
  cells[DEFAULT_PARSER_CONFIG.columns.lec] = overrides.lec ?? '3'
  cells[DEFAULT_PARSER_CONFIG.columns.lab] = overrides.lab ?? '0'
  cells[DEFAULT_PARSER_CONFIG.columns.units] = overrides.units ?? '3'
  cells[DEFAULT_PARSER_CONFIG.columns.faculty] = overrides.faculty ?? 'Dela Cruz, J.'
  cells[DEFAULT_PARSER_CONFIG.columns.schedule] = overrides.schedule ?? 'MW 10:00AM-12:00PM RM312'
  return cells
}

function days(meetings: readonly ParsedMeeting[]): string[] {
  return meetings.map((m) => m.day)
}

describe('parseDayCode — single-letter codes', () => {
  /**
   * The whole reason DAY_CODES is ordered longest-first. If `T` were tested
   * before `TH`, every Thursday class in the university would import as a
   * Tuesday class — a silent, whole-semester error a student would never think
   * to check against the portal.
   */
  it('resolves TH to Thursday and never Tuesday', () => {
    expect(parseDayCode('TH')).toEqual(['thursday'])
    expect(parseDayCode('th')).toEqual(['thursday'])
    expect(parseDayCode(' TH ')).toEqual(['thursday'])
    expect(parseDayCode('TH')).not.toContain('tuesday')
  })

  it('resolves T to Tuesday, distinct from TH', () => {
    expect(parseDayCode('T')).toEqual(['tuesday'])
    expect(parseDayCode('T')).not.toContain('thursday')
  })

  /** Same trap in the other direction: `S` (Saturday) is a prefix of `SUN`. */
  it('resolves SUN to Sunday and never Saturday', () => {
    expect(parseDayCode('SUN')).toEqual(['sunday'])
    expect(parseDayCode('sun')).toEqual(['sunday'])
    expect(parseDayCode('SUN')).not.toContain('saturday')
  })

  it('resolves S to Saturday and U to Sunday', () => {
    expect(parseDayCode('S')).toEqual(['saturday'])
    expect(parseDayCode('U')).toEqual(['sunday'])
  })

  it('resolves the remaining single letters', () => {
    expect(parseDayCode('M')).toEqual(['monday'])
    expect(parseDayCode('W')).toEqual(['wednesday'])
    expect(parseDayCode('F')).toEqual(['friday'])
  })
})

describe('parseDayCode — compound codes', () => {
  it('expands MW, TTH, MWF and TTHS to one day each', () => {
    expect(parseDayCode('MW')).toEqual(['monday', 'wednesday'])
    expect(parseDayCode('TTH')).toEqual(['tuesday', 'thursday'])
    expect(parseDayCode('MWF')).toEqual(['monday', 'wednesday', 'friday'])
    expect(parseDayCode('TTHS')).toEqual(['tuesday', 'thursday', 'saturday'])
  })

  it('never degrades TTH into T plus junk', () => {
    const result = parseDayCode('TTH')
    expect(result).toHaveLength(2)
    expect(result).toContain('thursday')
  })

  it('expands the remaining table entries', () => {
    expect(parseDayCode('MTWTHF')).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
    ])
    expect(parseDayCode('MTH')).toEqual(['monday', 'thursday'])
    expect(parseDayCode('WTH')).toEqual(['wednesday', 'thursday'])
    expect(parseDayCode('THS')).toEqual(['thursday', 'saturday'])
    expect(parseDayCode('MF')).toEqual(['monday', 'friday'])
    expect(parseDayCode('WF')).toEqual(['wednesday', 'friday'])
    expect(parseDayCode('TF')).toEqual(['tuesday', 'friday'])
    expect(parseDayCode('TS')).toEqual(['tuesday', 'saturday'])
    expect(parseDayCode('MS')).toEqual(['monday', 'saturday'])
  })

  it('consumes a concatenation not in the table, longest code first', () => {
    // 'MWTH' is not a table entry: MW is consumed, then TH — not T then H.
    expect(parseDayCode('MWTH')).toEqual(['monday', 'wednesday', 'thursday'])
    expect(parseDayCode('MWTH')).not.toContain('tuesday')
  })

  it('does not repeat a day when codes overlap', () => {
    expect(parseDayCode('MWMW')).toEqual(['monday', 'wednesday'])
  })
})

describe('parseDayCode — unknown codes', () => {
  /** Guessing at the nearest match would put a class on the wrong day. */
  it('returns null rather than guessing', () => {
    expect(parseDayCode('XYZ')).toBeNull()
    expect(parseDayCode('Q')).toBeNull()
    expect(parseDayCode('MX')).toBeNull()
    expect(parseDayCode('ZM')).toBeNull()
  })

  it('returns null when nothing alphabetic survives normalisation', () => {
    expect(parseDayCode('')).toBeNull()
    expect(parseDayCode('   ')).toBeNull()
    expect(parseDayCode('123')).toBeNull()
    expect(parseDayCode('-/-')).toBeNull()
  })
})

describe('parseClockTime', () => {
  it('parses 10:00AM and 10:00 AM identically', () => {
    expect(parseClockTime('10:00AM')).toBe('10:00')
    expect(parseClockTime('10:00 AM')).toBe('10:00')
    expect(parseClockTime('10:00AM')).toBe(parseClockTime('10:00 AM'))
  })

  it('accepts dotted and lowercase meridiems and a bare hour', () => {
    expect(parseClockTime('10:00a.m.')).toBe('10:00')
    expect(parseClockTime('1:00 p.m.')).toBe('13:00')
    expect(parseClockTime('10AM')).toBe('10:00')
    expect(parseClockTime('7 pm')).toBe('19:00')
  })

  it('handles the two noon/midnight special cases', () => {
    expect(parseClockTime('12:00AM')).toBe('00:00')
    expect(parseClockTime('12:30AM')).toBe('00:30')
    expect(parseClockTime('12:00PM')).toBe('12:00')
    expect(parseClockTime('12:45PM')).toBe('12:45')
  })

  it('accepts a bare 24-hour time', () => {
    expect(parseClockTime('13:00')).toBe('13:00')
    expect(parseClockTime('00:00')).toBe('00:00')
    expect(parseClockTime('23:59')).toBe('23:59')
  })

  it('applies the meridiem hint only when the token carries none', () => {
    expect(parseClockTime('10:00', 'PM')).toBe('22:00')
    expect(parseClockTime('10:00', 'AM')).toBe('10:00')
    expect(parseClockTime('10:00AM', 'PM')).toBe('10:00')
  })

  it('returns null rather than a plausible-looking guess', () => {
    expect(parseClockTime('')).toBeNull()
    expect(parseClockTime('noon')).toBeNull()
    expect(parseClockTime('25:00')).toBeNull()
    expect(parseClockTime('10:75')).toBeNull()
    expect(parseClockTime('1000')).toBeNull()
    // 13 o'clock cannot carry a meridiem.
    expect(parseClockTime('13:00PM')).toBeNull()
  })
})

describe('parseScheduleString', () => {
  it('expands a compound day code into one meeting per day', () => {
    const { meetings, status } = parseScheduleString('MW 10:00AM-12:00PM RM312')
    expect(status).toBe('ok')
    expect(days(meetings)).toEqual(['monday', 'wednesday'])
    for (const meeting of meetings) {
      expect(meeting.startTime).toBe('10:00')
      expect(meeting.endTime).toBe('12:00')
      expect(meeting.room).toBe('RM312')
      expect(meeting.parseStatus).toBe('ok')
    }
  })

  it('expands TTH, MWF and TTHS to one meeting per day', () => {
    expect(days(parseScheduleString('TTH 1:00-2:30PM RM101').meetings)).toEqual([
      'tuesday',
      'thursday',
    ])
    expect(days(parseScheduleString('MWF 8:00AM-9:00AM RM101').meetings)).toEqual([
      'monday',
      'wednesday',
      'friday',
    ])
    expect(days(parseScheduleString('TTHS 8:00AM-9:00AM RM101').meetings)).toEqual([
      'tuesday',
      'thursday',
      'saturday',
    ])
  })

  it('puts a TH class on Thursday inside a full schedule cell', () => {
    const { meetings } = parseScheduleString('TH 1:00-2:30PM RM101')
    expect(days(meetings)).toEqual(['thursday'])
    expect(meetings[0].startTime).toBe('13:00')
    expect(meetings[0].endTime).toBe('14:30')
  })

  it('puts a SUN class on Sunday inside a full schedule cell', () => {
    expect(days(parseScheduleString('SUN 8:00AM-11:00AM GYM').meetings)).toEqual(['sunday'])
  })

  it('substitutes TBA for a missing room and marks the cell partial', () => {
    const { meetings, status } = parseScheduleString('MW 10:00AM-12:00PM')
    expect(status).toBe('partial')
    expect(meetings).toHaveLength(2)
    expect(meetings.every((m) => m.room === 'TBA')).toBe(true)
  })

  it('ignores a prefix before " - " and uses only the final segment', () => {
    const withPrefix = parseScheduleString('LEC - MW 10:00AM-12:00PM RM312')
    const without = parseScheduleString('MW 10:00AM-12:00PM RM312')
    expect(withPrefix).toEqual(without)

    expect(days(parseScheduleString('LAB - TTH 1:00PM-4:00PM CL2').meetings)).toEqual([
      'tuesday',
      'thursday',
    ])
    expect(parseScheduleString('BSCS 3-1 - LEC - F 7:00AM-10:00AM RM204').meetings[0]).toMatchObject(
      { day: 'friday', startTime: '07:00', endTime: '10:00', room: 'RM204' },
    )
  })

  it('keeps the bare hyphen of the time range, which is not a segment separator', () => {
    const { meetings, status } = parseScheduleString('MW 10:00AM-12:00PM RM312')
    expect(status).toBe('ok')
    expect(meetings[0].startTime).toBe('10:00')
  })

  it('parses 10:00AM and 10:00 AM cells identically', () => {
    expect(parseScheduleString('MW 10:00AM-12:00PM RM312')).toEqual(
      parseScheduleString('MW 10:00 AM-12:00 PM RM312'),
    )
  })

  describe('a start time with no meridiem of its own', () => {
    /**
     * The start borrows the end's meridiem; if that reading runs backwards the
     * other reading is taken, because a class always moves forwards through the
     * day. `10:00-12:00PM` is morning-to-noon, `1:00-2:30PM` is afternoon.
     */
    it('resolves 10:00-12:00PM to 10:00–12:00', () => {
      const { meetings } = parseScheduleString('MW 10:00-12:00PM RM312')
      expect(meetings[0].startTime).toBe('10:00')
      expect(meetings[0].endTime).toBe('12:00')
    })

    it('resolves 1:00-2:30PM to 13:00–14:30', () => {
      const { meetings } = parseScheduleString('TTH 1:00-2:30PM RM101')
      expect(meetings[0].startTime).toBe('13:00')
      expect(meetings[0].endTime).toBe('14:30')
    })

    it('resolves 7:00-9:00AM to 07:00–09:00', () => {
      const { meetings } = parseScheduleString('MWF 7:00-9:00AM RM204')
      expect(meetings[0].startTime).toBe('07:00')
      expect(meetings[0].endTime).toBe('09:00')
    })

    it('resolves 11:00-1:00PM across noon', () => {
      const { meetings } = parseScheduleString('MW 11:00-1:00PM RM312')
      expect(meetings[0].startTime).toBe('11:00')
      expect(meetings[0].endTime).toBe('13:00')
    })
  })

  it('tolerates non-breaking spaces pasted out of the portal', () => {
    const nbsp = ' '
    const raw = `MW${nbsp}10:00AM-12:00PM${nbsp}RM312`
    expect(parseScheduleString(raw)).toEqual(parseScheduleString('MW 10:00AM-12:00PM RM312'))

    const prefixed = `LEC${nbsp}-${nbsp}TTH 1:00-2:30PM${nbsp}RM101`
    const { meetings, status } = parseScheduleString(prefixed)
    expect(status).toBe('ok')
    expect(days(meetings)).toEqual(['tuesday', 'thursday'])
    expect(meetings[0].room).toBe('RM101')
  })

  it('fails without throwing on a malformed cell', () => {
    for (const raw of [
      '',
      '   ',
      'TBA',
      'MW 10:00AM–12:00PM RM312', // en-dash instead of a hyphen
      'MW 10:00AM to 12:00PM RM312',
      'MW 1000-1200 RM312',
      'MW 25:00-26:00 RM312',
      'MW 10:00AM-10:00AM RM312', // zero-length meeting
      'MW 12:00PM-10:00AM RM312', // runs backwards
      'XYZ 10:00AM-12:00PM RM312', // unknown day code
    ]) {
      const result = parseScheduleString(raw)
      expect(result.status, raw).toBe('failed')
      expect(result.meetings, raw).toEqual([])
    }
  })
})

describe('parseRow', () => {
  it('builds a course from a well-formed row', () => {
    const { course, raw } = parseRow(row())
    expect(raw).toBeNull()
    expect(course).toMatchObject({
      code: 'CS 3105',
      title: 'Software Engineering',
      lecUnits: 3,
      labUnits: 0,
      units: 3,
      faculty: 'Dela Cruz, J.',
      rawSchedule: 'MW 10:00AM-12:00PM RM312',
      parseStatus: 'ok',
    })
    expect(course?.meetings).toHaveLength(2)
  })

  it('accepts an empty faculty cell as null', () => {
    expect(parseRow(row({ faculty: '' })).course?.faculty).toBeNull()
    expect(parseRow(row({ faculty: '   ' })).course?.faculty).toBeNull()
    expect(parseRow(row({ faculty: 'TBA' })).course?.faculty).toBeNull()
    expect(parseRow(row({ faculty: 'tba' })).course?.faculty).toBeNull()
  })

  it('preserves the raw schedule string when the meeting cannot be read', () => {
    const raw = 'MW 10:00AM to 12:00PM RM312'
    const { course } = parseRow(row({ schedule: raw }))
    expect(course?.parseStatus).toBe('failed')
    expect(course?.meetings).toEqual([])
    // The raw string is what lets the student fix it by hand and what lets a
    // later parser version be replayed against the same import.
    expect(course?.rawSchedule).toBe(raw)
  })

  it('flags a short row instead of throwing', () => {
    const short = ['1', 'CS 3105', 'Software Engineering']
    expect(() => parseRow(short)).not.toThrow()
    const { course, raw } = parseRow(short)
    expect(course).toBeNull()
    expect(raw).toEqual({ cells: short, reason: 'row_short' })
  })

  it('flags an entirely empty row', () => {
    const { course, raw } = parseRow(new Array<string>(8).fill(''))
    expect(course).toBeNull()
    expect(raw?.reason).toBe('empty_row')
  })

  it('falls back to lec + lab when the units column is blank', () => {
    const { course } = parseRow(row({ lec: '2', lab: '1', units: '' }))
    expect(course?.units).toBe(3)
  })

  it('strips non-breaking spaces from every cell it cleans', () => {
    const nbsp = ' '
    const { course } = parseRow(
      row({ code: `CS${nbsp}3105`, faculty: `Dela${nbsp}Cruz,${nbsp}J.` }),
    )
    expect(course?.code).toBe('CS 3105')
    expect(course?.faculty).toBe('Dela Cruz, J.')
  })
})

describe('parseScheduleTable', () => {
  it('stamps the parser version so an import can be replayed later', () => {
    expect(parseScheduleTable([row()]).parserVersion).toBe(PARSER_VERSION)
  })

  it('collects short rows as unparsed and warns without dropping the rest', () => {
    const result = parseScheduleTable([row(), ['1', 'CS 3106'], row({ code: 'CS 3107' })])
    expect(result.courses.map((c) => c.code)).toEqual(['CS 3105', 'CS 3107'])
    expect(result.unparsed).toHaveLength(1)
    expect(result.warnings.some((w) => w.code === 'row_short')).toBe(true)
  })

  it('warns about a missing room and about an unreadable schedule', () => {
    const result = parseScheduleTable([
      row({ code: 'CS 3105', schedule: 'MW 10:00AM-12:00PM' }),
      row({ code: 'CS 3106', schedule: 'MW 10:00AM to 12:00PM RM1' }),
    ])
    const missingRoom = result.warnings.find((w) => w.code === 'missing_room')
    const unparsed = result.warnings.find((w) => w.code === 'meeting_unparsed')
    expect(missingRoom?.courseCode).toBe('CS 3105')
    expect(unparsed?.courseCode).toBe('CS 3106')
    expect(unparsed?.message).toContain('MW 10:00AM to 12:00PM RM1')
    // Both courses still make it into the import.
    expect(result.courses).toHaveLength(2)
  })
})

describe('validateCourses', () => {
  function course(overrides: Partial<ParsedCourse>): ParsedCourse {
    return {
      code: 'CS 3105',
      title: 'Software Engineering',
      lecUnits: 3,
      labUnits: 0,
      units: 3,
      faculty: null,
      rawSchedule: '',
      meetings: [],
      parseStatus: 'ok',
      ...overrides,
    }
  }

  function meeting(day: ParsedMeeting['day'], start: string, end: string): ParsedMeeting {
    return { day, startTime: start, endTime: end, room: 'RM312', parseStatus: 'ok' }
  }

  it('flags overlapping blocks on the same day', () => {
    const warnings = validateCourses([
      course({ code: 'CS 3105', meetings: [meeting('monday', '10:00', '12:00')] }),
      course({ code: 'CS 3106', meetings: [meeting('monday', '11:00', '13:00')] }),
    ])
    const overlap = warnings.find((w) => w.code === 'overlapping_blocks')
    expect(overlap).toBeDefined()
    expect(overlap?.message).toContain('CS 3105')
    expect(overlap?.message).toContain('CS 3106')
    expect(overlap?.message).toContain('monday')
  })

  it('does not flag back-to-back blocks or blocks on different days', () => {
    const warnings = validateCourses([
      course({ code: 'CS 3105', meetings: [meeting('monday', '10:00', '12:00')] }),
      course({ code: 'CS 3106', meetings: [meeting('monday', '12:00', '14:00')] }),
      course({ code: 'CS 3107', meetings: [meeting('tuesday', '10:00', '12:00')] }),
    ])
    expect(warnings.filter((w) => w.code === 'overlapping_blocks')).toEqual([])
  })

  it('flags an implausible unit total at both ends', () => {
    const heavy = validateCourses([course({ units: 45 })])
    expect(heavy.some((w) => w.code === 'unit_total_implausible')).toBe(true)
    expect(heavy[0].message).toContain('45')

    const empty = validateCourses([course({ units: 0 })])
    expect(empty.some((w) => w.code === 'unit_total_implausible')).toBe(true)
  })

  it('says nothing about a normal load', () => {
    expect(validateCourses([course({ units: 3 }), course({ code: 'CS 3106', units: 3 })])).toEqual(
      [],
    )
  })

  it('says nothing at all when there are no courses', () => {
    expect(validateCourses([])).toEqual([])
  })

  /**
   * Some real enrollments legitimately overlap. Refusing the import would be
   * worse than showing the student what looks odd, so these stay warnings.
   */
  it('warns without rejecting: the overlapping courses survive the import', () => {
    const result = parseScheduleTable([
      row({ code: 'CS 3105', schedule: 'MW 10:00AM-12:00PM RM312', units: '30' }),
      row({ code: 'CS 3106', schedule: 'MW 11:00AM-1:00PM RM313', units: '30' }),
    ])
    expect(result.courses).toHaveLength(2)
    expect(result.courses.every((c) => c.parseStatus === 'ok')).toBe(true)
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['unit_total_implausible', 'overlapping_blocks']),
    )
  })
})
