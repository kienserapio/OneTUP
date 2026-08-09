/**
 * ERS schedule parsing.
 *
 * The portal renders a schedule as an HTML table whose last column packs day,
 * time range and room into one string. This module turns that string, and a
 * whole row, into structured meetings.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 *   1. Day-code matching must test the longest code first. `T` matched before
 *      `TH` reads every Thursday class as Tuesday — a silent, whole-semester
 *      error that no student would think to check.
 *   2. Nothing throws. A row that cannot be read comes back with
 *      `parseStatus: 'failed'` and its raw string intact, so the student can
 *      correct it by hand and a later parser version can re-run against it.
 */

import type { TimeOfDay, Weekday } from '../time'
import { fromMinutes, isTimeOfDay } from '../time'

export type ParseStatus = 'ok' | 'partial' | 'failed'

export interface ParsedMeeting {
  day: Weekday
  startTime: TimeOfDay
  endTime: TimeOfDay
  room: string
  parseStatus: ParseStatus
}

export interface ParsedCourse {
  code: string
  title: string
  lecUnits: number
  labUnits: number
  units: number
  faculty: string | null
  rawSchedule: string
  meetings: ParsedMeeting[]
  parseStatus: ParseStatus
}

export interface RawRow {
  cells: string[]
  reason: string
}

export interface ScheduleParseResult {
  parserVersion: string
  courses: ParsedCourse[]
  unparsed: RawRow[]
  warnings: ParseWarning[]
}

export interface ParseWarning {
  code:
    | 'overlapping_blocks'
    | 'unit_total_implausible'
    | 'missing_room'
    | 'meeting_unparsed'
    | 'row_short'
  message: string
  courseCode?: string
}

export const PARSER_VERSION = 'ers-sched-1.2.0'

/**
 * Column indices live in configuration rather than in the code, so a layout
 * change on the portal is an edit here plus a version bump — not a redeploy of
 * parsing logic. `07-AUTH-ERS.md` §4.5.
 */
export interface ParserConfig {
  version: string
  columns: {
    code: number
    title: number
    lec: number
    lab: number
    units: number
    faculty: number
    schedule: number
  }
  minimumCells: number
}

export const DEFAULT_PARSER_CONFIG: ParserConfig = {
  version: PARSER_VERSION,
  columns: { code: 1, title: 2, lec: 3, lab: 4, units: 5, faculty: 6, schedule: 7 },
  minimumCells: 8,
}

/**
 * Day codes, longest first. The order of this array is the guarantee — see the
 * note at the top of the file. Multi-day codes come before single-day ones so
 * `TTH` never degrades into `T` + junk.
 */
const DAY_CODES: ReadonlyArray<readonly [string, Weekday[]]> = [
  ['MWF', ['monday', 'wednesday', 'friday']],
  ['TTHS', ['tuesday', 'thursday', 'saturday']],
  ['MTWTHF', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']],
  ['TTH', ['tuesday', 'thursday']],
  ['MTH', ['monday', 'thursday']],
  ['WTH', ['wednesday', 'thursday']],
  ['THS', ['thursday', 'saturday']],
  ['SUN', ['sunday']],
  ['MW', ['monday', 'wednesday']],
  ['MF', ['monday', 'friday']],
  ['WF', ['wednesday', 'friday']],
  ['TF', ['tuesday', 'friday']],
  ['TS', ['tuesday', 'saturday']],
  ['MS', ['monday', 'saturday']],
  ['TH', ['thursday']],
  ['M', ['monday']],
  ['T', ['tuesday']],
  ['W', ['wednesday']],
  ['F', ['friday']],
  ['S', ['saturday']],
  ['U', ['sunday']],
]

/**
 * Expands a day code into the days it covers. Returns null when the code is not
 * recognised, rather than guessing at the nearest match.
 */
export function parseDayCode(code: string): Weekday[] | null {
  const normalised = code.trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (!normalised) return null

  // Exact match first — this is the common case and the only unambiguous one.
  for (const [pattern, days] of DAY_CODES) {
    if (normalised === pattern) return [...days]
  }

  // Otherwise consume the string greedily, longest code first. This handles
  // concatenations the portal produces that are not in the table above.
  const days: Weekday[] = []
  let rest = normalised
  while (rest.length > 0) {
    const match = DAY_CODES.find(([pattern]) => rest.startsWith(pattern))
    if (!match) return null
    for (const day of match[1]) if (!days.includes(day)) days.push(day)
    rest = rest.slice(match[0].length)
  }
  return days.length ? days : null
}

const TIME_TOKEN = /^(\d{1,2})(?::(\d{2}))?\s*([AP]\.?M\.?)?$/i

/**
 * Parses one side of a time range. Handles `10:00AM`, `10:00 AM`, `10AM`, and
 * bare `13:00`. Returns null rather than a plausible-looking guess.
 */
export function parseClockTime(token: string, meridiemHint?: 'AM' | 'PM'): TimeOfDay | null {
  const m = TIME_TOKEN.exec(token.trim())
  if (!m) return null

  let hour = Number(m[1])
  const minute = m[2] ? Number(m[2]) : 0
  const meridiem = (m[3]?.replace(/\./g, '').toUpperCase() as 'AM' | 'PM' | undefined) ?? meridiemHint

  if (minute > 59) return null

  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (meridiem === 'AM') hour = hour === 12 ? 0 : hour
    else hour = hour === 12 ? 12 : hour + 12
  } else if (hour > 23) {
    return null
  }

  return fromMinutes(hour * 60 + minute)
}

