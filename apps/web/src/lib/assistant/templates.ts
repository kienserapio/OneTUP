import 'server-only'

import {
  DEFAULT_ALLOWED_ABSENCES,
  DEFAULT_LATES_PER_ABSENCE,
  computeGwa,
  countStatuses,
  formatGwa,
  formatTime12,
  formatWeekday,
  freeBlocks,
  manilaDate,
  manilaWeekday,
  planWhatIf,
  summariseAttendance,
  urgencyOf,
  weekdayOf,
  type AttendanceStatus,
  type ScheduleBlock,
  type Weekday,
} from '@onetup/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@onetup/core'

/**
 * `own_data` query templates.
 *
 * The model picks the template and extracts the parameters. It does not
 * compute, and it never sees a grade or a cut count — the numbers come from SQL
 * under the student's own RLS context and are dropped into a sentence here
 * (ADR-007, TDD §11.2).
 *
 * That is why an answer from this route comes back `labelled: false`: a cut
 * count is not AI output just because a sentence was templated around it.
 */

type Client = SupabaseClient<Database>

export interface TemplateResult {
  answer: string
  values: Record<string, unknown>
}

export interface TemplateContext {
  supabase: Client
  userId: string
  now: Date
  locale: 'en' | 'fil' | 'auto'
}

export interface Template {
  name: string
  description: string
  run: (context: TemplateContext, parameters: Record<string, unknown>) => Promise<TemplateResult>
}

async function currentTermId(supabase: Client): Promise<string | null> {
  const { data } = await supabase.from('terms').select('id').eq('is_current', true).maybeSingle()
  return data?.id ?? null
}

interface EnrollmentRow {
  id: string
  allowed_absences: number | null
  lates_per_absence: number | null
  courses: { code: string; title: string; units: number } | null
}

async function loadEnrollments(supabase: Client): Promise<EnrollmentRow[]> {
  const termId = await currentTermId(supabase)
  let query = supabase
    .from('enrollments')
    .select('id, allowed_absences, lates_per_absence, courses(code, title, units)')
  if (termId) query = query.eq('term_id', termId)

  const { data } = await query
  return (data ?? []) as unknown as EnrollmentRow[]
}

function matchCourse(
  enrollments: EnrollmentRow[],
  wanted: unknown,
): EnrollmentRow | null {
  if (typeof wanted !== 'string' || !wanted.trim()) return null
  const needle = wanted.toLowerCase().replace(/\s+/g, '')

  return (
    enrollments.find(
      (enrollment) => enrollment.courses?.code.toLowerCase().replace(/\s+/g, '') === needle,
    ) ??
    enrollments.find((enrollment) =>
      enrollment.courses?.title.toLowerCase().includes(wanted.toLowerCase()),
    ) ??
    null
  )
}

const absencesRemaining: Template = {
  name: 'absences_remaining',
  description: 'How many absences the student has left, overall or in one subject — use for any question about cuts, skipping, or being absent',
  async run({ supabase, userId }, parameters) {
    const enrollments = await loadEnrollments(supabase)
    if (enrollments.length === 0) {
      return { answer: 'You have no subjects on file yet, so there is nothing to count.', values: {} }
    }

    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('default_allowed_absences, lates_per_absence')
      .eq('user_id', userId)
      .maybeSingle()

    const { data: records } = await supabase
      .from('attendance_records')
      .select('enrollment_id, status')
      .in(
        'enrollment_id',
        enrollments.map((enrollment) => enrollment.id),
      )

    const summaries = enrollments.map((enrollment) => {
      const own = (records ?? []).filter((record) => record.enrollment_id === enrollment.id)
      const summary = summariseAttendance(
        countStatuses(own.map((record) => record.status as AttendanceStatus)),
        {
          allowedAbsences:
            enrollment.allowed_absences ?? preferences?.default_allowed_absences ?? DEFAULT_ALLOWED_ABSENCES,
          latesPerAbsence: enrollment.lates_per_absence ?? preferences?.lates_per_absence ?? DEFAULT_LATES_PER_ABSENCE,
        },
      )
      return { code: enrollment.courses?.code ?? '—', summary }
    })

    const target = matchCourse(enrollments, parameters.course ?? parameters.course_code)

    if (target) {
      const entry = summaries.find((s) => s.code === target.courses?.code)!
      return {
        answer:
          entry.summary.remaining === 0
            ? `You're at the limit in ${entry.code} — ${entry.summary.absenceUnits} of ${entry.summary.allowed} used.`
            : `You've used ${entry.summary.absenceUnits} of ${entry.summary.allowed} in ${entry.code}. ${entry.summary.remaining} left.`,
        values: {
          course: entry.code,
          used: entry.summary.absenceUnits,
          allowed: entry.summary.allowed,
          remaining: entry.summary.remaining,
        },
      }
    }

    const tightest = [...summaries].sort((a, b) => a.summary.remaining - b.summary.remaining)[0]
    return {
      answer: summaries
        .map((entry) => `${entry.code}: ${entry.summary.remaining} left`)
        .join(' · '),
      values: {
        per_course: summaries.map((entry) => ({
          course: entry.code,
          used: entry.summary.absenceUnits,
          allowed: entry.summary.allowed,
          remaining: entry.summary.remaining,
        })),
        tightest: tightest?.code,
      },
    }
  },
}

