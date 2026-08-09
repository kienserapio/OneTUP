import {
  DEFAULT_DEPARTURE_PREFERENCES,
  addDays,
  computeDeparturePlan,
  manilaDate,
  nextClassDay,
  type PeakBand,
  type ScheduleBlock,
  type Weekday,
} from '@onetup/core'
import { errors } from '@/lib/api/errors'
import { authenticated } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'
import { precipitationForDate, worstInWindow } from '@/lib/weather/open-meteo'

/**
 * The departure plan.
 *
 * Entirely deterministic — no model touches this, including the explanation,
 * which is templated from the adjustments that actually fired (ADR-007). A
 * wrong wake time is a real-world harm, so nothing here is allowed to be
 * plausible-but-generated.
 */

export const runtime = 'nodejs'

export const GET = authenticated(async (request, { user }) => {
  const url = new URL(request.url)
  const requested = url.searchParams.get('date')

  const supabase = await supabaseServer()

  const [{ data: preferences }, { data: blockRows }, { data: bandRows }] = await Promise.all([
    supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('schedule_blocks')
      .select('id, enrollment_id, title, day, start_time, end_time, room, source'),
    supabase.from('peak_bands').select('*'),
  ])

  const blocks: ScheduleBlock[] = (blockRows ?? []).map((block) => ({
    id: block.id,
    enrollmentId: block.enrollment_id,
    label: block.title ?? 'Class',
    day: block.day as Weekday,
    startTime: block.start_time.slice(0, 5),
    endTime: block.end_time.slice(0, 5),
    room: block.room,
    source: block.source as ScheduleBlock['source'],
  }))

  if (blocks.length === 0) {
    throw errors.notFound('No schedule yet, so there is nothing to plan around.')
  }

  const from = requested ?? manilaDate(new Date())
  const classDay = nextClassDay(blocks, from)
  if (!classDay) {
    return { plan: null, reason: 'no_class_day' as const }
  }

  const routeId = preferences?.default_route_id ?? null
  if (!routeId) {
    return { plan: null, reason: 'no_route_saved' as const }
  }

  const { data: route } = await supabase
    .from('v_route_summary')
    .select('*')
    .eq('route_id', routeId)
    .maybeSingle()

  if (!route) {
    return { plan: null, reason: 'no_route_saved' as const }
  }

  // The corridors this route travels decide which peak bands can apply at all.
  const { data: legRows } = await supabase
    .from('route_legs')
    .select('commute_legs(corridor, mode)')
    .eq('route_id', routeId)

  const corridors = [
    ...new Set(
      (legRows ?? [])
        .map(
          (row) =>
            (row.commute_legs as unknown as { corridor: string | null } | null)?.corridor ?? null,
        )
        .filter((corridor): corridor is string => Boolean(corridor)),
    ),
  ]

  const peakBands: PeakBand[] = (bandRows ?? []).map((band) => ({
    corridor: band.corridor,
    days: band.days as Weekday[],
    startTime: band.start_time.slice(0, 5),
    endTime: band.end_time.slice(0, 5),
    penaltyMinutes: band.penalty_minutes,
    severity: band.severity as PeakBand['severity'],
  }))

  const firstBlock = classDay.blocks[0]
  const baseMinutes = Number(route.base_minutes ?? 0)

  const prefs = {
    preparationMinutes:
      preferences?.preparation_minutes ?? DEFAULT_DEPARTURE_PREFERENCES.preparationMinutes,
    arriveEarlyMinutes:
      preferences?.arrive_early_minutes ?? DEFAULT_DEPARTURE_PREFERENCES.arriveEarlyMinutes,
    applyPeakAdjustment: preferences?.apply_peak_adjustment ?? true,
    applyWeatherAdjustment: preferences?.apply_weather_adjustment ?? true,
    weatherThresholdPct:
      preferences?.weather_threshold_pct ?? DEFAULT_DEPARTURE_PREFERENCES.weatherThresholdPct,
    weatherBufferMinutes:
      preferences?.weather_buffer_minutes ?? DEFAULT_DEPARTURE_PREFERENCES.weatherBufferMinutes,
  }

  // A first pass with no weather establishes the travel window; the forecast is
  // then read for that window rather than for an arbitrary hour.
  const dry = computeDeparturePlan({
    planDate: classDay.date,
    classStart: firstBlock.startTime,
    baseMinutes,
    corridors,
    peakBands,
    preferences: prefs,
  })

  let weather = null
  if (prefs.applyWeatherAdjustment) {
    const hours = await precipitationForDate(classDay.date)
    const worst = worstInWindow(
      hours,
      new Date(dry.leaveAt.getTime() + 8 * 3_600_000).toISOString().slice(11, 16),
      new Date(dry.arriveBy.getTime() + 8 * 3_600_000).toISOString().slice(11, 16),
    )
    if (worst) {
      weather = { precipitationProbabilityPct: worst.probabilityPct, hour: worst.hour }
    }
  }

  const plan = computeDeparturePlan({
    planDate: classDay.date,
    classStart: firstBlock.startTime,
    baseMinutes,
    corridors,
    peakBands,
    weather,
    preferences: prefs,
  })

  await supabase.from('departure_plans').upsert(
    {
      user_id: user.id,
      plan_date: plan.planDate,
      first_block_id: firstBlock.id,
      route_id: routeId,
      class_start: plan.classStart.toISOString(),
      arrive_by: plan.arriveBy.toISOString(),
      leave_at: plan.leaveAt.toISOString(),
      wake_at: plan.wakeAt.toISOString(),
      base_minutes: plan.baseMinutes,
      peak_minutes: plan.peakMinutes,
      weather_minutes: plan.weatherMinutes,
      explanation: plan.explanation,
      // `{kind, minutes, reason}` per applied adjustment — this is what the
      // templated explanation is built from, kept so a student can always see
      // exactly why their alarm moved.
      adjustments: plan.adjustments as unknown as never,
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,plan_date' },
  )

  return {
    plan: {
      plan_date: plan.planDate,
      class_start: plan.classStart.toISOString(),
      arrive_by: plan.arriveBy.toISOString(),
      leave_at: plan.leaveAt.toISOString(),
      wake_at: plan.wakeAt.toISOString(),
      base_minutes: plan.baseMinutes,
      adjustments: plan.adjustments,
      explanation: plan.explanation,
      route_id: routeId,
      iterations: plan.iterations,
    },
    next_plan_date: addDays(plan.planDate, 1),
  }
})
