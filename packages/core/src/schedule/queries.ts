/**
 * Derived schedule queries.
 *
 * M1 is the keystone: every other module asks it *what is happening now*, *what
 * is next*, *what is on day D*, and *where are the free blocks*. Those four
 * questions live here, as pure functions over an already-loaded block list, so
 * they answer identically online and offline.
 */

import type { DateOnly, TimeOfDay, Weekday } from '../time'
import {
  WEEKDAYS,
  addDays,
  manilaDate,
  manilaMinutes,
  manilaWeekday,
  toMinutes,
  weekdayOf,
} from '../time'

export interface ScheduleBlock {
  id: string
  enrollmentId: string | null
  /** Course code for imported blocks, free text for manual ones. */
  label: string
  title?: string | null
  day: Weekday
  startTime: TimeOfDay
  endTime: TimeOfDay
  room: string | null
  source: 'ers_import' | 'manual' | 'paste' | 'announcement'
  colorKey?: number | null
}

export interface FreeBlock {
  day: Weekday
  startTime: TimeOfDay
  endTime: TimeOfDay
  minutes: number
  /** What the gap sits between; null at the ends of the day. */
  after: string | null
  before: string | null
}

export interface DayBounds {
  dayStart: TimeOfDay
  dayEnd: TimeOfDay
}

export const DEFAULT_DAY_BOUNDS: DayBounds = { dayStart: '07:00', dayEnd: '21:00' }

function byStart(a: ScheduleBlock, b: ScheduleBlock): number {
  return toMinutes(a.startTime) - toMinutes(b.startTime)
}

/** Blocks on one weekday, in order. */
export function blocksOnDay(blocks: readonly ScheduleBlock[], day: Weekday): ScheduleBlock[] {
  return blocks.filter((b) => b.day === day).sort(byStart)
}

/** The block happening right now, or null between classes. */
export function blockNow(
  blocks: readonly ScheduleBlock[],
  now: Date = new Date(),
): ScheduleBlock | null {
  const minutes = manilaMinutes(now)
  const today = manilaWeekday(now)
  return (
    blocksOnDay(blocks, today).find(
      (b) => toMinutes(b.startTime) <= minutes && minutes < toMinutes(b.endTime),
    ) ?? null
  )
}

export interface NextBlock {
  block: ScheduleBlock
  /** The Manila date the block falls on — today, or the next day with classes. */
  date: DateOnly
  minutesUntil: number
  isToday: boolean
}

/**
 * The next class. Looks past today when the day is done, up to a week ahead, so
 * a Friday evening open still answers "what's next" with Monday's first class.
 */
export function nextBlock(
  blocks: readonly ScheduleBlock[],
  now: Date = new Date(),
): NextBlock | null {
  const minutes = manilaMinutes(now)
  const today = manilaWeekday(now)
  const todayDate = manilaDate(now)

  const laterToday = blocksOnDay(blocks, today).find((b) => toMinutes(b.startTime) > minutes)
  if (laterToday) {
    return {
      block: laterToday,
      date: todayDate,
      minutesUntil: toMinutes(laterToday.startTime) - minutes,
      isToday: true,
    }
  }

  for (let offset = 1; offset <= 7; offset++) {
    const date = addDays(todayDate, offset)
    const dayBlocks = blocksOnDay(blocks, weekdayOf(date))
    if (dayBlocks.length === 0) continue
    const block = dayBlocks[0]
    return {
      block,
      date,
      minutesUntil: offset * 1440 - minutes + toMinutes(block.startTime),
      isToday: false,
    }
  }

  return null
}

/**
 * Gaps of at least `minimumMinutes` on a day, including the lead-in from the
 * configured day start and the tail out to the day end. Used by the study
 * scheduler, the assistant, and group coordination.
 */
export function freeBlocks(
  blocks: readonly ScheduleBlock[],
  day: Weekday,
  minimumMinutes = 30,
  bounds: DayBounds = DEFAULT_DAY_BOUNDS,
): FreeBlock[] {
  const dayBlocks = blocksOnDay(blocks, day)
  const start = toMinutes(bounds.dayStart)
  const end = toMinutes(bounds.dayEnd)

  const gaps: FreeBlock[] = []
  let cursor = start
  let previousLabel: string | null = null

  for (const block of dayBlocks) {
    const blockStart = toMinutes(block.startTime)
    const blockEnd = toMinutes(block.endTime)

    if (blockStart > cursor) {
      gaps.push(makeGap(day, cursor, Math.min(blockStart, end), previousLabel, block.label))
    }
    cursor = Math.max(cursor, blockEnd)
    previousLabel = block.label
    if (cursor >= end) break
  }

  if (cursor < end) {
    gaps.push(makeGap(day, cursor, end, previousLabel, null))
  }

  return gaps.filter((g) => g.minutes >= minimumMinutes)
}

function makeGap(
  day: Weekday,
  startMinutes: number,
  endMinutes: number,
  after: string | null,
  before: string | null,
): FreeBlock {
  return {
    day,
    startTime: formatMinutes(startMinutes),
    endTime: formatMinutes(endMinutes),
    minutes: endMinutes - startMinutes,
    after,
    before,
  }
}

