'use client'

import {
  type AttendanceRecord,
  type AttendanceStatus,
  type AttendanceSummary,
  type ComponentStanding,
  type Course,
  type Enrollment,
  type Grade,
  type GradeComponentRow,
  type GradedCourse,
  type GwaResult,
  type NonNumericMark,
  type ScheduleBlock,
  type ScheduleBlockRow,
  type UserPreferences,
  type UserThreshold,
  type Weekday,
  computeComponentStanding,
  computeGwa,
  countStatuses,
  nextBlock,
  summariseAttendance,
} from '@onetup/core'
import { deleteRecord, getMeta, readAll, setMeta } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { supabaseBrowser } from '@/lib/supabase/client'
import { loadToday, type AttendanceGap } from '@/lib/queries/today'

/**
 * The Subjects data layer — reads and writes for attendance (M2) and grades (M3).
 *
 * Reads run against IndexedDB only, so a student in a stairwell still sees their
 * standing. Writes go through the mutation queue, so recording a cut or a grade
 * works with no signal and reconciles later.
 *
 * Every read here is scoped to the signed-in student's own rows, and there is
 * deliberately no function in this file — or anywhere else — that returns
 * attendance or grades for more than one student. Section aggregates and
 * comparisons are excluded by design, not merely unimplemented (TDD §4.5).
 */

const DEFAULT_ALLOWED_ABSENCES = 5
const DEFAULT_LATES_PER_ABSENCE = 3

export interface SubjectDefaults {
  allowedAbsences: number
  latesPerAbsence: number
}

export interface GradeEntry {
  id: string
  value: number | null
  mark: NonNumericMark | null
  isProjected: boolean
}

export interface NextMeeting {
  day: Weekday
  startTime: string
  endTime: string
  room: string | null
  isToday: boolean
}

export interface SubjectSummary {
  enrollmentId: string
  courseId: string
  termId: string
  code: string
  title: string
  units: number
  faculty: string | null
  /** null means "fall back to user_preferences"; the resolved value is `limits`. */
  allowedAbsencesOverride: number | null
  latesPerAbsenceOverride: number | null
  limits: SubjectDefaults
  attendance: AttendanceSummary
  grade: GradeEntry | null
  next: NextMeeting | null
}

export interface SubjectsData {
  termId: string | null
  termLabel: string | null
  subjects: SubjectSummary[]
  catchUpCount: number
  defaults: SubjectDefaults
  /** Units enrolled this term, graded or not — the load, not the denominator. */
  termUnits: number
  /** Every term, so the headline figure on Subjects matches the one on /gwa. */
  cumulative: GwaResult
}

export interface SubjectDetail extends SubjectSummary {
  /** Newest session first — a student checks the last class, not the first. */
  records: AttendanceRecord[]
  components: GradeComponentRow[]
  standing: ComponentStanding
  meetings: { blockId: string; day: Weekday; startTime: string; endTime: string; room: string | null }[]
  defaults: SubjectDefaults
}

/**
 * A graded course as the GWA screen shows it, rather than as the arithmetic
 * needs it.
 *
 * `GradedCourse` carries only what `computeGwa` reads. A student opening a
 * semester from two years ago has to recognise the subject and be able to
 * correct it, so the title and the grade row behind the figure travel with it.
 * Both are ignored by the arithmetic, which reads the fields it declares.
 */
export interface GwaCourse extends GradedCourse {
  title: string
  /** The row an edit writes to, so a correction never inserts a second grade. */
  grade: GradeEntry | null
}

export interface TermStanding {
  termId: string
  label: string
  isCurrent: boolean
  result: GwaResult
  courses: GwaCourse[]
}

export interface GwaData {
  termId: string | null
  termLabel: string | null
  /** Current term, graded courses only. */
  term: GwaResult
  /** Current term including grades the student marked as projections. */
  projected: GwaResult
  cumulative: GwaResult
  /** Oldest term first, so the trend reads left to right. */
  trend: TermStanding[]
  termCourses: GwaCourse[]
  cumulativeCourses: GwaCourse[]
  ungraded: { enrollmentId: string; code: string; units: number }[]
  /** Grades the student marked as expected, keyed by enrolment. */
  projections: Record<string, number>
  thresholds: UserThreshold[]
  hasAnyGrade: boolean
}

