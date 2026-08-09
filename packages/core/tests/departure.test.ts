import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEPARTURE_PREFERENCES,
  DEFAULT_PEAK_BANDS,
  computeDeparturePlan,
  explainPlan,
  manilaDate,
  manilaTime,
  minutesBetween,
} from '@onetup/core'
import type { DepartureAdjustment, DeparturePlanInput, PeakBand } from '@onetup/core'

const MONDAY = '2026-03-16'
const SATURDAY = '2026-03-14'
const WEEKDAYS: PeakBand['days'] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

function plan(overrides: Partial<DeparturePlanInput> = {}) {
  return computeDeparturePlan({
    planDate: MONDAY,
    classStart: '10:00',
    baseMinutes: 60,
    corridors: [],
    peakBands: [],
    weather: null,
    ...overrides,
  })
}

describe('with no peak and no rain', () => {
  it('leaves exactly base minutes before the arrival time', () => {
    const result = plan({ classStart: '10:00', baseMinutes: 60 })

    // arriveBy = 10:00 − 15 early = 09:45; leaveAt = 09:45 − 60 = 08:45.
    expect(manilaTime(result.classStart)).toBe('10:00')
    expect(manilaTime(result.arriveBy)).toBe('09:45')
    expect(manilaTime(result.leaveAt)).toBe('08:45')
    expect(minutesBetween(result.leaveAt, result.arriveBy)).toBe(result.baseMinutes)
    expect(result.adjustedMinutes).toBe(60)
    expect(result.peakMinutes).toBe(0)
    expect(result.weatherMinutes).toBe(0)
    expect(result.adjustments).toEqual([])
  })

  it('wakes preparationMinutes before leaving', () => {
    const result = plan()
    expect(manilaTime(result.wakeAt)).toBe('08:00')
    expect(minutesBetween(result.wakeAt, result.leaveAt)).toBe(
      DEFAULT_DEPARTURE_PREFERENCES.preparationMinutes,
    )
  })

  it('settles on the first pass, since nothing can change the window', () => {
    expect(plan().iterations).toBe(1)
  })

  it('says so in the explanation', () => {
    expect(plan().explanation).toBe(
      'Normal conditions on your route, so this is your usual leave time.',
    )
  })

  it('respects overridden preferences', () => {
    const result = plan({
      classStart: '08:00',
      baseMinutes: 30,
      preferences: { arriveEarlyMinutes: 0, preparationMinutes: 20 },
    })
    expect(manilaTime(result.arriveBy)).toBe('08:00')
    expect(manilaTime(result.leaveAt)).toBe('07:30')
    expect(manilaTime(result.wakeAt)).toBe('07:10')
  })

  it('leaves the plan unadjusted on a day no band covers', () => {
    const result = plan({
      planDate: SATURDAY,
      corridors: ['rail', 'edsa_bus'],
      peakBands: DEFAULT_PEAK_BANDS,
    })
    expect(result.adjustments).toEqual([])
    expect(manilaTime(result.leaveAt)).toBe('08:45')
  })

  it('leaves the plan unadjusted for a corridor the route does not travel', () => {
    const result = plan({ corridors: ['jeep'], peakBands: DEFAULT_PEAK_BANDS })
    expect(result.peakMinutes).toBe(0)
  })
})

describe('peak bands', () => {
  it('charges a corridor once however many legs travel it', () => {
    // Two rail legs on the same corridor: charging per leg would double-count
    // a transfer that never leaves the corridor.
    const result = plan({
      classStart: '09:00',
      baseMinutes: 60,
      corridors: ['rail', 'rail', 'rail'],
      peakBands: DEFAULT_PEAK_BANDS,
    })
    expect(result.adjustments).toHaveLength(1)
    expect(result.peakMinutes).toBe(20)
    expect(result.adjustments[0]).toMatchObject({ kind: 'peak', minutes: 20, severity: 'heavy' })
  })

  it('keeps only the heaviest band when several cover the same corridor', () => {
    const bands: PeakBand[] = [
      {
        corridor: 'city_roads',
        days: WEEKDAYS,
        startTime: '07:00',
        endTime: '09:00',
        penaltyMinutes: 10,
        severity: 'light',
      },
      {
        corridor: 'city_roads',
        days: WEEKDAYS,
        startTime: '07:30',
        endTime: '08:30',
        penaltyMinutes: 25,
        severity: 'heavy',
      },
    ]
    const result = plan({ classStart: '09:00', baseMinutes: 30, corridors: ['city_roads'], peakBands: bands })
    expect(result.adjustments).toHaveLength(1)
    expect(result.peakMinutes).toBe(25)
  })

  it('charges each distinct corridor separately', () => {
    const result = plan({
      classStart: '09:00',
      baseMinutes: 60,
      corridors: ['rail', 'edsa_bus'],
      peakBands: DEFAULT_PEAK_BANDS,
    })
    expect(result.adjustments).toHaveLength(2)
    expect(result.peakMinutes).toBe(50)
  })

  it('can be switched off entirely', () => {
    const result = plan({
      classStart: '09:00',
      corridors: ['rail'],
      peakBands: DEFAULT_PEAK_BANDS,
      preferences: { applyPeakAdjustment: false },
    })
    expect(result.peakMinutes).toBe(0)
  })
})

