import { describe, expect, it } from 'vitest'
import {
  FRESHNESS_DAYS,
  STUDENT_DISCOUNT_PCT,
  computeLegFare,
  computeRouteTotals,
  describeFreshness,
  formatPeso,
  freshnessOf,
  rankRoutes,
  roundFare,
} from '@onetup/core'
import type { FareRule, FareRuleCode, RankableRoute, RouteLegLike } from '@onetup/core'

const RULES = new Map<FareRuleCode, FareRule>([
  [
    'puv_student_20',
    {
      code: 'puv_student_20',
      label: 'Public utility vehicle, 20% student discount',
      discountPct: 20,
      matrix: null,
      rounding: 'none',
    },
  ],
  [
    'rail_matrix',
    {
      code: 'rail_matrix',
      label: 'Rail point-to-point matrix',
      discountPct: null,
      matrix: {
        Recto: {
          'Doroteo Jose': { regular: 15, student: 12 },
          Blumentritt: { regular: 20, student: 16 },
        },
      },
      rounding: 'none',
    },
  ],
  ['flat', { code: 'flat', label: 'Flat fare', discountPct: null, matrix: null, rounding: 'none' }],
  ['free', { code: 'free', label: 'Free ride', discountPct: null, matrix: null, rounding: 'none' }],
])

function leg(overrides: Partial<RouteLegLike> = {}): RouteLegLike {
  return {
    mode: 'jeep',
    durationMinutes: 20,
    peakPenaltyMinutes: 0,
    baseFare: 13,
    fareRuleCode: 'puv_student_20',
    fromLabel: 'Home',
    toLabel: 'TUP Manila',
    ...overrides,
  }
}

describe('roundFare', () => {
  it('keeps centavos by default', () => {
    expect(roundFare(10.4)).toBe(10.4)
    expect(roundFare(10.406)).toBe(10.41)
  })

  it('applies the operator-specific roundings', () => {
    expect(roundFare(10.4, 'nearest_peso')).toBe(10)
    expect(roundFare(10.6, 'nearest_peso')).toBe(11)
    expect(roundFare(10.4, 'up_quarter')).toBe(10.5)
    expect(roundFare(10.0, 'up_quarter')).toBe(10)
  })
})

describe('computeLegFare', () => {
  it('applies the statutory 20% student discount at display time', () => {
    expect(STUDENT_DISCOUNT_PCT).toBe(20)
    // Both figures are shown, which is how a student notices a denied discount.
    expect(computeLegFare(leg({ baseFare: 13 }), RULES)).toEqual({
      regular: 13,
      student: 10.4,
      discountApplied: true,
      ruleCode: 'puv_student_20',
    })
  })

  it('falls back to 20% when a discounting rule states no percentage', () => {
    const rules = new Map<FareRuleCode, FareRule>([
      [
        'puv_other',
        { code: 'puv_other', label: 'Other PUV', discountPct: null, matrix: null },
      ],
    ])
    expect(computeLegFare(leg({ fareRuleCode: 'puv_other', baseFare: 15 }), rules)).toMatchObject({
      regular: 15,
      student: 12,
      discountApplied: true,
    })
  })

  it('charges nothing at all under the free rule', () => {
    expect(computeLegFare(leg({ fareRuleCode: 'free', baseFare: 13 }), RULES)).toEqual({
      regular: 0,
      student: 0,
      discountApplied: false,
      ruleCode: 'free',
    })
  })

  it('charges the same to everyone under the flat rule', () => {
    expect(computeLegFare(leg({ fareRuleCode: 'flat', baseFare: 15 }), RULES)).toEqual({
      regular: 15,
      student: 15,
      discountApplied: false,
      ruleCode: 'flat',
    })
  })

  describe('rail_matrix', () => {
    it('takes both figures straight from the matrix on a hit', () => {
      expect(
        computeLegFare(
          leg({
            fareRuleCode: 'rail_matrix',
            mode: 'rail',
            baseFare: 13,
            fromLabel: 'Recto',
            toLabel: 'Doroteo Jose',
          }),
          RULES,
        ),
      ).toEqual({ regular: 15, student: 12, discountApplied: true, ruleCode: 'rail_matrix' })
    })

    it('charges the full base fare on a miss rather than inventing a discount', () => {
      // A student shown less than the turnstile will ask for is the failure
      // that costs them money, so a missing matrix entry pays full price.
      const miss = computeLegFare(
        leg({
          fareRuleCode: 'rail_matrix',
          mode: 'rail',
          baseFare: 13,
          fromLabel: 'Recto',
          toLabel: 'Bambang',
        }),
        RULES,
      )
      expect(miss).toEqual({
        regular: 13,
        student: 13,
        discountApplied: false,
        ruleCode: 'rail_matrix',
      })
    })

    it('charges the full base fare when the origin is not in the matrix either', () => {
      expect(
        computeLegFare(
          leg({ fareRuleCode: 'rail_matrix', fromLabel: 'Katipunan', toLabel: 'Recto' }),
          RULES,
        ),
      ).toMatchObject({ student: 13, discountApplied: false })
    })

    it('reports no discount when the matrix lists the same figure for both', () => {
      const rules = new Map<FareRuleCode, FareRule>([
        [
          'rail_matrix',
          {
            code: 'rail_matrix',
            label: 'Rail',
            discountPct: null,
            matrix: { Recto: { Legarda: { regular: 15, student: 15 } } },
            rounding: 'none',
          },
        ],
      ])
      expect(
        computeLegFare(
          leg({ fareRuleCode: 'rail_matrix', fromLabel: 'Recto', toLabel: 'Legarda' }),
          rules,
        ),
      ).toMatchObject({ regular: 15, student: 15, discountApplied: false })
    })
  })

  describe('an unknown rule', () => {
    /**
     * Guessing at a discount for a rule we do not have is the one failure that
     * costs a student at the turnstile, so the full fare is charged instead.
     */
    it('falls back to the full fare when the code is not in the rule set', () => {
      expect(computeLegFare(leg({ fareRuleCode: 'p2p_premium', baseFare: 90 }), RULES)).toEqual({
        regular: 90,
        student: 90,
        discountApplied: false,
        ruleCode: 'p2p_premium',
      })
    })

    it('falls back to the full fare when the leg carries no rule at all', () => {
      expect(computeLegFare(leg({ fareRuleCode: null, baseFare: 25 }), RULES)).toEqual({
        regular: 25,
        student: 25,
        discountApplied: false,
        ruleCode: null,
      })
    })

    it('falls back to the full fare against an empty rule set', () => {
      expect(
        computeLegFare(leg({ baseFare: 13 }), new Map<FareRuleCode, FareRule>()).student,
      ).toBe(13)
    })
  })

  it('honours the rule rounding on the discounted figure', () => {
    const rules = new Map<FareRuleCode, FareRule>([
      [
        'puv_rounded',
        {
          code: 'puv_rounded',
          label: 'PUV, rounded to the peso',
          discountPct: 20,
          matrix: null,
          rounding: 'nearest_peso',
        },
      ],
    ])
    // 13 × 0.8 = 10.40, which the operator collects as 10.
    expect(computeLegFare(leg({ fareRuleCode: 'puv_rounded', baseFare: 13 }), rules)).toMatchObject(
      { regular: 13, student: 10 },
    )
  })
})

