/**
 * Departure planning — the wake-up and leave-by computation.
 *
 * Entirely deterministic. No model is involved at any point, including the
 * explanation, which is templated from the adjustments that were actually
 * applied. A wrong wake time is a real-world harm, so nothing here is allowed
 * to be plausible-but-generated (ADR-007).
 */

import type { DateOnly, TimeOfDay, Weekday } from '../time'
import { addMinutes, manilaInstant, manilaMinutes, manilaWeekday } from '../time'

export interface PeakBand {
  corridor: string
  days: Weekday[]
  startTime: TimeOfDay
  endTime: TimeOfDay
  penaltyMinutes: number
  severity: 'light' | 'moderate' | 'heavy'
}

export interface DeparturePreferences {
  preparationMinutes: number
  arriveEarlyMinutes: number
  applyPeakAdjustment: boolean
  applyWeatherAdjustment: boolean
  weatherThresholdPct: number
  weatherBufferMinutes: number
}

export const DEFAULT_DEPARTURE_PREFERENCES: DeparturePreferences = {
  preparationMinutes: 45,
  arriveEarlyMinutes: 15,
  applyPeakAdjustment: true,
  applyWeatherAdjustment: true,
  weatherThresholdPct: 60,
  weatherBufferMinutes: 15,
}

export interface WeatherForecast {
  /** Probability of precipitation, 0–100, for the projected travel window. */
  precipitationProbabilityPct: number
  /** Hour the probability refers to, for the explanation line. */
  hour: TimeOfDay
}

export interface DeparturePlanInput {
  planDate: DateOnly
  /** Start of the first class on `planDate`, Manila wall clock. */
  classStart: TimeOfDay
  firstCourseCode?: string
  /** Sum of the saved route's leg durations, with no adjustments. */
  baseMinutes: number
  /** Corridors the saved route travels, matched against peak bands. */
  corridors: string[]
  peakBands: readonly PeakBand[]
  weather?: WeatherForecast | null
  preferences?: Partial<DeparturePreferences>
}

export interface DepartureAdjustment {
  kind: 'peak' | 'weather'
  minutes: number
  reason: string
  severity?: PeakBand['severity']
}

export interface DeparturePlan {
  planDate: DateOnly
  classStart: Date
  arriveBy: Date
  leaveAt: Date
  wakeAt: Date
  baseMinutes: number
  peakMinutes: number
  weatherMinutes: number
  adjustedMinutes: number
  adjustments: DepartureAdjustment[]
  explanation: string
  iterations: number
}

const MAX_ITERATIONS = 3

/**
 * The travel window depends on `leave_at`, which depends on the peak penalty,
 * which depends on the window. Compute once unadjusted, then recompute with the
 * resulting window, capped at three passes — it settles in one or two.
 */
export function computeDeparturePlan(input: DeparturePlanInput): DeparturePlan {
  const prefs = { ...DEFAULT_DEPARTURE_PREFERENCES, ...input.preferences }

  const classStart = manilaInstant(input.planDate, input.classStart)
  const arriveBy = addMinutes(classStart, -prefs.arriveEarlyMinutes)

  let adjustments: DepartureAdjustment[] = []
  let adjustedMinutes = input.baseMinutes
  let leaveAt = addMinutes(arriveBy, -adjustedMinutes)
  let iterations = 0

  for (let pass = 0; pass < MAX_ITERATIONS; pass++) {
    iterations = pass + 1

    const peak = prefs.applyPeakAdjustment
      ? peakAdjustments(leaveAt, arriveBy, input.corridors, input.peakBands)
      : []

    const weather =
      prefs.applyWeatherAdjustment && input.weather
        ? weatherAdjustment(input.weather, prefs)
        : null

    const next = [...peak, ...(weather ? [weather] : [])]
    const nextMinutes = input.baseMinutes + next.reduce((s, a) => s + a.minutes, 0)
    const nextLeaveAt = addMinutes(arriveBy, -nextMinutes)

    const settled = nextMinutes === adjustedMinutes
    adjustments = next
    adjustedMinutes = nextMinutes
    leaveAt = nextLeaveAt
    if (settled) break
  }

  const peakMinutes = adjustments
    .filter((a) => a.kind === 'peak')
    .reduce((s, a) => s + a.minutes, 0)
  const weatherMinutes = adjustments
    .filter((a) => a.kind === 'weather')
    .reduce((s, a) => s + a.minutes, 0)

  const wakeAt = addMinutes(leaveAt, -prefs.preparationMinutes)

  return {
    planDate: input.planDate,
    classStart,
    arriveBy,
    leaveAt,
    wakeAt,
    baseMinutes: input.baseMinutes,
    peakMinutes,
    weatherMinutes,
    adjustedMinutes,
    adjustments,
    explanation: explainPlan(adjustments),
    iterations,
  }
}

/**
 * Each corridor contributes at most one penalty, however many legs travel it.
 * Charging per leg would double-count a transfer within the same corridor.
 */
