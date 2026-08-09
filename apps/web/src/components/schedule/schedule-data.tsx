'use client'

import {
  DEFAULT_DAY_BOUNDS,
  WEEKDAYS,
  addDays,
  manilaDate,
  toMinutes,
  type Course,
  type DateOnly,
  type DayBounds,
  type Enrollment,
  type ScheduleBlock,
  type ScheduleBlockRow,
  type UserPreferences,
  type Weekday,
} from '@onetup/core'
import { readAll } from '@/lib/offline/db'

/**
 * The schedule read model.
 *
 * Every schedule screen assembles itself from this and nothing else: IndexedDB,
 * no network on the render path. A student walking between buildings with no
 * signal gets the whole timetable, not a spinner (TDD §2.3).
 */

export interface ScheduleBlockView extends ScheduleBlock {
  courseTitle: string | null
  faculty: string | null
  promptAttendance: boolean
  units: number
}

export interface ScheduleSnapshot {
  blocks: ScheduleBlockView[]
  bounds: DayBounds
  /** Week order, honouring the student's week-start preference. */
  weekOrder: Weekday[]
}

export async function loadSchedule(): Promise<ScheduleSnapshot> {
  const [blockRows, enrollments, courses, prefsRows] = await Promise.all([
    readAll<ScheduleBlockRow & { id: string }>('schedule_blocks'),
    readAll<Enrollment & { id: string }>('enrollments'),
    readAll<Course & { id: string }>('courses'),
    readAll<UserPreferences & { id: string }>('user_preferences'),
  ])

  const courseById = new Map(courses.map((course) => [course.id, course]))
  const enrollmentById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]))

  const blocks: ScheduleBlockView[] = blockRows.map((row) => {
    const enrollment = row.enrollment_id ? enrollmentById.get(row.enrollment_id) : undefined
    const course = enrollment ? courseById.get(enrollment.course_id) : undefined
    return {
      id: row.id,
      enrollmentId: row.enrollment_id,
      label: course?.code ?? row.title ?? 'Untitled',
      title: course?.title ?? row.title ?? null,
      day: row.day as Weekday,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      room: row.room,
      source: row.source as ScheduleBlock['source'],
      colorKey: enrollment?.color_key ?? null,
      courseTitle: course?.title ?? null,
      faculty: enrollment?.faculty_name ?? null,
      promptAttendance: row.prompt_attendance,
      units: Number(course?.units ?? 0),
    }
  })

  const preferences = prefsRows[0] ?? null

  return {
    blocks,
    bounds: {
      dayStart: preferences?.day_start?.slice(0, 5) ?? DEFAULT_DAY_BOUNDS.dayStart,
      dayEnd: preferences?.day_end?.slice(0, 5) ?? DEFAULT_DAY_BOUNDS.dayEnd,
    },
    weekOrder: weekOrderFrom(preferences?.week_starts_monday ?? true),
  }
}

export function weekOrderFrom(startsMonday: boolean): Weekday[] {
  const offset = startsMonday ? 1 : 0
  return Array.from({ length: 7 }, (_, index) => WEEKDAYS[(index + offset) % 7])
}

/** The calendar date each weekday falls on in the week containing `date`. */
export function weekDates(date: DateOnly, order: readonly Weekday[]): Record<Weekday, DateOnly> {
  const firstIndex = WEEKDAYS.indexOf(order[0])
  const currentIndex = WEEKDAYS.indexOf(weekdayOfDate(date))
  const sinceStart = (currentIndex - firstIndex + 7) % 7
  const start = addDays(date, -sinceStart)

  const dates = {} as Record<Weekday, DateOnly>
  order.forEach((day, position) => {
    dates[day] = addDays(start, position)
  })
  return dates
}

export function weekdayOfDate(date: DateOnly): Weekday {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

export function todayDate(now = new Date()): DateOnly {
  return manilaDate(now)
}

// --- Colour ---------------------------------------------------------------

/**
 * Course tints, drawn from the iOS system palette already in the tokens.
 *
 * Red and pink are deliberately absent: `--danger` and the crimson accent own
 * that end of the spectrum, and a subject tinted like a warning reads as one.
 */
const TINT_VARS = [
  '--ios-blue',
  '--ios-indigo',
  '--ios-purple',
  '--ios-teal',
  '--ios-green',
  '--ios-orange',
  '--ios-cyan',
  '--ios-mint',
  '--ios-brown',
  '--ios-yellow',
] as const

export function tintOf(colorKey: number | null | undefined): string {
  if (colorKey === null || colorKey === undefined) return 'var(--ios-gray)'
  const index = ((colorKey % TINT_VARS.length) + TINT_VARS.length) % TINT_VARS.length
  return `var(${TINT_VARS[index]})`
}

/** The same hue at fill strength, so text on top keeps its contrast. */
export function tintFill(colorKey: number | null | undefined, percent: number): string {
  return `color-mix(in srgb, ${tintOf(colorKey)} ${percent}%, transparent)`
}

// --- Layout ---------------------------------------------------------------

export interface PositionedBlock {
  block: ScheduleBlockView
  startMinutes: number
  endMinutes: number
  /** Column within its overlap cluster, and how many columns that cluster has. */
  column: number
  columns: number
}

/**
 * Places a day's blocks, splitting overlaps side by side.
 *
 * Overlapping enrollments are legitimate and must not be hidden (TDD §3.2), so
 * a clash is drawn as two narrower blocks rather than one stacked on the other.
 */
export function layoutDay(blocks: readonly ScheduleBlockView[]): PositionedBlock[] {
  const sorted = [...blocks].sort(
    (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime),
  )

  const placed: PositionedBlock[] = []
  let cluster: PositionedBlock[] = []
  let clusterEnd = -1
  let columnEnds: number[] = []

  const flush = () => {
    const columns = cluster.reduce((most, item) => Math.max(most, item.column + 1), 1)
    for (const item of cluster) placed.push({ ...item, columns })
    cluster = []
    columnEnds = []
  }

  for (const block of sorted) {
    const startMinutes = toMinutes(block.startTime)
    const endMinutes = toMinutes(block.endTime)

    if (cluster.length > 0 && startMinutes >= clusterEnd) flush()

    let column = columnEnds.findIndex((end) => end <= startMinutes)
    if (column === -1) column = columnEnds.length
    columnEnds[column] = endMinutes

    cluster.push({ block, startMinutes, endMinutes, column, columns: 1 })
    clusterEnd = Math.max(clusterEnd, endMinutes)
  }

  if (cluster.length > 0) flush()
  return placed
}

// --- Formatting -----------------------------------------------------------

export function formatDayDate(date: DateOnly): string {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
}

export function dayOfMonth(date: DateOnly): string {
  return String(Number(date.slice(8, 10)))
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
