import { describe, expect, it } from 'vitest'
import {
  STALE_AFTER_DAYS,
  chooseOptions,
  describeCommute,
  friendlyTime,
  totalMinutes,
  verificationNote,
  type RouteOption,
} from '../src/commute/answer'
import { peakPenaltyAt, type PeakBand } from '../src/commute/departure'

/**
 * What a commute answer says, and how honest it is about it.
 *
 * The model's only job on this route is to extract an origin and an hour.
 * Every minute and every peso below comes from the database, so these tests are
 * about judgement — which routes are worth mentioning, and when the answer owes
 * the student a warning.
 */

const route = (over: Partial<RouteOption> = {}): RouteOption => ({
  routeId: 'r1',
  label: 'Jeep via España',
  baseMinutes: 45,
  peakMinutes: 0,
  fareStudent: 24,
  fareRegular: 30,
  transfers: 1,
  verifiedCount: 5,
  lastVerifiedAt: '2026-09-01T00:00:00Z',
  ...over,
})

const NOW = new Date('2026-09-07T09:00:00Z')

describe('chooseOptions', () => {
  it('has nothing to say about no routes', () => {
    expect(chooseOptions([], null)).toBeNull()
  })

  it('leads with the fastest when no preference was expressed', () => {
    const slow = route({ routeId: 'slow', baseMinutes: 60, fareStudent: 15 })
    const fast = route({ routeId: 'fast', baseMinutes: 30, fareStudent: 40 })

    const choice = chooseOptions([slow, fast], null)
    expect(choice?.primary.routeId).toBe('fast')
  })

  it('leads with the cheapest when the student asked for cheap', () => {
    const slow = route({ routeId: 'slow', baseMinutes: 60, fareStudent: 15 })
    const fast = route({ routeId: 'fast', baseMinutes: 30, fareStudent: 40 })

    const choice = chooseOptions([slow, fast], 'cheapest')
    expect(choice?.primary.routeId).toBe('slow')
  })

  it('leads with the fewest transfers when that is what was asked', () => {
    const direct = route({ routeId: 'direct', transfers: 0, baseMinutes: 55 })
    const hops = route({ routeId: 'hops', transfers: 3, baseMinutes: 35 })

    expect(chooseOptions([direct, hops], 'fewest_transfers')?.primary.routeId).toBe('direct')
  })

  /**
   * The comparison the commute screen exists to make. An answer that names only
   * the fastest route has withheld the thing the student came for.
   */
  it('offers the counterpart when fastest and cheapest really differ', () => {
    const slow = route({ routeId: 'slow', baseMinutes: 60, fareStudent: 15 })
    const fast = route({ routeId: 'fast', baseMinutes: 30, fareStudent: 40 })

    const choice = chooseOptions([slow, fast], null)
    expect(choice?.alternative?.routeId).toBe('slow')
  })

  it('says nothing extra when the cheapest route is also the fastest', () => {
    const best = route({ routeId: 'best', baseMinutes: 30, fareStudent: 15 })
    const worse = route({ routeId: 'worse', baseMinutes: 60, fareStudent: 40 })

    const choice = chooseOptions([best, worse], null)
    expect(choice?.primary.routeId).toBe('best')
    expect(choice?.alternative).toBeNull()
  })

  /* Two routes four pesos and three minutes apart are the same answer wearing
   * different labels, and offering both is noise. */
  it('withholds an alternative that is barely different', () => {
    const a = route({ routeId: 'a', baseMinutes: 45, fareStudent: 24 })
    const b = route({ routeId: 'b', baseMinutes: 47, fareStudent: 22 })

    expect(chooseOptions([a, b], null)?.alternative).toBeNull()
  })

  it('ranks on the total, so a peak penalty can change which route leads', () => {
    const throughTraffic = route({ routeId: 'traffic', baseMinutes: 30, peakMinutes: 25 })
    const steady = route({ routeId: 'steady', baseMinutes: 40, peakMinutes: 0 })

    expect(totalMinutes(throughTraffic)).toBe(55)
    expect(chooseOptions([throughTraffic, steady], null)?.primary.routeId).toBe('steady')
  })
})

describe('verificationNote', () => {
  it('stays quiet about a route confirmed recently', () => {
    expect(verificationNote(route({ lastVerifiedAt: '2026-09-01T00:00:00Z' }), NOW)).toBeNull()
  })

  /* A route nobody has confirmed is a proposal, and the answer should say so
   * in words rather than only as a badge on a screen nobody is looking at. */
  it('says so when nobody has confirmed the route', () => {
    const note = verificationNote(route({ verifiedCount: 0, lastVerifiedAt: null }), NOW)
    expect(note).toMatch(/Nobody has confirmed/)
  })

  it('says so when the last confirmation is older than the staleness window', () => {
    const old = new Date(NOW.getTime() - (STALE_AFTER_DAYS + 40) * 86_400_000).toISOString()
    const note = verificationNote(route({ lastVerifiedAt: old }), NOW)
    expect(note).toMatch(/Last confirmed 4 months ago/)
  })

  it('does not fire one day inside the window', () => {
    const almost = new Date(NOW.getTime() - (STALE_AFTER_DAYS - 1) * 86_400_000).toISOString()
    expect(verificationNote(route({ lastVerifiedAt: almost }), NOW)).toBeNull()
  })
})