// --- Reads ---------------------------------------------------------------

export async function loadSubjects(now = new Date()): Promise<SubjectsData> {
  const [enrollments, courses, blockRows, attendance, grades, prefsRows, terms] = await Promise.all([
    readAll<Enrollment>('enrollments'),
    readAll<Course>('courses'),
    readAll<ScheduleBlockRow>('schedule_blocks'),
    readAll<AttendanceRecord>('attendance_records'),
    readAll<Grade>('grades'),
    readAll<UserPreferences & { id: string }>('user_preferences'),
    cachedTerms(),
  ])

  const defaults = defaultsFrom(prefsRows[0] ?? null)
  const termId = currentTermId(enrollments, terms)
  const context = buildContext(courses, blockRows, attendance, grades, defaults)

  const subjects = enrollments
    .filter((enrollment) => enrollment.term_id === termId)
    .map((enrollment) => summarise(enrollment, context, now))
    .sort((a, b) => a.code.localeCompare(b.code))

  const catchUp = await loadCatchUp(now)

  return {
    termId,
    termLabel: termId ? labelForTerm(termId, terms, enrollments) : null,
    subjects,
    catchUpCount: catchUp.length,
    defaults,
    termUnits: subjects.reduce((sum, subject) => sum + subject.units, 0),
    cumulative: computeGwa(enrollments.map((enrollment) => gradedFrom(enrollment, context))),
  }
}

/**
 * An enrolment as the GWA arithmetic wants it.
 *
 * A projection is the student saying what they expect, not what they got, so it
 * is dropped here. It reaches the figure only through the planner, where it is
 * labelled as a projection.
 */
function gradedFrom(enrollment: Enrollment, context: SubjectContext): GradedCourse {
  const course = context.courseById.get(enrollment.course_id)
  const grade = context.gradeByEnrollment.get(enrollment.id)
  const usable = grade && grade.value !== null && !grade.is_projected

  return {
    enrollmentId: enrollment.id,
    code: course?.code ?? '—',
    units: Number(course?.units ?? 0),
    value: usable ? Number(grade.value) : null,
    mark: (grade?.mark as NonNumericMark | null) ?? null,
  }
}