describe('iteration', () => {
  /**
   * The travel window depends on leaveAt, which depends on the penalty, which
   * depends on the window. An earlier departure can reach back into a band the
   * unadjusted window missed entirely.
   */
  it('converges within three passes when the penalty pulls the window into another band', () => {
    const bands: PeakBand[] = [
      {
        corridor: 'city_roads',
        days: WEEKDAYS,
        startTime: '07:00',
        endTime: '08:00',
        penaltyMinutes: 30,
        severity: 'moderate',
      },
      {
        corridor: 'rail',
        days: WEEKDAYS,
        startTime: '06:00',
        endTime: '07:00',
        penaltyMinutes: 15,
        severity: 'light',
      },
    ]

    const result = plan({
      classStart: '08:15',
      baseMinutes: 50,
      corridors: ['city_roads', 'rail'],
      peakBands: bands,
      preferences: { arriveEarlyMinutes: 0 },
    })

    // Pass 1 window 07:25–08:15 hits city_roads only (+30).
    // Pass 2 window 06:55–08:15 now also reaches rail (+15).
    // Pass 3 window 06:40–08:15 hits the same two, so it has settled.
    expect(result.iterations).toBe(3)
    expect(result.adjustedMinutes).toBe(95)
    expect(result.peakMinutes).toBe(45)
    expect(result.adjustments).toHaveLength(2)
    expect(manilaTime(result.leaveAt)).toBe('06:40')
    expect(minutesBetween(result.leaveAt, result.arriveBy)).toBe(result.adjustedMinutes)
  })

  it('stops on a genuine fixed point — the settled window still hits both bands', () => {
    const bands: PeakBand[] = [
      {
        corridor: 'city_roads',
        days: WEEKDAYS,
        startTime: '07:00',
        endTime: '08:00',
        penaltyMinutes: 30,
        severity: 'moderate',
      },
      {
        corridor: 'rail',
        days: WEEKDAYS,
        startTime: '06:00',
        endTime: '07:00',
        penaltyMinutes: 15,
        severity: 'light',
      },
    ]
    const result = plan({
      classStart: '08:15',
      baseMinutes: 50,
      corridors: ['city_roads', 'rail'],
      peakBands: bands,
      preferences: { arriveEarlyMinutes: 0 },
    })

    // Checked independently of the planner: the window it finally settled on
    // must still intersect every band whose penalty it charged, or the plan
    // would be reporting a penalty for traffic it no longer travels through.
    const toMin = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
    const windowStart = toMin(manilaTime(result.leaveAt))
    const windowEnd = toMin(manilaTime(result.arriveBy))
    for (const band of bands) {
      expect(windowStart, band.corridor).toBeLessThan(toMin(band.endTime))
      expect(toMin(band.startTime), band.corridor).toBeLessThan(windowEnd)
    }
  })

  it('settles in two passes when the widened window finds nothing new', () => {
    const result = plan({
      classStart: '09:00',
      baseMinutes: 60,
      corridors: ['rail'],
      peakBands: DEFAULT_PEAK_BANDS,
    })
    expect(result.iterations).toBe(2)
    expect(result.adjustedMinutes).toBe(80)
  })

  it('never runs more than three passes', () => {
    const bands: PeakBand[] = Array.from({ length: 6 }, (_, i) => ({
      corridor: `corridor_${i}`,
      days: WEEKDAYS,
      startTime: `0${3 + i}:00`,
      endTime: `0${4 + i}:00`,
      penaltyMinutes: 20,
      severity: 'heavy' as const,
    }))
    const result = plan({
      classStart: '10:00',
      baseMinutes: 20,
      corridors: bands.map((b) => b.corridor),
      peakBands: bands,
    })
    expect(result.iterations).toBeLessThanOrEqual(3)
  })
})