const freeBlocksTemplate: Template = {
  name: 'free_blocks',
  description: 'Which classes a student has on a given weekday, and the gaps between them — use to find out whether there is a class on a particular day',
  async run({ supabase, userId, now }, parameters) {
    const { data: blocks } = await supabase
      .from('schedule_blocks')
      .select('id, enrollment_id, title, day, start_time, end_time, room, source')

    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('day_start, day_end')
      .eq('user_id', userId)
      .maybeSingle()

    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('id, courses(code)')

    const codeByEnrollment = new Map(
      (enrollments ?? []).map((enrollment) => [
        enrollment.id,
        (enrollment.courses as unknown as { code: string } | null)?.code ?? 'Class',
      ]),
    )

    const mapped: ScheduleBlock[] = (blocks ?? []).map((block) => ({
      id: block.id,
      enrollmentId: block.enrollment_id,
      label: block.enrollment_id
        ? (codeByEnrollment.get(block.enrollment_id) ?? 'Class')
        : (block.title ?? 'Block'),
      day: block.day as Weekday,
      startTime: block.start_time.slice(0, 5),
      endTime: block.end_time.slice(0, 5),
      room: block.room,
      source: block.source as ScheduleBlock['source'],
    }))

    const day = resolveDay(parameters.day, now)
    const gaps = freeBlocks(mapped, day, 30, {
      dayStart: preferences?.day_start?.slice(0, 5) ?? '07:00',
      dayEnd: preferences?.day_end?.slice(0, 5) ?? '21:00',
    })

    if (gaps.length === 0) {
      return {
        answer: `No gaps of half an hour or more on ${formatWeekday(day)}.`,
        values: { day, gaps: [] },
      }
    }

    return {
      answer: `On ${formatWeekday(day)} you're free ${gaps
        .map((gap) => `${formatTime12(gap.startTime)}–${formatTime12(gap.endTime)}`)
        .join(', ')}.`,
      values: { day, gaps },
    }
  },
}

const deadlinesDue: Template = {
  name: 'deadlines_due',
  description: 'Deadlines and requirements coming up, optionally within a window',
  async run({ supabase, now }, parameters) {
    const horizonDays = Number(parameters.days ?? 7)
    const until = new Date(now.getTime() + horizonDays * 86_400_000).toISOString()

    const { data } = await supabase
      .from('deadlines')
      .select('id, title, due_at, enrollments(courses(code))')
      .eq('status', 'open')
      .lte('due_at', until)
      .order('due_at')

    const deadlines = (data ?? []).map((deadline) => ({
      title: deadline.title,
      dueAt: deadline.due_at,
      course:
        (
          (deadline.enrollments as unknown as { courses: { code: string } | null } | null)
            ?.courses ?? null
        )?.code ?? null,
      urgency: urgencyOf({ dueAt: deadline.due_at, status: 'open' }, now),
    }))

    if (deadlines.length === 0) {
      return {
        answer: `Nothing due in the next ${horizonDays} days.`,
        values: { horizon_days: horizonDays, deadlines: [] },
      }
    }

    return {
      answer: deadlines
        .map(
          (deadline) =>
            `${deadline.title}${deadline.course ? ` (${deadline.course})` : ''} — ${formatDue(deadline.dueAt)}`,
        )
        .join('\n'),
      values: { horizon_days: horizonDays, deadlines },
    }
  },
}