export async function loadSubjectDetail(
  enrollmentId: string,
  now = new Date(),
): Promise<SubjectDetail | null> {
  const [enrollments, courses, blockRows, attendance, grades, components, prefsRows] =
    await Promise.all([
      readAll<Enrollment>('enrollments'),
      readAll<Course>('courses'),
      readAll<ScheduleBlockRow>('schedule_blocks'),
      readAll<AttendanceRecord>('attendance_records'),
      readAll<Grade>('grades'),
      readAll<GradeComponentRow>('grade_components'),
      readAll<UserPreferences & { id: string }>('user_preferences'),
    ])

  const enrollment = enrollments.find((row) => row.id === enrollmentId)
  if (!enrollment) return null

  const defaults = defaultsFrom(prefsRows[0] ?? null)
  const context = buildContext(courses, blockRows, attendance, grades, defaults)
  const summary = summarise(enrollment, context, now)

  const mine = components
    .filter((component) => component.enrollment_id === enrollmentId)
    .sort((a, b) => a.ordinal - b.ordinal)

  return {
    ...summary,
    defaults,
    records: attendance
      .filter((record) => record.enrollment_id === enrollmentId)
      .sort((a, b) => b.session_date.localeCompare(a.session_date)),
    components: mine,
    standing: computeComponentStanding(
      mine.map((component) => ({
        label: component.label,
        weightPct: Number(component.weight_pct),
        scorePct: component.score_pct === null ? null : Number(component.score_pct),
        isComplete: component.is_complete,
      })),
      null,
    ),
    meetings: (context.blocksByEnrollment.get(enrollmentId) ?? [])
      .map((block) => ({
        blockId: block.id,
        day: block.day,
        startTime: block.startTime,
        endTime: block.endTime,
        room: block.room,
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }
}

/**
 * Every class in the previous seven days with nothing recorded against it.
 *
 * Delegates to the Today loader rather than restating the "which blocks are
 * missing an answer" rule, so the badge on Today and this list can never
 * disagree about what is outstanding.
 */
export async function loadCatchUp(now = new Date()): Promise<AttendanceGap[]> {
  const today = await loadToday(now)
  return [...today.catchUp].sort(
    (a, b) => b.date.localeCompare(a.date) || a.block.startTime.localeCompare(b.block.startTime),
  )
}

export async function loadGwa(): Promise<GwaData> {
  const [enrollments, courses, grades, thresholds, terms] = await Promise.all([
    readAll<Enrollment>('enrollments'),
    readAll<Course>('courses'),
    readAll<Grade>('grades'),
    readAll<UserThreshold>('user_thresholds'),
    cachedTerms(),
  ])

  const courseById = new Map(courses.map((course) => [course.id, course]))
  const gradeByEnrollment = new Map(grades.map((grade) => [grade.enrollment_id, grade]))
  const termId = currentTermId(enrollments, terms)

  const toGraded = (enrollment: Enrollment, includeProjections: boolean): GwaCourse => {
    const course = courseById.get(enrollment.course_id)
    const grade = gradeByEnrollment.get(enrollment.id)
    const isProjected = grade?.is_projected ?? false
    const value =
      grade?.value === null || grade?.value === undefined
        ? null
        : !includeProjections && isProjected
          ? null
          : Number(grade.value)
    return {
      enrollmentId: enrollment.id,
      code: course?.code ?? '—',
      title: course?.title ?? '',
      units: Number(course?.units ?? 0),
      value,
      mark: (grade?.mark as NonNumericMark | null) ?? null,
      isProjected,
      // `value` is deliberately blank for a projection here; the row it came
      // from is not, so an editor opened on this course still shows what the
      // student actually recorded.
      grade: grade
        ? {
            id: grade.id,
            value: grade.value === null ? null : Number(grade.value),
            mark: (grade.mark as NonNumericMark | null) ?? null,
            isProjected: grade.is_projected,
          }
        : null,
    }
  }

  const inTerm = enrollments.filter((enrollment) => enrollment.term_id === termId)
  const termCourses = inTerm.map((enrollment) => toGraded(enrollment, false))

  const byTerm = new Map<string, Enrollment[]>()
  for (const enrollment of enrollments) {
    const bucket = byTerm.get(enrollment.term_id)
    if (bucket) bucket.push(enrollment)
    else byTerm.set(enrollment.term_id, [enrollment])
  }

  const trend: TermStanding[] = [...byTerm.entries()]
    .map(([id, rows]) => {
      const graded = rows.map((enrollment) => toGraded(enrollment, false))
      return {
        termId: id,
        label: labelForTerm(id, terms, enrollments),
        isCurrent: id === termId,
        result: computeGwa(graded),
        courses: graded,
        sortKey: sortKeyForTerm(id, terms, enrollments),
      }
    })
    .filter((standing) => standing.result.gwa !== null)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ sortKey: _sortKey, ...standing }) => standing)

  const ungraded = termCourses
    .filter((course) => course.value === null && !course.mark)
    .map(({ enrollmentId, code, units }) => ({ enrollmentId, code, units }))

  const cumulativeCourses = enrollments.map((enrollment) => toGraded(enrollment, false))

  // A projection is the student already answering "what do you expect here?", so
  // the planner starts from it rather than making them say it twice.
  const projections: Record<string, number> = {}
  for (const enrollment of inTerm) {
    const grade = gradeByEnrollment.get(enrollment.id)
    if (grade?.is_projected && grade.value !== null) {
      projections[enrollment.id] = Number(grade.value)
    }
  }

  return {
    termId,
    termLabel: termId ? labelForTerm(termId, terms, enrollments) : null,
    term: computeGwa(termCourses),
    projected: computeGwa(inTerm.map((enrollment) => toGraded(enrollment, true))),
    cumulative: computeGwa(cumulativeCourses),
    trend,
    termCourses,
    cumulativeCourses,
    ungraded,
    projections,
    thresholds: thresholds
      .filter((threshold) => threshold.kind === 'gwa')
      .sort((a, b) => a.label.localeCompare(b.label)),
    hasAnyGrade: grades.some((grade) => grade.value !== null || grade.mark !== null),
  }
}