describe('weather', () => {
  it('adds a buffer once the forecast reaches the threshold', () => {
    const result = plan({ weather: { precipitationProbabilityPct: 80, hour: '08:00' } })
    expect(result.weatherMinutes).toBe(15)
    expect(result.adjustedMinutes).toBe(75)
    expect(manilaTime(result.leaveAt)).toBe('08:30')
    expect(result.adjustments[0]).toMatchObject({
      kind: 'weather',
      minutes: 15,
      reason: '80% chance of rain at 08:00',
    })
  })

  it('fires exactly at the threshold and not below it', () => {
    expect(plan({ weather: { precipitationProbabilityPct: 60, hour: '08:00' } }).weatherMinutes).toBe(
      15,
    )
    expect(plan({ weather: { precipitationProbabilityPct: 59, hour: '08:00' } }).weatherMinutes).toBe(
      0,
    )
  })

  it('can be switched off entirely', () => {
    const result = plan({
      weather: { precipitationProbabilityPct: 95, hour: '08:00' },
      preferences: { applyWeatherAdjustment: false },
    })
    expect(result.weatherMinutes).toBe(0)
  })
})

describe('a class before the configured day start', () => {
  it('still produces a plan', () => {
    const result = plan({ classStart: '06:00', baseMinutes: 90 })

    expect(manilaTime(result.classStart)).toBe('06:00')
    expect(manilaTime(result.arriveBy)).toBe('05:45')
    expect(manilaTime(result.leaveAt)).toBe('04:15')
    expect(manilaTime(result.wakeAt)).toBe('03:30')
    expect(result.planDate).toBe(MONDAY)
    expect(result.wakeAt.getTime()).toBeLessThan(result.leaveAt.getTime())
    expect(result.leaveAt.getTime()).toBeLessThan(result.arriveBy.getTime())
  })

  it('produces a plan that starts the previous calendar day when the commute is long', () => {
    const result = plan({ classStart: '06:00', baseMinutes: 400 })
    expect(manilaTime(result.leaveAt)).toBe('23:05')
    expect(manilaDate(result.leaveAt)).toBe('2026-03-15')
    expect(manilaDate(result.wakeAt)).toBe('2026-03-15')
    // The plan is still filed against the date of the class.
    expect(result.planDate).toBe(MONDAY)
  })

  it('still matches a peak band that sits before the usual day start', () => {
    const bands: PeakBand[] = [
      {
        corridor: 'city_roads',
        days: WEEKDAYS,
        startTime: '05:00',
        endTime: '06:00',
        penaltyMinutes: 10,
        severity: 'light',
      },
    ]
    const result = plan({
      classStart: '06:00',
      baseMinutes: 60,
      corridors: ['city_roads'],
      peakBands: bands,
    })
    expect(result.peakMinutes).toBe(10)
  })
})

describe('explainPlan', () => {
  const peak: DepartureAdjustment = {
    kind: 'peak',
    minutes: 20,
    severity: 'heavy',
    reason: 'Rail morning peak',
  }
  const rain: DepartureAdjustment = {
    kind: 'weather',
    minutes: 15,
    reason: '80% chance of rain at 07:00',
  }

  it('says nothing fired when nothing fired', () => {
    expect(explainPlan([])).toBe('Normal conditions on your route, so this is your usual leave time.')
  })

  it('templates a single peak adjustment', () => {
    expect(explainPlan([peak])).toBe(
      'Rush hour adds about 20 minutes on Rail, so your alarm moved 20 minutes earlier.',
    )
  })

  it('joins a peak and a rain adjustment and totals them', () => {
    expect(explainPlan([peak, rain])).toBe(
      'Rush hour adds about 20 minutes on Rail and rain is forecast at 07:00, so your alarm moved 35 minutes earlier.',
    )
  })

  it('comma-joins three clauses with a final "and"', () => {
    const second: DepartureAdjustment = {
      kind: 'peak',
      minutes: 30,
      severity: 'heavy',
      reason: 'EDSA bus morning peak',
    }
    expect(explainPlan([peak, second, rain])).toBe(
      'Rush hour adds about 20 minutes on Rail, rush hour adds about 30 minutes on EDSA bus and rain is forecast at 07:00, so your alarm moved 65 minutes earlier.',
    )
  })

  it('is the same sentence the plan carries, so the copy cannot drift', () => {
    const result = plan({
      classStart: '09:00',
      corridors: ['rail'],
      peakBands: DEFAULT_PEAK_BANDS,
      weather: { precipitationProbabilityPct: 90, hour: '07:00' },
    })
    expect(result.explanation).toBe(explainPlan(result.adjustments))
    expect(result.explanation).toContain('Rail')
    expect(result.explanation).toContain('rain is forecast')
    expect(result.explanation).toContain('35 minutes earlier')
  })
})