describe('computeRouteTotals', () => {
  it('sums both fares and counts rides rather than legs', () => {
    const totals = computeRouteTotals(
      [
        leg({ mode: 'walk', durationMinutes: 8, baseFare: 0, fareRuleCode: 'free' }),
        leg({ mode: 'jeep', durationMinutes: 20, baseFare: 13 }),
        leg({
          mode: 'rail',
          durationMinutes: 25,
          baseFare: 13,
          fareRuleCode: 'rail_matrix',
          fromLabel: 'Recto',
          toLabel: 'Blumentritt',
        }),
        leg({ mode: 'walk', durationMinutes: 5, baseFare: 0, fareRuleCode: 'free' }),
      ],
      RULES,
    )

    // 0 + 13 + 20 regular; 0 + 10.40 + 16 student.
    expect(totals.regular).toBe(33)
    expect(totals.student).toBe(26.4)
    expect(totals.baseMinutes).toBe(58)
    expect(totals.transfers).toBe(2)
  })

  it('totals to zero for an empty route', () => {
    expect(computeRouteTotals([], RULES)).toEqual({
      regular: 0,
      student: 0,
      baseMinutes: 0,
      transfers: 0,
    })
  })

  it('does not accumulate floating-point dust across many legs', () => {
    const totals = computeRouteTotals(
      Array.from({ length: 5 }, () => leg({ baseFare: 13 })),
      RULES,
    )
    expect(totals.student).toBe(52)
  })
})

describe('formatPeso', () => {
  it('drops trailing zero centavos and keeps real ones', () => {
    expect(formatPeso(13)).toBe('₱13')
    expect(formatPeso(10.4)).toBe('₱10.40')
    expect(formatPeso(0)).toBe('₱0')
    expect(formatPeso(10.45)).toBe('₱10.45')
  })
})