function formatMinutes(minutes: number): TimeOfDay {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Scheduled minutes per weekday — the shape of a student's week at a glance. */
export function weekLoad(blocks: readonly ScheduleBlock[]): Record<Weekday, number> {
  const load = Object.fromEntries(WEEKDAYS.map((d) => [d, 0])) as Record<Weekday, number>
  for (const block of blocks) {
    load[block.day] += toMinutes(block.endTime) - toMinutes(block.startTime)
  }
  return load
}

/** Days that carry at least one block, in week order starting Monday. */
export function classDays(blocks: readonly ScheduleBlock[]): Weekday[] {
  const order: Weekday[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ]
  const present = new Set(blocks.map((b) => b.day))
  return order.filter((d) => present.has(d))
}

/**
 * The next date on or after `from` that has classes. The departure planner's
 * entry point — there is no plan for a day with nothing to get to.
 */
export function nextClassDay(
  blocks: readonly ScheduleBlock[],
  from: DateOnly,
  lookaheadDays = 14,
): { date: DateOnly; blocks: ScheduleBlock[] } | null {
  for (let offset = 0; offset <= lookaheadDays; offset++) {
    const date = addDays(from, offset)
    const dayBlocks = blocksOnDay(blocks, weekdayOf(date))
    if (dayBlocks.length > 0) return { date, blocks: dayBlocks }
  }
  return null
}

// --- Re-sync diff ---------------------------------------------------------

export type ScheduleChangeKind =
  | 'course_added'
  | 'course_removed'
  | 'room_change'
  | 'time_change'
  | 'day_change'
  | 'faculty_change'

export interface ScheduleChange {
  kind: ScheduleChangeKind
  courseCode: string
  blockId?: string
  from?: string
  to?: string
  detail: string
}

export interface DiffCourse {
  code: string
  title: string
  faculty: string | null
  meetings: { day: Weekday; startTime: TimeOfDay; endTime: TimeOfDay; room: string }[]
}

export interface CommittedCourse extends DiffCourse {
  blockIds: string[]
}

/**
 * Compares a fresh import against what is committed.
 *
 * Every change is presented for individual accept or reject — a dropped course
 * especially, because removing it cascades into attendance and grades the
 * student has already recorded.
 */
export function diffSchedule(
  committed: readonly CommittedCourse[],
  incoming: readonly DiffCourse[],
): ScheduleChange[] {
  const changes: ScheduleChange[] = []
  const committedByCode = new Map(committed.map((c) => [c.code, c]))
  const incomingByCode = new Map(incoming.map((c) => [c.code, c]))

  for (const course of incoming) {
    if (!committedByCode.has(course.code)) {
      changes.push({
        kind: 'course_added',
        courseCode: course.code,
        detail: `Added: ${course.code}${course.title ? ` — ${course.title}` : ''}`,
      })
    }
  }

  for (const course of committed) {
    if (!incomingByCode.has(course.code)) {
      changes.push({
        kind: 'course_removed',
        courseCode: course.code,
        detail: `Removed: ${course.code}. Your attendance and grades for it would go too.`,
      })
    }
  }

  for (const course of incoming) {
    const existing = committedByCode.get(course.code)
    if (!existing) continue

    if ((existing.faculty ?? '') !== (course.faculty ?? '')) {
      changes.push({
        kind: 'faculty_change',
        courseCode: course.code,
        from: existing.faculty ?? 'none',
        to: course.faculty ?? 'none',
        detail: `${course.code} is now taught by ${course.faculty ?? 'nobody listed'}`,
      })
    }

    for (const meeting of course.meetings) {
      const sameDay = existing.meetings.find((m) => m.day === meeting.day)
      if (!sameDay) {
        changes.push({
          kind: 'day_change',
          courseCode: course.code,
          to: meeting.day,
          detail: `${course.code} now also meets on ${meeting.day}`,
        })
        continue
      }
      if (sameDay.room !== meeting.room) {
        changes.push({
          kind: 'room_change',
          courseCode: course.code,
          from: sameDay.room,
          to: meeting.room,
          detail: `${course.code} moved from ${sameDay.room} to ${meeting.room}`,
        })
      }
      if (sameDay.startTime !== meeting.startTime || sameDay.endTime !== meeting.endTime) {
        changes.push({
          kind: 'time_change',
          courseCode: course.code,
          from: `${sameDay.startTime}–${sameDay.endTime}`,
          to: `${meeting.startTime}–${meeting.endTime}`,
          detail: `${course.code} now runs ${meeting.startTime}–${meeting.endTime} on ${meeting.day}`,
        })
      }
    }

    for (const meeting of existing.meetings) {
      if (!course.meetings.some((m) => m.day === meeting.day)) {
        changes.push({
          kind: 'day_change',
          courseCode: course.code,
          from: meeting.day,
          detail: `${course.code} no longer meets on ${meeting.day}`,
        })
      }
    }
  }

  return changes
}
