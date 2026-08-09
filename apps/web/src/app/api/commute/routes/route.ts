import {
  computeLegFare,
  freshnessOf,
  rankRoutes,
  type FareRule,
  type FareRuleCode,
  type RouteRank,
} from '@onetup/core'
import { authenticated } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Route options from an origin area to TUP.
 *
 * Both the regular and the student fare come back on every leg. Showing both is
 * not decoration — it is how a student notices when a discount is being denied
 * to them at the door (ADR-011).
 */
export const GET = authenticated(async (request) => {
  const url = new URL(request.url)
  const areaId = url.searchParams.get('area_id')
  const direction = url.searchParams.get('direction') === 'outbound' ? 'outbound' : 'inbound'
  const rank = (url.searchParams.get('rank') ?? 'fastest') as RouteRank

  const supabase = await supabaseServer()

  const { data: fareRuleRows } = await supabase.from('fare_rules').select('*')
  const rules = new Map<FareRuleCode, FareRule>(
    (fareRuleRows ?? []).map((rule) => [
      rule.code,
      {
        code: rule.code,
        label: rule.label,
        discountPct: rule.discount_pct === null ? null : Number(rule.discount_pct),
        matrix: rule.matrix as FareRule['matrix'],
        rounding: rule.rounding as FareRule['rounding'],
      },
    ]),
  )

  let query = supabase
    .from('commute_routes')
    .select(
      'id, label, direction, status, verified_count, last_verified_at, ' +
        'route_legs(ordinal, commute_legs(*, ' +
        // Two foreign keys point at the same table, so each embed has to name
        // the constraint it travels. The hubs carry the only real coordinates
        // in the graph: leg geometry is crowdsourced and mostly still absent.
        'from_hub:commute_hubs!commute_legs_from_hub_id_fkey(lat, lng), ' +
        'to_hub:commute_hubs!commute_legs_to_hub_id_fkey(lat, lng)))',
    )
    .eq('direction', direction)
    .eq('status', 'approved')

  if (areaId) query = query.eq('area_id', areaId)

  const { data } = await query

  // The nested select defeats the client's row inference, so the shape is
  // asserted once here rather than fought with at every property access.
  const rows = (data ?? []) as unknown as {
    id: string
    label: string | null
    verified_count: number
    last_verified_at: string | null
    route_legs: unknown
  }[]

  const routes = rows.map((row) => {
    const legRows = ((row.route_legs ?? []) as unknown as {
      ordinal: number
      commute_legs: {
        id: string
        mode: string
        corridor: string | null
        from_label: string
        to_label: string
        base_fare: number
        fare_rule_code: string | null
        duration_minutes: number
        peak_penalty_minutes: number
        geometry: unknown
        notes: string | null
        last_verified_at: string | null
        from_hub: { lat: number; lng: number } | null
        to_hub: { lat: number; lng: number } | null
      } | null
    }[])
      .filter((entry) => entry.commute_legs)
      .sort((a, b) => a.ordinal - b.ordinal)

    const legs = legRows.map((entry) => {
      const leg = entry.commute_legs!
      const fare = computeLegFare(
        {
          baseFare: Number(leg.base_fare),
          fareRuleCode: leg.fare_rule_code,
          fromLabel: leg.from_label,
          toLabel: leg.to_label,
        },
        rules,
      )

      return {
        ordinal: entry.ordinal,
        mode: leg.mode,
        corridor: leg.corridor,
        from_label: leg.from_label,
        to_label: leg.to_label,
        duration_minutes: leg.duration_minutes,
        peak_penalty_minutes: leg.peak_penalty_minutes,
        fare_regular: fare.regular,
        fare_student: fare.student,
        fare_rule: fare.ruleCode,
        discount_applied: fare.discountApplied,
        geometry: leg.geometry,
        from_point: leg.from_hub,
        to_point: leg.to_hub,
        notes: leg.notes,
        freshness: freshnessOf(leg.last_verified_at),
      }
    })

    return {
      id: row.id,
      label: row.label,
      legs,
      totalMinutes: legs.reduce((sum, leg) => sum + leg.duration_minutes, 0),
      totalFareRegular: round2(legs.reduce((sum, leg) => sum + leg.fare_regular, 0)),
      totalFareStudent: round2(legs.reduce((sum, leg) => sum + leg.fare_student, 0)),
      transfers: legs.filter((leg) => leg.mode !== 'walk').length,
      verifiedCount: row.verified_count,
      lastVerifiedAt: row.last_verified_at,
      freshness: freshnessOf(row.last_verified_at),
    }
  })

  return {
    routes: rankRoutes(routes, rank),
    // Stale data is demoted, not hidden: it is still the only route from some
    // areas, and a flagged route beats no route at all.
    attribution:
      'Routes and fares come from students. Confirm a route after you ride it so the next person gets it right.',
  }
})

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
