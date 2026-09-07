import { describe, expect, it } from 'vitest'
import { rejectionReason } from '../route-walk-legs.mjs'

/**
 * The gate in front of the map.
 *
 * `route-map.tsx` draws a dashed straight line when a leg has no geometry, and
 * a solid traced line when it has one. The dashed line says "nobody knows"; the
 * solid one says "this is the way". A wrong solid line is indistinguishable
 * from a right one at a glance, on a phone, by someone who is late — so the
 * rule is that an implausible path is discarded rather than stored, and this is
 * the function that decides.
 */

/** Ayala Bridge → TUP Manila: 579 m apart, 2.21 km on foot, ~30 minutes.
 *  A real pair, and the one that calibrated the detour limit. */
const REAL = { routedKm: 2.21, crowKm: 0.579, durationMinutes: 30 }

describe('rejectionReason', () => {
  it('accepts a path that agrees with the walk somebody timed', () => {
    expect(rejectionReason(REAL)).toBeNull()
  })

  /**
   * The bug this exists to prevent. The Pasig River sits between those two
   * points and the only crossing is a bridge, so the honest path is 3.8× the
   * straight line. A detour limit of 2 or 3 — the obvious value — throws away
   * correct geometry across most of Manila.
   */
  it('accepts a long detour when geography demands one', () => {
    expect(rejectionReason({ routedKm: 2.21, crowKm: 0.579, durationMinutes: 30 })).toBeNull()
    // A walled campus with one gate: worse ratio, still real.
    expect(rejectionReason({ routedKm: 1.4, crowKm: 0.3, durationMinutes: 18 })).toBeNull()
  })

  it('rejects a coordinate that is plainly in the wrong place', () => {
    const reason = rejectionReason({ routedKm: 40, crowKm: 0.6, durationMinutes: 30 })
    expect(reason).toMatch(/straight line/)
  })

  describe('against the duration on file', () => {
    it('rejects a path far longer than the stated walk', () => {
      const reason = rejectionReason({ routedKm: 2.21, crowKm: 1.5, durationMinutes: 5 })
      expect(reason).toMatch(/5-minute walk/)
    })

    it('rejects a path far shorter than the stated walk', () => {
      const reason = rejectionReason({ routedKm: 2.21, crowKm: 1.5, durationMinutes: 240 })
      expect(reason).toMatch(/only/)
    })

    it('accepts the band in between', () => {
      // 15 minutes at 4.8 km/h implies 1.2 km. Both of these are inside 0.25×–2.5×.
      expect(rejectionReason({ routedKm: 1.3, crowKm: 1.0, durationMinutes: 15 })).toBeNull()
      expect(rejectionReason({ routedKm: 0.6, crowKm: 0.5, durationMinutes: 15 })).toBeNull()
    })

    /* A leg with no stated duration cannot be checked against one. That is not
     * a reason to throw the geometry away — the detour check still applies. */
    it('skips the duration check when there is no duration', () => {
      expect(rejectionReason({ routedKm: 2.21, crowKm: 1.0, durationMinutes: 0 })).toBeNull()
    })
  })

  /* Two hubs a few metres apart make every ratio meaningless noise, so the
   * detour check stands down rather than rejecting on a rounding error. */
  it('does not judge the detour when the two points are effectively the same', () => {
    expect(rejectionReason({ routedKm: 0.08, crowKm: 0.01, durationMinutes: 1 })).toBeNull()
  })

  it('rejects an empty or impossible length outright', () => {
    expect(rejectionReason({ routedKm: 0, crowKm: 0.5, durationMinutes: 10 })).toMatch(/zero/)
    expect(rejectionReason({ routedKm: NaN, crowKm: 0.5, durationMinutes: 10 })).toMatch(/zero/)
    expect(rejectionReason({ routedKm: -1, crowKm: 0.5, durationMinutes: 10 })).toMatch(/zero/)
  })
})