export interface ParsedScheduleString {
  meetings: ParsedMeeting[]
  status: ParseStatus
}

const SCHEDULE_PATTERN = /^([A-Za-z]+)\s+([\d:]+\s*[APap]?\.?[Mm]?\.?\s*-\s*[\d:]+\s*[APap]?\.?[Mm]?\.?)\s*(.*)$/

/**
 * Parses the compound schedule cell, e.g. `LEC - MW 10:00AM-12:00PM RM312`.
 *
 * The cell sometimes carries a prefix (`LEC`, `LAB`, a section label) separated
 * by ` - `. Only the final segment describes the meeting, so everything before
 * the last separator is discarded.
 */
export function parseScheduleString(raw: string): ParsedScheduleString {
  const text = raw.replace(/\u00a0/g, ' ').trim()
  if (!text) return { meetings: [], status: 'failed' }

  // Take the final ` - ` segment, but only when the separator is surrounded by
  // whitespace — a bare hyphen is the time-range separator and must survive.
  const segments = text.split(/\s+-\s+/)
  const candidate = segments[segments.length - 1].trim()

  const match = SCHEDULE_PATTERN.exec(candidate)
  if (!match) return { meetings: [], status: 'failed' }

  const [, dayToken, rangeToken, roomToken] = match

  const days = parseDayCode(dayToken)
  if (!days) return { meetings: [], status: 'failed' }

  const range = splitTimeRange(rangeToken)
  if (!range) return { meetings: [], status: 'failed' }

  const room = roomToken.trim() || 'TBA'
  const meetings: ParsedMeeting[] = days.map((day) => ({
    day,
    startTime: range.start,
    endTime: range.end,
    room,
    parseStatus: 'ok' as const,
  }))

  return { meetings, status: room === 'TBA' ? 'partial' : 'ok' }
}

const MERIDIEM = /[AP]\.?M\.?/i

function splitTimeRange(range: string): { start: TimeOfDay; end: TimeOfDay } | null {
  const parts = range.split('-')
  if (parts.length !== 2) return null

  const end = parseClockTime(parts[1])
  if (!end) return null

  let start: TimeOfDay | null
  if (MERIDIEM.test(parts[0])) {
    start = parseClockTime(parts[0])
  } else if (MERIDIEM.test(parts[1])) {
    // `1:00-2:30PM` and `10:00-12:00PM` both omit the start's meridiem. Borrow
    // the end's, and if that reading runs backwards, take the other one — a
    // class always moves forwards through the day.
    const hint = /P/i.test(parts[1]) ? 'PM' : 'AM'
    const borrowed = parseClockTime(parts[0], hint)
    const opposite = parseClockTime(parts[0], hint === 'PM' ? 'AM' : 'PM')
    start = borrowed && borrowed < end ? borrowed : (opposite ?? borrowed)
  } else {
    start = parseClockTime(parts[0])
  }

  if (!start || start >= end) return null
  return { start, end }
}