describe('freshnessOf', () => {
  const NOW = new Date('2026-03-16T09:00:00+08:00')
  const DAY = 86_400_000

  it('uses the documented day cutoffs', () => {
    expect(FRESHNESS_DAYS).toEqual({ fresh: 30, aging: 90 })
  })

  it('reports never-confirmed data as unverified', () => {
    expect(freshnessOf(null, NOW)).toBe('unverified')
  })

  it('is fresh up to and including 30 days', () => {
    expect(freshnessOf(NOW, NOW)).toBe('fresh')
    expect(freshnessOf(new Date(NOW.getTime() - 29 * DAY), NOW)).toBe('fresh')
    expect(freshnessOf(new Date(NOW.getTime() - 30 * DAY), NOW)).toBe('fresh')
  })

  it('turns aging one millisecond past 30 days', () => {
    expect(freshnessOf(new Date(NOW.getTime() - 30 * DAY - 1), NOW)).toBe('aging')
    expect(freshnessOf(new Date(NOW.getTime() - 60 * DAY), NOW)).toBe('aging')
    expect(freshnessOf(new Date(NOW.getTime() - 90 * DAY), NOW)).toBe('aging')
  })

  it('turns stale one millisecond past 90 days', () => {
    expect(freshnessOf(new Date(NOW.getTime() - 90 * DAY - 1), NOW)).toBe('stale')
    expect(freshnessOf(new Date(NOW.getTime() - 365 * DAY), NOW)).toBe('stale')
  })

  it('accepts an ISO string', () => {
    expect(freshnessOf(new Date(NOW.getTime() - 10 * DAY).toISOString(), NOW)).toBe('fresh')
  })

  it('describes each state in words a student can act on', () => {
    expect(describeFreshness('fresh')).toBe('Checked recently')
    expect(describeFreshness('stale')).toContain('confirm before you rely on it')
    expect(describeFreshness('unverified')).toBe('Never confirmed by a student')
  })
})

describe('rankRoutes', () => {
  function route(overrides: Partial<RankableRoute> & { id: string }): RankableRoute {
    return {
      totalMinutes: 60,
      totalFareStudent: 30,
      transfers: 2,
      freshness: 'fresh',
      lastVerifiedAt: '2026-03-01T00:00:00Z',
      verifiedCount: 1,
      ...overrides,
    }
  }

  /**
   * Stale data is demoted rather than hidden: a stale route is still the only
   * route from some areas, and a flagged route beats no route at all.
   */
  it('puts a slower fresh route above a faster stale one', () => {
    const ranked = rankRoutes(
      [
        route({ id: 'stale-and-fast', totalMinutes: 20, freshness: 'stale' }),
        route({ id: 'fresh-and-slow', totalMinutes: 60, freshness: 'fresh' }),
      ],
      'fastest',
    )
    expect(ranked.map((r) => r.id)).toEqual(['fresh-and-slow', 'stale-and-fast'])
  })

  it('orders the whole freshness ladder ahead of the primary criterion', () => {
    const ranked = rankRoutes(
      [
        route({ id: 'unverified', totalMinutes: 10, freshness: 'unverified' }),
        route({ id: 'stale', totalMinutes: 20, freshness: 'stale' }),
        route({ id: 'aging', totalMinutes: 30, freshness: 'aging' }),
        route({ id: 'fresh', totalMinutes: 40, freshness: 'fresh' }),
      ],
      'fastest',
    )
    expect(ranked.map((r) => r.id)).toEqual(['fresh', 'aging', 'stale', 'unverified'])
  })

  it('ranks by the criterion asked for within a freshness band', () => {
    const routes = [
      route({ id: 'a', totalMinutes: 60, totalFareStudent: 15, transfers: 3 }),
      route({ id: 'b', totalMinutes: 45, totalFareStudent: 40, transfers: 2 }),
      route({ id: 'c', totalMinutes: 90, totalFareStudent: 25, transfers: 1 }),
    ]
    expect(rankRoutes(routes, 'fastest').map((r) => r.id)).toEqual(['b', 'a', 'c'])
    expect(rankRoutes(routes, 'cheapest').map((r) => r.id)).toEqual(['a', 'c', 'b'])
    expect(rankRoutes(routes, 'fewest_transfers').map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('breaks a tie on the more recently verified route, then on confirmations', () => {
    const ranked = rankRoutes(
      [
        route({ id: 'older', lastVerifiedAt: '2026-03-01T00:00:00Z', verifiedCount: 9 }),
        route({ id: 'newer', lastVerifiedAt: '2026-03-10T00:00:00Z', verifiedCount: 1 }),
      ],
      'fastest',
    )
    expect(ranked.map((r) => r.id)).toEqual(['newer', 'older'])

    const byCount = rankRoutes(
      [
        route({ id: 'few', lastVerifiedAt: '2026-03-10T00:00:00Z', verifiedCount: 1 }),
        route({ id: 'many', lastVerifiedAt: '2026-03-10T00:00:00Z', verifiedCount: 12 }),
      ],
      'fastest',
    )
    expect(byCount.map((r) => r.id)).toEqual(['many', 'few'])
  })

  it('does not mutate the array it was handed', () => {
    const routes = [route({ id: 'a', totalMinutes: 90 }), route({ id: 'b', totalMinutes: 10 })]
    rankRoutes(routes, 'fastest')
    expect(routes.map((r) => r.id)).toEqual(['a', 'b'])
  })
})
