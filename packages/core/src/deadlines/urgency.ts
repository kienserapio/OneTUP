/**
 * Deadline urgency.
 *
 * Urgency is recomputed on every render and never stored. A stored urgency is
 * wrong the moment the clock moves, and a deadline that quietly stays "soon"
 * for three days is worse than no signal at all.
 */

export type Urgency = 'overdue' | 'critical' | 'urgent' | 'soon' | 'upcoming' | 'later'

export type DeadlineStatus = 'open' | 'done' | 'dismissed'

export const URGENCY_HOURS = {
  critical: 6,
  urgent: 24,
  soon: 72,
  upcoming: 168,
} as const

export interface DeadlineLike {
  dueAt: Date | string
  status: DeadlineStatus
}

export function hoursUntil(dueAt: Date | string, now: Date = new Date()): number {
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt)
  return (due.getTime() - now.getTime()) / 3_600_000
}

export function urgencyOf(deadline: DeadlineLike, now: Date = new Date()): Urgency {
  const hours = hoursUntil(deadline.dueAt, now)
  if (hours < 0) return deadline.status === 'open' ? 'overdue' : 'later'
  if (hours <= URGENCY_HOURS.critical) return 'critical'
  if (hours <= URGENCY_HOURS.urgent) return 'urgent'
  if (hours <= URGENCY_HOURS.soon) return 'soon'
  if (hours <= URGENCY_HOURS.upcoming) return 'upcoming'
  return 'later'
}

const URGENCY_ORDER: Record<Urgency, number> = {
  overdue: 0,
  critical: 1,
  urgent: 2,
  soon: 3,
  upcoming: 4,
  later: 5,
}

export function compareByUrgency(
  a: DeadlineLike,
  b: DeadlineLike,
  now: Date = new Date(),
): number {
  const byUrgency = URGENCY_ORDER[urgencyOf(a, now)] - URGENCY_ORDER[urgencyOf(b, now)]
  if (byUrgency !== 0) return byUrgency
  return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
}

/**
 * Relative time in the register a student would use. Deliberately coarse: a
 * countdown to the minute reads as pressure, not information.
 */
export function describeTimeLeft(dueAt: Date | string, now: Date = new Date()): string {
  const hours = hoursUntil(dueAt, now)

  if (hours < 0) {
    const overdue = Math.abs(hours)
    if (overdue < 1) return 'Overdue'
    if (overdue < 24) return `${Math.floor(overdue)}h overdue`
    const days = Math.floor(overdue / 24)
    return days === 1 ? '1 day overdue' : `${days} days overdue`
  }

  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60))
    return `in ${minutes} min`
  }
  if (hours < 24) {
    const whole = Math.floor(hours)
    return whole === 1 ? 'in 1 hour' : `in ${whole} hours`
  }

  const days = Math.floor(hours / 24)
  if (days === 1) return 'tomorrow'
  if (days < 7) return `in ${days} days`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'in 1 week' : `in ${weeks} weeks`
}

/** Default reminder offsets in seconds before `due_at`: 72h, 24h, 6h. */
export const DEFAULT_REMINDER_OFFSETS = [259_200, 86_400, 21_600] as const

export interface ScheduledReminder {
  offsetSeconds: number
  fireAt: Date
}

/**
 * Reminders in the past are dropped at scheduling time rather than fired late.
 * A "due in 72 hours" notification arriving for something due in two is noise
 * that teaches a student to ignore the channel.
 */
export function planReminders(
  dueAt: Date | string,
  offsets: readonly number[] = DEFAULT_REMINDER_OFFSETS,
  now: Date = new Date(),
): ScheduledReminder[] {
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt)
  return offsets
    .map((offsetSeconds) => ({
      offsetSeconds,
      fireAt: new Date(due.getTime() - offsetSeconds * 1000),
    }))
    .filter((r) => r.fireAt.getTime() > now.getTime())
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
}

export interface SubtaskLike {
  isDone: boolean
}

export function subtaskProgress(subtasks: readonly SubtaskLike[]): {
  done: number
  total: number
  ratio: number
  allDone: boolean
} {
  const total = subtasks.length
  const done = subtasks.filter((s) => s.isDone).length
  return { done, total, ratio: total === 0 ? 0 : done / total, allDone: total > 0 && done === total }
}