// --- Writes --------------------------------------------------------------

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabaseBrowser().auth.getUser()
  return data.user?.id ?? null
}

/**
 * One grade per enrollment. `grades` carries a natural key on
 * `(user_id, enrollment_id)`, so a queued insert replayed after a reconnect
 * updates the same row instead of leaving a student with two grades.
 */
export async function saveGrade(input: {
  existing: GradeEntry | null
  enrollmentId: string
  value: number | null
  mark: NonNumericMark | null
  isProjected: boolean
}): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return

  const id = input.existing?.id ?? crypto.randomUUID()
  const payload = {
    id,
    user_id: userId,
    enrollment_id: input.enrollmentId,
    value: input.value,
    mark: input.mark,
    is_projected: input.isProjected,
  }

  await queueWrite({
    entity: 'grades',
    operation: input.existing ? 'update' : 'insert',
    payload,
    optimistic: { ...payload, updated_at: new Date().toISOString() },
  })
}

export async function clearGrade(existing: GradeEntry): Promise<void> {
  await deleteRecord('grades', existing.id)
  await queueWrite({ entity: 'grades', operation: 'delete', payload: { id: existing.id } })
}

export async function updateAttendanceRecord(
  record: AttendanceRecord,
  changes: { status: AttendanceStatus; note: string | null },
): Promise<void> {
  const payload = { id: record.id, status: changes.status, note: changes.note }
  await queueWrite({
    entity: 'attendance_records',
    operation: 'update',
    payload,
    optimistic: { ...record, ...payload, updated_at: new Date().toISOString() },
  })
}

export async function deleteAttendanceRecord(id: string): Promise<void> {
  await deleteRecord('attendance_records', id)
  await queueWrite({ entity: 'attendance_records', operation: 'delete', payload: { id } })
}

export async function saveEnrollmentLimits(
  enrollment: { id: string } & Record<string, unknown>,
  limits: { allowedAbsences: number | null; latesPerAbsence: number | null },
): Promise<void> {
  const payload = {
    id: enrollment.id,
    allowed_absences: limits.allowedAbsences,
    lates_per_absence: limits.latesPerAbsence,
  }
  await queueWrite({
    entity: 'enrollments',
    operation: 'update',
    payload,
    optimistic: { ...enrollment, ...payload, updated_at: new Date().toISOString() },
  })
}

export async function saveComponent(input: {
  existing: GradeComponentRow | null
  enrollmentId: string
  label: string
  weightPct: number
  scorePct: number | null
  isComplete: boolean
  ordinal: number
}): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return

  const id = input.existing?.id ?? crypto.randomUUID()
  const payload = {
    id,
    user_id: userId,
    enrollment_id: input.enrollmentId,
    label: input.label,
    weight_pct: input.weightPct,
    score_pct: input.scorePct,
    is_complete: input.isComplete,
    ordinal: input.ordinal,
  }

  await queueWrite({
    entity: 'grade_components',
    operation: input.existing ? 'update' : 'insert',
    payload,
    optimistic: { ...payload, updated_at: new Date().toISOString() },
  })
}

export async function deleteComponent(id: string): Promise<void> {
  await deleteRecord('grade_components', id)
  await queueWrite({ entity: 'grade_components', operation: 'delete', payload: { id } })
}