const gwaNow: Template = {
  name: 'gwa_now',
  description: "The student's current GWA",
  async run({ supabase }) {
    const graded = await loadGraded(supabase)
    const result = computeGwa(graded)

    if (result.gwa === null) {
      return { answer: 'No grades entered yet, so there is no GWA to compute.', values: {} }
    }

    return {
      answer: `Your GWA is ${formatGwa(result.gwa)} across ${result.gradedCourses} subject${result.gradedCourses === 1 ? '' : 's'} and ${result.gradedUnits} units.`,
      values: {
        gwa: Number(result.gwa.toFixed(4)),
        graded_units: result.gradedUnits,
        graded_courses: result.gradedCourses,
      },
    }
  },
}

const gradeNeeded: Template = {
  name: 'grade_needed',
  description: 'What grade the student needs in remaining subjects to hit a target GWA',
  async run({ supabase }, parameters) {
    const target = Number(parameters.target ?? parameters.gwa ?? NaN)
    if (!Number.isFinite(target)) {
      return { answer: 'Tell me the GWA you are aiming for and I can work it out.', values: {} }
    }

    const graded = await loadGraded(supabase)
    const ungraded = await loadUngraded(supabase)

    const plan = planWhatIf({ target, graded, ungraded })
    return {
      answer: plan.explanation,
      values: {
        target,
        verdict: plan.verdict,
        required: plan.requiredAchievable,
        best_possible: plan.bestPossible === null ? null : Number(plan.bestPossible.toFixed(4)),
      },
    }
  },
}

const nextClass: Template = {
  name: 'next_class',
  description: 'The next class: which subject, when, and which room',
  async run({ supabase, now }) {
    const weekday = manilaWeekday(now)
    const { data } = await supabase
      .from('v_today')
      .select('label, start_time, end_time, room')
      .order('start_time')

    const time = now.toISOString()
    void time

    const upcoming = (data ?? []).find(
      (block) => block.start_time && block.start_time.slice(0, 5) > currentTime(now),
    )

    if (!upcoming) {
      return {
        answer: `Nothing else scheduled for ${formatWeekday(weekday)}.`,
        values: { day: weekday },
      }
    }

    return {
      answer: `${upcoming.label} at ${formatTime12(upcoming.start_time!.slice(0, 5))}${upcoming.room ? `, ${upcoming.room}` : ''}.`,
      values: {
        course: upcoming.label,
        start_time: upcoming.start_time,
        room: upcoming.room,
      },
    }
  },
}

async function loadGraded(supabase: Client) {
  const { data } = await supabase
    .from('grades')
    .select('enrollment_id, value, mark, is_projected, enrollments(courses(code, units))')

  return (data ?? []).map((grade) => {
    const course = (
      grade.enrollments as unknown as { courses: { code: string; units: number } | null } | null
    )?.courses
    return {
      enrollmentId: grade.enrollment_id,
      code: course?.code ?? '—',
      units: Number(course?.units ?? 0),
      value: grade.value === null ? null : Number(grade.value),
      mark: grade.mark as never,
      isProjected: grade.is_projected,
    }
  })
}

async function loadUngraded(supabase: Client) {
  const { data } = await supabase.from('enrollments').select('id, courses(code, units), grades(id)')

  return (data ?? [])
    .filter((enrollment) => ((enrollment.grades as unknown as unknown[]) ?? []).length === 0)
    .map((enrollment) => {
      const course = enrollment.courses as unknown as { code: string; units: number } | null
      return {
        enrollmentId: enrollment.id,
        code: course?.code ?? '—',
        units: Number(course?.units ?? 0),
      }
    })
}

function currentTime(now: Date): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(11, 16)
}

function resolveDay(value: unknown, now: Date): Weekday {
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (lowered === 'today') return manilaWeekday(now)
    if (lowered === 'tomorrow') {
      const date = manilaDate(new Date(now.getTime() + 86_400_000))
      return weekdayOf(date)
    }
    const named = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ].find((day) => lowered.startsWith(day.slice(0, 3)))
    if (named) return named as Weekday
  }
  return manilaWeekday(now)
}

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

export const TEMPLATES: Record<string, Template> = {
  absences_remaining: absencesRemaining,
  free_blocks: freeBlocksTemplate,
  deadlines_due: deadlinesDue,
  gwa_now: gwaNow,
  grade_needed: gradeNeeded,
  next_class: nextClass,
}

export const TEMPLATE_NAMES = Object.keys(TEMPLATES)
