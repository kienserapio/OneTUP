/**
 * Absence arithmetic.
 *
 * A student acts on these numbers — dropping a subject, or not — so they are
 * computed here from raw records and never produced by a model (ADR-007).
 *
 * `excused` is deliberately excluded from every count. It exists so a student
 * can record an approved absence without it inflating a total that would
 * otherwise push them toward a decision they should not have to make.
 */

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export type AttendanceState = 'normal' | 'caution' | 'warning' | 'at_limit'

export interface AttendanceCounts {
  present: number
  absent: number
  late: number
  excused: number
}

export interface AttendanceSummary extends AttendanceCounts {
  /** Absences plus whole absences converted from lates. */
  absenceUnits: number
  allowed: number
  remaining: number
  /** `absenceUnits / allowed`, or 0 when no limit is set. */
  ratio: number
  state: AttendanceState
  /** Lates still needed to tip into one more absence unit. */
  latesUntilNextUnit: number
}

/**
 * Three absences is an unofficial drop at TUP, and three lates make one
 * absence. These mirror the column defaults in migration 024 and exist so a
 * client with no preferences loaded yet cannot quietly assume a laxer limit
 * than the student actually has.
 *
 * The real limit still comes from each syllabus, so both are per-course
 * overridable.
 */
export const DEFAULT_ALLOWED_ABSENCES = 3
export const DEFAULT_LATES_PER_ABSENCE = 3

export const ATTENDANCE_THRESHOLDS = {
  caution: 0.5,
  warning: 0.8,
  atLimit: 1,
} as const

export function countStatuses(statuses: readonly AttendanceStatus[]): AttendanceCounts {
  const counts: AttendanceCounts = { present: 0, absent: 0, late: 0, excused: 0 }
  for (const status of statuses) counts[status] += 1
  return counts
}

export interface SummariseOptions {
  allowedAbsences: number
  latesPerAbsence: number
}

/**
 * `absence_units = absent + floor(late / lates_per_absence)`
 *
 * Partial lates never round up. Two lates under a three-per-absence rule is
 * zero units, not one — a student should never be told they have used an
 * absence they have not used.
 */
export function summariseAttendance(
  counts: AttendanceCounts,
  options: SummariseOptions,
): AttendanceSummary {
  const latesPerAbsence = options.latesPerAbsence > 0 ? options.latesPerAbsence : Infinity
  const allowed = Math.max(0, options.allowedAbsences)

  const fromLates = Number.isFinite(latesPerAbsence)
    ? Math.floor(counts.late / latesPerAbsence)
    : 0
  const absenceUnits = counts.absent + fromLates

  const ratio = allowed > 0 ? absenceUnits / allowed : 0
  const remaining = Math.max(0, allowed - absenceUnits)

  const latesUntilNextUnit = Number.isFinite(latesPerAbsence)
    ? (latesPerAbsence - (counts.late % latesPerAbsence)) % latesPerAbsence || latesPerAbsence
    : Infinity

  return {
    ...counts,
    absenceUnits,
    allowed,
    remaining,
    ratio,
    state: attendanceState(ratio, allowed),
    latesUntilNextUnit,
  }
}

export function attendanceState(ratio: number, allowed: number): AttendanceState {
  if (allowed <= 0) return 'normal'
  if (ratio >= ATTENDANCE_THRESHOLDS.atLimit) return 'at_limit'
  if (ratio >= ATTENDANCE_THRESHOLDS.warning) return 'warning'
  if (ratio >= ATTENDANCE_THRESHOLDS.caution) return 'caution'
  return 'normal'
}

const STATE_ORDER: Record<AttendanceState, number> = {
  normal: 0,
  caution: 1,
  warning: 2,
  at_limit: 3,
}

/**
 * True only when the state has moved to a more serious one than last reported.
 * Notifications fire on crossing, never on remaining — a student who is already
 * at the limit does not need to be told again every week.
 */
export function shouldNotifyAttendance(
  previous: AttendanceState | null,
  current: AttendanceState,
): boolean {
  if (current === 'normal') return false
  return STATE_ORDER[current] > STATE_ORDER[previous ?? 'normal']
}

/** Plain-language line shown beside the counter. No hedging, no alarm. */
export function describeAttendance(summary: AttendanceSummary): string {
  if (summary.allowed <= 0) return 'No absence limit set for this subject.'
  if (summary.remaining === 0) return 'You are at the limit for this subject.'
  if (summary.remaining === 1) return '1 absence left.'
  return `${summary.remaining} absences left.`
}