function peakAdjustments(
  leaveAt: Date,
  arriveBy: Date,
  corridors: readonly string[],
  bands: readonly PeakBand[],
): DepartureAdjustment[] {
  const day = manilaWeekday(leaveAt)
  const windowStart = manilaMinutes(leaveAt)
  const windowEnd = manilaMinutes(arriveBy)

  const applied = new Map<string, DepartureAdjustment>()

  for (const band of bands) {
    if (!corridors.includes(band.corridor)) continue
    if (!band.days.includes(day)) continue
    if (!overlaps(windowStart, windowEnd, minutesOf(band.startTime), minutesOf(band.endTime))) {
      continue
    }

    const existing = applied.get(band.corridor)
    if (existing && existing.minutes >= band.penaltyMinutes) continue

    applied.set(band.corridor, {
      kind: 'peak',
      minutes: band.penaltyMinutes,
      severity: band.severity,
      reason: `${corridorLabel(band.corridor)} ${periodLabel(minutesOf(band.startTime))} peak`,
    })
  }

  return [...applied.values()]
}

function weatherAdjustment(
  weather: WeatherForecast,
  prefs: DeparturePreferences,
): DepartureAdjustment | null {
  if (weather.precipitationProbabilityPct < prefs.weatherThresholdPct) return null
  return {
    kind: 'weather',
    minutes: prefs.weatherBufferMinutes,
    reason: `${Math.round(weather.precipitationProbabilityPct)}% chance of rain at ${weather.hour}`,
  }
}

function minutesOf(time: TimeOfDay): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Window overlap, tolerant of a window that crosses midnight — a 4:30 AM
 * departure for a 7 AM class does not, but an outbound evening trip can.
 */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const a: [number, number][] = aEnd >= aStart ? [[aStart, aEnd]] : [[aStart, 1440], [0, aEnd]]
  const b: [number, number][] = bEnd >= bStart ? [[bStart, bEnd]] : [[bStart, 1440], [0, bEnd]]
  return a.some(([s1, e1]) => b.some(([s2, e2]) => s1 < e2 && s2 < e1))
}

function corridorLabel(corridor: string): string {
  const labels: Record<string, string> = {
    rail: 'Rail',
    lrt1: 'LRT-1',
    lrt2: 'LRT-2',
    mrt3: 'MRT-3',
    edsa_bus: 'EDSA bus',
    jeep: 'Jeepney',
    city_roads: 'City roads',
  }
  return labels[corridor] ?? corridor.replace(/_/g, ' ')
}

function periodLabel(startMinutes: number): string {
  return startMinutes < 12 * 60 ? 'morning' : 'evening'
}

/**
 * The explanation is assembled from the adjustments that fired, so the
 * notification copy and the in-app copy can never drift apart.
 */
export function explainPlan(adjustments: readonly DepartureAdjustment[]): string {
  if (adjustments.length === 0) {
    return 'Normal conditions on your route, so this is your usual leave time.'
  }

  const peak = adjustments.filter((a) => a.kind === 'peak')
  const weather = adjustments.filter((a) => a.kind === 'weather')
  const total = adjustments.reduce((s, a) => s + a.minutes, 0)

  const clauses: string[] = []
  for (const p of peak) {
    clauses.push(`rush hour adds about ${p.minutes} minutes on ${stripPeriod(p.reason)}`)
  }
  for (const w of weather) {
    clauses.push(`${w.reason.replace(/^\d+% chance of rain/, 'rain is forecast')}`)
  }

  const joined =
    clauses.length === 1
      ? clauses[0]
      : `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`

  return `${capitalise(joined)}, so your alarm moved ${total} minutes earlier.`
}

function stripPeriod(reason: string): string {
  return reason.replace(/ (morning|evening) peak$/, '')
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Default peak bands, adjustable once real observations exist (TDD §8.4). */
export const DEFAULT_PEAK_BANDS: PeakBand[] = [
  {
    corridor: 'rail',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startTime: '06:30',
    endTime: '09:00',
    penaltyMinutes: 20,
    severity: 'heavy',
  },
  {
    corridor: 'rail',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startTime: '17:00',
    endTime: '19:30',
    penaltyMinutes: 20,
    severity: 'heavy',
  },
  {
    corridor: 'edsa_bus',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startTime: '06:00',
    endTime: '09:30',
    penaltyMinutes: 30,
    severity: 'heavy',
  },
  {
    corridor: 'edsa_bus',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startTime: '16:30',
    endTime: '20:00',
    penaltyMinutes: 30,
    severity: 'heavy',
  },
  {
    corridor: 'city_roads',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startTime: '07:00',
    endTime: '09:00',
    penaltyMinutes: 10,
    severity: 'moderate',
  },
  {
    corridor: 'city_roads',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startTime: '17:00',
    endTime: '19:00',
    penaltyMinutes: 10,
    severity: 'moderate',
  },
]