export async function saveThreshold(input: {
  existing: UserThreshold | null
  label: string
  comparator: string
  value: number
  scope: 'term' | 'cumulative'
  active: boolean
}): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return

  const id = input.existing?.id ?? crypto.randomUUID()
  const payload = {
    id,
    user_id: userId,
    kind: 'gwa' as const,
    label: input.label,
    comparator: input.comparator,
    value: input.value,
    scope: input.scope,
    active: input.active,
  }

  await queueWrite({
    entity: 'user_thresholds',
    operation: input.existing ? 'update' : 'insert',
    payload,
    optimistic: {
      ...payload,
      last_state: input.existing?.last_state ?? null,
      updated_at: new Date().toISOString(),
    },
  })
}

export async function deleteThreshold(id: string): Promise<void> {
  await deleteRecord('user_thresholds', id)
  await queueWrite({ entity: 'user_thresholds', operation: 'delete', payload: { id } })
}

// --- Terms ---------------------------------------------------------------

export interface TermInfo {
  id: string
  label: string
  academicYear: string
  ordinal: number
  startsOn: string | null
  isCurrent: boolean
}

const TERM_CACHE_KEY = 'terms'

/**
 * Terms are not part of the offline entity set — they are a handful of rows that
 * change once a semester, so they live in sync metadata instead. Read the cache
 * to render, refresh it in the background.
 */
export async function cachedTerms(): Promise<TermInfo[]> {
  return (await getMeta<TermInfo[]>(TERM_CACHE_KEY)) ?? []
}

export async function refreshTerms(): Promise<TermInfo[]> {
  const { data, error } = await supabaseBrowser()
    .from('terms')
    .select('id,label,academic_year,ordinal,starts_on,is_current')

  if (error || !data) return cachedTerms()

  const terms: TermInfo[] = data.map((row) => ({
    id: row.id,
    label: row.label,
    academicYear: row.academic_year,
    ordinal: row.ordinal,
    startsOn: row.starts_on,
    isCurrent: row.is_current,
  }))

  await setMeta(TERM_CACHE_KEY, terms)
  return terms
}

// --- Internals -----------------------------------------------------------

interface SubjectContext {
  courseById: Map<string, Course>
  blocksByEnrollment: Map<string, ScheduleBlock[]>
  statusesByEnrollment: Map<string, AttendanceStatus[]>
  gradeByEnrollment: Map<string, Grade>
  defaults: SubjectDefaults
}

function buildContext(
  courses: Course[],
  blockRows: ScheduleBlockRow[],
  attendance: AttendanceRecord[],
  grades: Grade[],
  defaults: SubjectDefaults,
): SubjectContext {
  const courseById = new Map(courses.map((course) => [course.id, course]))

  const blocksByEnrollment = new Map<string, ScheduleBlock[]>()
  for (const row of blockRows) {
    if (!row.enrollment_id) continue
    const block: ScheduleBlock = {
      id: row.id,
      enrollmentId: row.enrollment_id,
      label: row.title ?? '',
      title: row.title,
      day: row.day as Weekday,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      room: row.room,
      source: row.source as ScheduleBlock['source'],
    }
    const bucket = blocksByEnrollment.get(row.enrollment_id)
    if (bucket) bucket.push(block)
    else blocksByEnrollment.set(row.enrollment_id, [block])
  }

  const statusesByEnrollment = new Map<string, AttendanceStatus[]>()
  for (const record of attendance) {
    const bucket = statusesByEnrollment.get(record.enrollment_id)
    if (bucket) bucket.push(record.status)
    else statusesByEnrollment.set(record.enrollment_id, [record.status])
  }

  return {
    courseById,
    blocksByEnrollment,
    statusesByEnrollment,
    gradeByEnrollment: new Map(grades.map((grade) => [grade.enrollment_id, grade])),
    defaults,
  }
}