describe('describeCommute', () => {
  const context = { originArea: 'Caloocan', departureTime: null, now: NOW }

  it('states the minutes and the student fare', () => {
    const choice = chooseOptions([route()], null)!
    const answer = describeCommute(choice, context)

    expect(answer).toContain('45 minutes')
    expect(answer).toContain('₱24.00')
    expect(answer).toContain('Jeep via España')
  })

  it('names the hour when the student named one', () => {
    const choice = chooseOptions([route()], null)!
    const answer = describeCommute(choice, { ...context, departureTime: '21:00' })
    expect(answer).toContain('leaving at 9pm')
  })

  /* Split out from the figure on purpose, so a student can see that the extra
   * twenty minutes is the hour they picked and not the route. */
  it('attributes the peak penalty to the traffic rather than the route', () => {
    const choice = chooseOptions([route({ peakMinutes: 20 })], null)!
    const answer = describeCommute(choice, { ...context, departureTime: '07:00' })

    expect(answer).toContain('65 minutes')
    expect(answer).toContain('20 minutes of rush-hour traffic')
  })

  it('offers the trade-off when there is one', () => {
    const slow = route({ routeId: 'slow', label: 'LRT then jeep', baseMinutes: 60, fareStudent: 15 })
    const fast = route({ routeId: 'fast', label: 'P2P bus', baseMinutes: 30, fareStudent: 40 })

    const answer = describeCommute(chooseOptions([slow, fast], null)!, context)
    expect(answer).toContain('P2P bus')
    expect(answer).toContain('LRT then jeep')
    expect(answer).toMatch(/₱15\.00/)
  })

  it('carries the staleness warning into the sentence', () => {
    const old = new Date(NOW.getTime() - 200 * 86_400_000).toISOString()
    const answer = describeCommute(chooseOptions([route({ lastVerifiedAt: old })], null)!, context)
    expect(answer).toMatch(/check before you rely on it/)
  })

  it('produces no markdown, because the assistant renders prose', () => {
    const answer = describeCommute(chooseOptions([route()], null)!, context)
    expect(answer).not.toMatch(/[*_#`|]/)
  })
})

describe('friendlyTime', () => {
  it('reads like speech, not a timetable', () => {
    expect(friendlyTime('21:00')).toBe('9pm')
    expect(friendlyTime('06:30')).toBe('6:30am')
    expect(friendlyTime('00:00')).toBe('12am')
    expect(friendlyTime('12:00')).toBe('12pm')
    expect(friendlyTime('12:45')).toBe('12:45pm')
  })

  it('leaves something it cannot read alone', () => {
    expect(friendlyTime('nonsense')).toBe('nonsense')
  })
})

/**
 * The hour is the whole reason `departure_time` was added. These pin down that
 * the same journey costs different amounts of time depending on when it starts.
 */
describe('peakPenaltyAt', () => {
  const band: PeakBand = {
    corridor: 'espana',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startTime: '06:30',
    endTime: '09:30',
    penaltyMinutes: 20,
    severity: 'heavy',
  }

  // 2026-09-07 is a Monday.
  const morning = new Date('2026-09-07T07:00:00+08:00')
  const evening = new Date('2026-09-07T21:00:00+08:00')

  it('adds the penalty inside the band', () => {
    expect(peakPenaltyAt(morning, 40, ['espana'], [band]).minutes).toBe(20)
  })

  it('adds nothing at 9pm', () => {
    expect(peakPenaltyAt(evening, 40, ['espana'], [band]).minutes).toBe(0)
  })

  it('adds nothing on a corridor the route does not travel', () => {
    expect(peakPenaltyAt(morning, 40, ['edsa'], [band]).minutes).toBe(0)
  })

  it('adds nothing on a day the band does not cover', () => {
    const sunday = new Date('2026-09-06T07:00:00+08:00')
    expect(peakPenaltyAt(sunday, 40, ['espana'], [band]).minutes).toBe(0)
  })

  /* A journey starting before the band that runs into it is still caught,
   * which is the case the second pass exists for. */
  it('catches a journey that starts early and arrives inside the band', () => {
    const early = new Date('2026-09-07T06:00:00+08:00')
    expect(peakPenaltyAt(early, 60, ['espana'], [band]).minutes).toBe(20)
  })
})
