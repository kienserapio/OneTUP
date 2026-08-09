'use client'

import {
  type ScheduleBlock,
  type Weekday,
  blockNow,
  blocksOnDay,
  freeBlocks,
  manilaDate,
  manilaMinutes,
  manilaWeekday,
  nextBlock,
  summariseAttendance,
  urgencyOf,
} from '@onetup/core'
import type {
  AttendanceRecord,
  Course,
  Deadline,
  Enrollment,
  ScheduleBlockRow,
  UserPreferences,
} from '@onetup/core'
import { readAll } from '@/lib/offline/db'

/**
 * Assembles the Today view from the local store.
 *
 * Everything here runs against IndexedDB with no network on the path. The whole
 * screen exists to answer one question — what do I need to know today? — and it
 * has to answer it in a corridor with no signal, in under half a second.
 */

export interface CourseBlock extends ScheduleBlock {
  courseTitle: string | null
  faculty: string | null
  units: number
}

export interface AttendanceGap {
  block: CourseBlock
  date: string
}

export interface TodayData {
  date: string
  weekday: Weekday
  blocks: CourseBlock[]
  now: CourseBlock | null
  next: { block: CourseBlock; date: string; minutesUntil: number; isToday: boolean } | null
  /** Today's classes with no attendance recorded and whose end time has passed. */
  pendingAttendance: CourseBlock[]
  /** Unrecorded classes from the previous 7 days. */
  catchUp: AttendanceGap[]
  dueSoon: Deadline[]
  overdue: Deadline[]
  gaps: ReturnType<typeof freeBlocks>
  /** Courses at or past the caution threshold, worth surfacing unprompted. */
  attendanceWarnings: { code: string; remaining: number; state: string }[]
  preferences: UserPreferences | null
}

export async function loadToday(now = new Date()): Promise<TodayData> {
  const [blockRows, enrollments, courses, attendance, deadlines, prefsRows] = await Promise.all([
    readAll<ScheduleBlockRow & { id: string }>('schedule_blocks'),
    readAll<Enrollment & { id: string }>('enrollments'),
    readAll<Course & { id: string }>('courses'),
    readAll<AttendanceRecord & { id: string }>('attendance_records'),
    readAll<Deadline & { id: string }>('deadlines'),
    readAll<UserPreferences & { id: string }>('user_preferences'),
  ])

  const courseById = new Map(courses.map((c) => [c.id, c]))
  const enrollmentById = new Map(enrollments.map((e) => [e.id, e]))

  const blocks: CourseBlock[] = blockRows.map((row) => {
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
      units: Number(course?.units ?? 0),
    }
  })

  const today = manilaDate(now)
  const weekday = manilaWeekday(now)
  const todayBlocks = blocksOnDay(blocks, weekday) as CourseBlock[]

  const recorded = new Set(
    attendance.map((record) => `${record.block_id ?? ''}|${record.session_date}`),
  )

  const currentMinutes = manilaMinutes(now)

  const pendingAttendance = todayBlocks.filter(
    (block) =>
      block.enrollmentId &&
      toMinutes(block.endTime) <= currentMinutes &&
      !recorded.has(`${block.id}|${today}`),
  )

  const catchUp: AttendanceGap[] = []
  for (let offset = 1; offset <= 7; offset++) {
    const date = shiftDate(today, -offset)
    const day = weekdayOfDate(date)
    for (const block of blocksOnDay(blocks, day) as CourseBlock[]) {
      if (!block.enrollmentId) continue
      if (recorded.has(`${block.id}|${date}`)) continue
      catchUp.push({ block, date })
    }
  }

  const openDeadlines = deadlines.filter((d) => d.status === 'open')
  const dueSoon = openDeadlines
    .filter((d) => {
      const urgency = urgencyOf({ dueAt: d.due_at, status: 'open' }, now)
      return urgency === 'critical' || urgency === 'urgent'
    })
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))

  const overdue = openDeadlines
    .filter((d) => urgencyOf({ dueAt: d.due_at, status: 'open' }, now) === 'overdue')
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))

  const preferences = prefsRows[0] ?? null

  const attendanceWarnings = enrollments
    .map((enrollment) => {
      const records = attendance.filter((r) => r.enrollment_id === enrollment.id)
      const counts = {
        present: records.filter((r) => r.status === 'present').length,
        absent: records.filter((r) => r.status === 'absent').length,
        late: records.filter((r) => r.status === 'late').length,
        excused: records.filter((r) => r.status === 'excused').length,
      }
      const summary = summariseAttendance(counts, {
        allowedAbsences: enrollment.allowed_absences ?? preferences?.default_allowed_absences ?? 5,
        latesPerAbsence: enrollment.lates_per_absence ?? preferences?.lates_per_absence ?? 3,
      })
      const course = courseById.get(enrollment.course_id)
      return { code: course?.code ?? '—', remaining: summary.remaining, state: summary.state }
    })
    .filter((warning) => warning.state !== 'normal')

  return {
    date: today,
    weekday,
    blocks: todayBlocks,
    now: (blockNow(blocks, now) as CourseBlock | null) ?? null,
    next: nextBlock(blocks, now) as TodayData['next'],
    pendingAttendance,
    catchUp,
    dueSoon,
    overdue,
    gaps: freeBlocks(blocks, weekday, 30, {
      dayStart: preferences?.day_start?.slice(0, 5) ?? '07:00',
      dayEnd: preferences?.day_end?.slice(0, 5) ?? '21:00',
    }),
    attendanceWarnings,
    preferences,
  }
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const WEEK: Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

function weekdayOfDate(date: string): Weekday {
  return WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()]
}
