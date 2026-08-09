/**
 * Fare computation.
 *
 * Fares are stored as a base figure plus a rule reference, never as two
 * numbers (ADR-011). The 20% student discount is statutory and applies at
 * display time, so a regulated fare change is one edit that propagates
 * everywhere — and both figures can be shown, which is how a student notices
 * when a discount is being denied to them.
 */

export type TransportMode =
  | 'walk'
  | 'jeep'
  | 'bus'
  | 'uv_express'
  | 'rail'
  | 'tricycle'
  | 'taxi'
  | 'tnvs'

export type FareRuleCode = 'puv_student_20' | 'rail_matrix' | 'flat' | 'free' | (string & {})

export interface FareRule {
  code: FareRuleCode
  label: string
  discountPct: number | null
  /** For rail: `{ [fromPoint]: { [toPoint]: { regular, student } } }`. */
  matrix: Record<string, Record<string, { regular: number; student: number }>> | null
  /** Operators round differently; 'none' keeps centavos. */
  rounding?: 'none' | 'nearest_peso' | 'up_quarter'
}

export interface LegFareInput {
  baseFare: number
  fareRuleCode: FareRuleCode | null
  fromLabel: string
  toLabel: string
}

export interface LegFare {
  regular: number
  student: number
  /** True when the student figure came from a rule rather than the base fare. */
  discountApplied: boolean
  ruleCode: FareRuleCode | null
}

export const STUDENT_DISCOUNT_PCT = 20

export function roundFare(value: number, mode: FareRule['rounding'] = 'none'): number {
  switch (mode) {
    case 'nearest_peso':
      return Math.round(value)
    case 'up_quarter':
      return Math.ceil(value * 4) / 4
    default:
      return Math.round(value * 100) / 100
  }
}

/**
 * Resolves one leg's regular and student fare.
 *
 * An unknown rule falls back to charging the regular fare rather than guessing
 * at a discount — showing a student a fare lower than they will be asked for is
 * the failure that costs them at the turnstile.
 */
export function computeLegFare(leg: LegFareInput, rules: Map<FareRuleCode, FareRule>): LegFare {
  const rule = leg.fareRuleCode ? rules.get(leg.fareRuleCode) : undefined
  const regular = roundFare(leg.baseFare, rule?.rounding)

  if (!rule) {
    return { regular, student: regular, discountApplied: false, ruleCode: leg.fareRuleCode }
  }

  switch (rule.code) {
    case 'free':
      return { regular: 0, student: 0, discountApplied: false, ruleCode: rule.code }

    case 'flat':
      return { regular, student: regular, discountApplied: false, ruleCode: rule.code }

    case 'rail_matrix': {
      const entry = rule.matrix?.[leg.fromLabel]?.[leg.toLabel]
      if (!entry) {
        return { regular, student: regular, discountApplied: false, ruleCode: rule.code }
      }
      return {
        regular: roundFare(entry.regular, rule.rounding),
        student: roundFare(entry.student, rule.rounding),
        discountApplied: entry.student < entry.regular,
        ruleCode: rule.code,
      }
    }

    default: {
      const pct = rule.discountPct ?? STUDENT_DISCOUNT_PCT
      const student = roundFare(leg.baseFare * (1 - pct / 100), rule.rounding)
      return { regular, student, discountApplied: student < regular, ruleCode: rule.code }
    }
  }
}

export interface RouteLegLike extends LegFareInput {
  mode: TransportMode
  durationMinutes: number
  peakPenaltyMinutes: number
}

export interface RouteTotals {
  regular: number
  student: number
  baseMinutes: number
  /** Legs excluding walking — what a student means by "how many rides". */
  transfers: number
}

export function computeRouteTotals(
  legs: readonly RouteLegLike[],
  rules: Map<FareRuleCode, FareRule>,
): RouteTotals {
  let regular = 0
  let student = 0
  let baseMinutes = 0
  let transfers = 0

  for (const leg of legs) {
    const fare = computeLegFare(leg, rules)
    regular += fare.regular
    student += fare.student
    baseMinutes += leg.durationMinutes
    if (leg.mode !== 'walk') transfers += 1
  }

  return {
    regular: Math.round(regular * 100) / 100,
    student: Math.round(student * 100) / 100,
    baseMinutes,
    transfers,
  }
}

export function formatPeso(amount: number): string {
  return `₱${amount.toFixed(2).replace(/\.00$/, '')}`
}

// --- Freshness ------------------------------------------------------------

export type Freshness = 'fresh' | 'aging' | 'stale' | 'unverified'

export const FRESHNESS_DAYS = { fresh: 30, aging: 90 } as const

/**
 * Crowdsourced fares go stale. Every record carries a verification date and a
 * stale one is marked and demoted rather than quietly presented as current
 * (PRD §8.5).
 */
export function freshnessOf(
  lastVerifiedAt: Date | string | null,
  now: Date = new Date(),
): Freshness {
  if (!lastVerifiedAt) return 'unverified'
  const verified = lastVerifiedAt instanceof Date ? lastVerifiedAt : new Date(lastVerifiedAt)
  const days = (now.getTime() - verified.getTime()) / 86_400_000
  if (days <= FRESHNESS_DAYS.fresh) return 'fresh'
  if (days <= FRESHNESS_DAYS.aging) return 'aging'
  return 'stale'
}

export function describeFreshness(freshness: Freshness): string {
  switch (freshness) {
    case 'fresh':
      return 'Checked recently'
    case 'aging':
      return 'Not checked in over a month'
    case 'stale':
      return 'Not checked in over three months — confirm before you rely on it'
    case 'unverified':
      return 'Never confirmed by a student'
  }
}

// --- Ranking --------------------------------------------------------------

export type RouteRank = 'fastest' | 'cheapest' | 'fewest_transfers'

export interface RankableRoute {
  id: string
  totalMinutes: number
  totalFareStudent: number
  transfers: number
  freshness: Freshness
  lastVerifiedAt: Date | string | null
  verifiedCount: number
}

const FRESHNESS_PENALTY: Record<Freshness, number> = {
  fresh: 0,
  aging: 1,
  stale: 2,
  unverified: 3,
}

/**
 * Ranks routes on one criterion. Stale data is demoted rather than hidden:
 * a stale route is still the only route from some areas, and a student is
 * better served by seeing it flagged than by seeing nothing.
 */
export function rankRoutes<T extends RankableRoute>(routes: readonly T[], by: RouteRank): T[] {
  const primary = (route: T): number => {
    switch (by) {
      case 'fastest':
        return route.totalMinutes
      case 'cheapest':
        return route.totalFareStudent
      case 'fewest_transfers':
        return route.transfers
    }
  }

  return [...routes].sort((a, b) => {
    const demotion = FRESHNESS_PENALTY[a.freshness] - FRESHNESS_PENALTY[b.freshness]
    if (demotion !== 0) return demotion

    const byPrimary = primary(a) - primary(b)
    if (byPrimary !== 0) return byPrimary

    const recency = verifiedTime(b) - verifiedTime(a)
    if (recency !== 0) return recency

    return b.verifiedCount - a.verifiedCount
  })
}

function verifiedTime(route: RankableRoute): number {
  if (!route.lastVerifiedAt) return 0
  return new Date(route.lastVerifiedAt).getTime()
}