function toNumber(value: string | undefined): number {
  const n = Number.parseFloat((value ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function clean(value: string | undefined): string {
  return (value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Turns one table row into a course, or explains why it could not. */
export function parseRow(
  cells: string[],
  config: ParserConfig = DEFAULT_PARSER_CONFIG,
): { course: ParsedCourse | null; raw: RawRow | null } {
  if (cells.length < config.minimumCells) {
    return { course: null, raw: { cells, reason: 'row_short' } }
  }

  const { columns } = config
  const code = clean(cells[columns.code])
  const title = clean(cells[columns.title])
  const rawSchedule = clean(cells[columns.schedule])

  if (!code && !title) {
    return { course: null, raw: { cells, reason: 'empty_row' } }
  }

  const parsed = parseScheduleString(rawSchedule)
  const facultyRaw = clean(cells[columns.faculty])
  const faculty = !facultyRaw || /^tba$/i.test(facultyRaw) ? null : facultyRaw

  const lecUnits = toNumber(cells[columns.lec])
  const labUnits = toNumber(cells[columns.lab])
  const declaredUnits = toNumber(cells[columns.units])

  const course: ParsedCourse = {
    code,
    title,
    lecUnits,
    labUnits,
    units: declaredUnits || lecUnits + labUnits,
    faculty,
    rawSchedule,
    meetings: parsed.meetings,
    parseStatus: parsed.status === 'failed' ? 'failed' : parsed.status,
  }

  return { course, raw: null }
}

export interface ParseTableOptions {
  config?: ParserConfig
}

/** Parses a full set of rows and collects the warnings the review step shows. */
export function parseScheduleTable(
  rows: string[][],
  options: ParseTableOptions = {},
): ScheduleParseResult {
  const config = options.config ?? DEFAULT_PARSER_CONFIG
  const courses: ParsedCourse[] = []
  const unparsed: RawRow[] = []
  const warnings: ParseWarning[] = []

  for (const cells of rows) {
    const { course, raw } = parseRow(cells, config)
    if (raw) {
      unparsed.push(raw)
      warnings.push({
        code: 'row_short',
        message: `A row had ${raw.cells.length} columns and could not be read.`,
      })
      continue
    }
    if (!course) continue

    if (course.parseStatus === 'failed') {
      warnings.push({
        code: 'meeting_unparsed',
        courseCode: course.code,
        message: `The schedule for ${course.code || 'a course'} could not be read: "${course.rawSchedule}".`,
      })
    } else if (course.meetings.some((m) => m.room === 'TBA')) {
      warnings.push({
        code: 'missing_room',
        courseCode: course.code,
        message: `${course.code} has no room listed.`,
      })
    }

    courses.push(course)
  }

  warnings.push(...validateCourses(courses))

  return { parserVersion: config.version, courses, unparsed, warnings }
}

/**
 * Cross-row validation. Overlaps are flagged rather than rejected: some real
 * enrollments legitimately overlap, and refusing the import would be worse than
 * showing the student what looks odd.
 */
export function validateCourses(courses: ParsedCourse[]): ParseWarning[] {
  const warnings: ParseWarning[] = []

  const totalUnits = courses.reduce((sum, c) => sum + c.units, 0)
  if (courses.length > 0 && (totalUnits < 1 || totalUnits > 40)) {
    warnings.push({
      code: 'unit_total_implausible',
      message: `Total units came to ${totalUnits}, which looks wrong. Check the unit columns.`,
    })
  }

  const byDay = new Map<Weekday, { code: string; start: number; end: number }[]>()
  for (const course of courses) {
    for (const meeting of course.meetings) {
      if (!isTimeOfDay(meeting.startTime) || !isTimeOfDay(meeting.endTime)) continue
      const list = byDay.get(meeting.day) ?? []
      list.push({
        code: course.code,
        start: Number(meeting.startTime.replace(':', '')),
        end: Number(meeting.endTime.replace(':', '')),
      })
      byDay.set(meeting.day, list)
    }
  }

  for (const [day, blocks] of byDay) {
    const sorted = [...blocks].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        warnings.push({
          code: 'overlapping_blocks',
          courseCode: sorted[i].code,
          message: `${sorted[i - 1].code} and ${sorted[i].code} overlap on ${day}.`,
        })
      }
    }
  }

  return warnings
}
