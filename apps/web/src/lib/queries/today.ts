'use client'

import {
  DEFAULT_ALLOWED_ABSENCES,
  DEFAULT_LATES_PER_ABSENCE,
  type ScheduleBlock,
  type Weekday,
  blockNow,
  blocksOnDay,
  computeGwa,
  freeBlocks,
  manilaDate,
  manilaMinutes,
  manilaWeekday,
  nextBlock,
  summariseAttendance,
  urgencyOf,
} from '@onetup/core'
import type {
  Announcement,
  NonNumericMark,
  AttendanceRecord,
  Course,
  Deadline,
  Enrollment,
  Grade,
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

/**
 * Where a subject stands on cuts, at the moment a student is being asked to
 * answer for one of its sessions.
 *
 * It travels with the prompt rather than being looked up by the card, because
 * the whole point is that the consequence is visible *before* the tap: "Absent"
 * means something different at 0 of 9 than it does at 8 of 9, and a card that
 * does not say which one you are on is asking for an answer without telling you
 * what it costs.
 */
export interface AttendanceStanding {
  /** Absences so far, in whole-absence units — lates roll up into these. */
  used: number
  allowed: number
  remaining: number
  state: string
}

export interface AttendanceGap {
  block: CourseBlock
  date: string
  standing: AttendanceStanding | null
}

/**
 * The one-line state of every other screen.
 *
 * Today is the home screen, and a home screen that only reports on today is a
 * page rather than an overview. Each field here is exactly enough to put a
 * number on a tile that links somewhere else — no more, because everything is
 * computed on every tick and the screen has half a second to render on a
 * mid-range phone.
 */
export interface TodayOverview {
  /** Whether a schedule exists *at all*, as opposed to on this particular day.
   * These are not the same question, and conflating them is what made Today
   * offer to import a schedule that was already there every Sunday. */
  hasSchedule: boolean
  subjects: number
  units: number
  gwa: number | null
  gradedCourses: number
  /** Courses at or past their caution threshold. */
  cutWarnings: number
  catchUp: number
  openDeadlines: number
  dueSoon: number
  overdue: number
  /** Announcements posted in the last three days, matching the sidebar badge. */
  recentAnnouncements: number
  hasRoute: boolean
}

export interface TodayData {
  date: string
  weekday: Weekday
  /** Today's classes only. For "does a schedule exist", read `overview.hasSchedule`. */
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
  /** Cut standing per enrolment id, for any card that has to show consequence. */
  standings: Record<string, AttendanceStanding>
  preferences: UserPreferences | null
  overview: TodayOverview
}

export async function loadToday(now = new Date()): Promise<TodayData> {
  const [blockRows, enrollments, courses, attendance, deadlines, prefsRows, grades, announcements] =
    await Promise.all([
      readAll<ScheduleBlockRow & { id: string }>('schedule_blocks'),
      readAll<Enrollment & { id: string }>('enrollments'),
      readAll<Course & { id: string }>('courses'),
      readAll<AttendanceRecord & { id: string }>('attendance_records'),
      readAll<Deadline & { id: string }>('deadlines'),
      readAll<UserPreferences & { id: string }>('user_preferences'),
      readAll<Grade & { id: string }>('grades'),
      readAll<Announcement & { id: string }>('announcements'),
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

  const preferences = prefsRows[0] ?? null

  /* Computed once, in one place, and then read by three consumers: the warning
   * list, the prompt cards, and the overview tile. Three call sites doing this
   * arithmetic separately is three chances for Today to disagree with itself
   * about how many cuts you have left. */
  const standings = new Map<string, AttendanceStanding>()
  for (const enrollment of enrollments) {
    const records = attendance.filter((r) => r.enrollment_id === enrollment.id)
    const summary = summariseAttendance(
      {
        present: records.filter((r) => r.status === 'present').length,
        absent: records.filter((r) => r.status === 'absent').length,
        late: records.filter((r) => r.status === 'late').length,
        excused: records.filter((r) => r.status === 'excused').length,
      },
      {
        allowedAbsences:
          enrollment.allowed_absences ??
          preferences?.default_allowed_absences ??
          DEFAULT_ALLOWED_ABSENCES,
        latesPerAbsence:
          enrollment.lates_per_absence ?? preferences?.lates_per_absence ?? DEFAULT_LATES_PER_ABSENCE,
      },
    )
    standings.set(enrollment.id, {
      used: summary.absenceUnits,
      allowed: summary.allowed,
      remaining: summary.remaining,
      state: summary.state,
    })
  }

  const catchUp: AttendanceGap[] = []
  for (let offset = 1; offset <= 7; offset++) {
    const date = shiftDate(today, -offset)
    const day = weekdayOfDate(date)
    for (const block of blocksOnDay(blocks, day) as CourseBlock[]) {
      if (!block.enrollmentId) continue
      if (recorded.has(`${block.id}|${date}`)) continue
      catchUp.push({
        block,
        date,
        standing: standings.get(block.enrollmentId) ?? null,
      })
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

  const attendanceWarnings = enrollments
    .map((enrollment) => {
      const standing = standings.get(enrollment.id)
      const course = courseById.get(enrollment.course_id)
      return {
        code: course?.code ?? '—',
        remaining: standing?.remaining ?? 0,
        state: standing?.state ?? 'normal',
      }
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
    standings: Object.fromEntries(standings),
    preferences,
    overview: {
      hasSchedule: blocks.length > 0,
      subjects: enrollments.length,
      units: courses.reduce((total, course) => total + Number(course.units ?? 0), 0),
      ...(() => {
        /* The same unit-weighted arithmetic the Grades screen shows, so the
         * tile and the screen it links to can never disagree. */
        const gradeByEnrollment = new Map(grades.map((grade) => [grade.enrollment_id, grade]))
        const result = computeGwa(
          enrollments.map((enrollment) => {
            const grade = gradeByEnrollment.get(enrollment.id)
            const course = courseById.get(enrollment.course_id)
            return {
              enrollmentId: enrollment.id,
              code: course?.code ?? '—',
              units: Number(course?.units ?? 0),
              value: grade?.value ?? null,
              // The column is a constrained text in Postgres and a bare string
              // in the generated types; the constraint is the source of truth.
              mark: (grade?.mark ?? null) as NonNumericMark | null,
              isProjected: grade?.is_projected ?? false,
            }
          }),
        )
        return { gwa: result.gwa, gradedCourses: result.gradedCourses }
      })(),
      cutWarnings: attendanceWarnings.length,
      catchUp: catchUp.length,
      openDeadlines: openDeadlines.length,
      dueSoon: dueSoon.length,
      overdue: overdue.length,
      recentAnnouncements: announcements.filter(
        (announcement) =>
          Date.parse(announcement.created_at ?? '') >= now.getTime() - 3 * 86_400_000,
      ).length,
      hasRoute: Boolean(preferences?.default_route_id),
    },
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
