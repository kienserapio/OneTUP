/**
 * Time handling for a single-timezone product.
 *
 * Everything a student sees is in Asia/Manila. The Philippines has observed no
 * daylight saving since 1978, so the offset is a constant +08:00 — which lets
 * us convert without pulling in a timezone database. `MANILA_OFFSET_MINUTES` is
 * the one place that assumption lives, so a future multi-campus build has a
 * single thing to replace.
 */

export const MANILA_OFFSET_MINUTES = 8 * 60
export const MANILA_OFFSET_ISO = '+08:00'

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

export type Weekday = (typeof WEEKDAYS)[number]

/** `HH:MM` in 24-hour form. The storage and transport shape for a time of day. */
export type TimeOfDay = string

/** `YYYY-MM-DD`. A calendar date in Manila, with no instant attached. */
export type DateOnly = string

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isTimeOfDay(value: string): value is TimeOfDay {
  return TIME_PATTERN.test(value)
}

export function isDateOnly(value: string): value is DateOnly {
  return DATE_PATTERN.test(value)
}

/** Minutes since midnight. The unit all schedule arithmetic works in. */
export function toMinutes(time: TimeOfDay): number {
  const m = TIME_PATTERN.exec(time)
  if (!m) throw new RangeError(`Not a HH:MM time: ${time}`)
  return Number(m[1]) * 60 + Number(m[2])
}

export function fromMinutes(minutes: number): TimeOfDay {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** The Manila calendar date an instant falls on. */
export function manilaDate(instant: Date): DateOnly {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MINUTES * 60_000)
  return shifted.toISOString().slice(0, 10)
}

/** The Manila wall-clock time an instant falls on. */
export function manilaTime(instant: Date): TimeOfDay {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MINUTES * 60_000)
  return shifted.toISOString().slice(11, 16)
}

export function manilaWeekday(instant: Date): Weekday {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MINUTES * 60_000)
  return WEEKDAYS[shifted.getUTCDay()]
}

/** Minutes since Manila midnight for an instant. */
export function manilaMinutes(instant: Date): number {
  return toMinutes(manilaTime(instant))
}

/** Builds the instant for a Manila wall-clock date and time. */
export function manilaInstant(date: DateOnly, time: TimeOfDay): Date {
  if (!isDateOnly(date)) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`)
  if (!isTimeOfDay(time)) throw new RangeError(`Not a HH:MM time: ${time}`)
  return new Date(`${date}T${time}:00${MANILA_OFFSET_ISO}`)
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function weekdayOf(date: DateOnly): Weekday {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

/** Whole days from `from` to `to`, positive when `to` is later. */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** The next date on or after `from` that falls on `weekday`. */
export function nextWeekdayOnOrAfter(from: DateOnly, weekday: Weekday): DateOnly {
  const target = WEEKDAYS.indexOf(weekday)
  const start = new Date(`${from}T00:00:00Z`).getUTCDay()
  return addDays(from, (target - start + 7) % 7)
}

const MINUTE = 60_000

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE)
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MINUTE)
}

/** `07:00` → `7:00 AM`. Used wherever a time is read rather than scanned. */
export function formatTime12(time: TimeOfDay): string {
  const total = toMinutes(time)
  const h24 = Math.floor(total / 60)
  const m = total % 60
  const suffix = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatWeekday(day: Weekday, style: 'long' | 'short' = 'long'): string {
  const label = day.charAt(0).toUpperCase() + day.slice(1)
  return style === 'long' ? label : label.slice(0, 3)
}