function summarise(enrollment: Enrollment, context: SubjectContext, now: Date): SubjectSummary {
  const course = context.courseById.get(enrollment.course_id)
  const limits: SubjectDefaults = {
    allowedAbsences: enrollment.allowed_absences ?? context.defaults.allowedAbsences,
    latesPerAbsence: enrollment.lates_per_absence ?? context.defaults.latesPerAbsence,
  }

  const attendance = summariseAttendance(
    countStatuses(context.statusesByEnrollment.get(enrollment.id) ?? []),
    limits,
  )

  const grade = context.gradeByEnrollment.get(enrollment.id)
  const upcoming = nextBlock(context.blocksByEnrollment.get(enrollment.id) ?? [], now)

  return {
    enrollmentId: enrollment.id,
    courseId: enrollment.course_id,
    termId: enrollment.term_id,
    code: course?.code ?? '—',
    title: course?.title ?? '',
    units: Number(course?.units ?? 0),
    faculty: enrollment.faculty_name,
    allowedAbsencesOverride: enrollment.allowed_absences,
    latesPerAbsenceOverride: enrollment.lates_per_absence,
    limits,
    attendance,
    grade: grade
      ? {
          id: grade.id,
          value: grade.value === null ? null : Number(grade.value),
          mark: (grade.mark as NonNumericMark | null) ?? null,
          isProjected: grade.is_projected,
        }
      : null,
    next: upcoming
      ? {
          day: upcoming.block.day,
          startTime: upcoming.block.startTime,
          endTime: upcoming.block.endTime,
          room: upcoming.block.room,
          isToday: upcoming.isToday,
        }
      : null,
  }
}

function defaultsFrom(preferences: UserPreferences | null): SubjectDefaults {
  return {
    allowedAbsences: preferences?.default_allowed_absences ?? DEFAULT_ALLOWED_ABSENCES,
    latesPerAbsence: preferences?.lates_per_absence ?? DEFAULT_LATES_PER_ABSENCE,
  }
}

/**
 * The term the student is in now. The cached `is_current` flag is authoritative
 * when it is present; without it the most recently enrolled term is the only
 * honest answer available offline.
 */
function currentTermId(enrollments: Enrollment[], terms: TermInfo[]): string | null {
  const present = new Set(enrollments.map((enrollment) => enrollment.term_id))
  const flagged = terms.find((term) => term.isCurrent && present.has(term.id))
  if (flagged) return flagged.id

  let bestId: string | null = null
  let bestAt = ''
  for (const enrollment of enrollments) {
    const at = enrollment.created_at ?? ''
    if (at >= bestAt) {
      bestAt = at
      bestId = enrollment.term_id
    }
  }
  return bestId
}

function labelForTerm(termId: string, terms: TermInfo[], enrollments: Enrollment[]): string {
  const term = terms.find((candidate) => candidate.id === termId)
  if (term) {
    // Seeded labels already read "1st Semester AY 2024-2025". Appending the
    // academic year to those gave "… 2024-2025 2024-2025", which is long enough
    // to truncate the part that identifies the semester.
    return term.label.includes(term.academicYear)
      ? term.label
      : `${term.label} ${term.academicYear}`
  }

  // Cold first load with no cached terms: number them by when they were enrolled
  // rather than inventing a semester name that might be wrong.
  const order = [...new Set(enrollments.map((enrollment) => enrollment.term_id))].sort((a, b) =>
    sortKeyForTerm(a, terms, enrollments).localeCompare(sortKeyForTerm(b, terms, enrollments)),
  )
  return `Term ${order.indexOf(termId) + 1}`
}

function sortKeyForTerm(termId: string, terms: TermInfo[], enrollments: Enrollment[]): string {
  const term = terms.find((candidate) => candidate.id === termId)
  if (term?.startsOn) return term.startsOn
  if (term) return `${term.academicYear}-${String(term.ordinal).padStart(2, '0')}`

  const earliest = enrollments
    .filter((enrollment) => enrollment.term_id === termId)
    .map((enrollment) => enrollment.created_at ?? '')
    .sort()[0]
  return earliest ?? termId
}
