import { z } from 'zod'
import {
  chooseOptions,
  describeCommute,
  manilaDate,
  manilaInstant,
  peakPenaltyAt,
  type CommutePreference,
  type PeakBand,
  type RouteOption,
  type Weekday,
} from '@onetup/core'
import { authenticated, parseBody } from '@/lib/api/handler'
import { enforceLimit } from '@/lib/api/rate-limit'
import { supabaseServer } from '@/lib/supabase/server'
import { runCapability } from '@/lib/ai/gateway'
import { HistorySchema } from '@/lib/ai/capabilities'
import { composeAnswer } from '@/lib/assistant/compose'
import { TEMPLATES, TEMPLATE_NAMES } from '@/lib/assistant/templates'

/**
 * The assistant.
 *
 * Routing is the main failure mode, so classification is a small, tightly
 * constrained call with a fixed enum output. Below its route's confidence floor
 * the assistant asks rather than guesses — a confidently misrouted question is
 * worse than one more exchange. The floors differ by what a wrong guess costs;
 * see `CONFIDENCE_FLOOR`.
 *
 * The router sees the conversation, not just the latest message. Most of what a
 * student types after their first question is a fragment — "what about MATH
 * 2103?", "and tomorrow?" — and a classifier reading those alone has nothing to
 * go on.
 *
 * `labelled` is false for `own_data` and `commute`, because the numbers were
 * computed and only the phrasing came from a template. Labelling those would
 * make the label meaningless where it actually matters (AI spec §8.3).
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const QueryRequest = z.object({
  query: z.string().min(1).max(1000),
  locale: z.enum(['en', 'fil', 'auto']).default('auto'),
  /** The last few turns, oldest first. See `HistorySchema` for why it matters. */
  history: HistorySchema,
})

/**
 * How sure the router has to be before the assistant acts rather than asks.
 *
 * Not one number. A wrong guess on `own_data` reports a wrong cut count, and a
 * wrong guess on `action` writes a row — both are worse than one more exchange,
 * so those stay at 0.7. A wrong guess on `general` costs a mediocre answer to a
 * question the student can simply rephrase, and holding it to the same bar was
 * making the assistant ask "what do you mean?" about perfectly clear questions.
 */
const CONFIDENCE_FLOOR: Record<string, number> = {
  own_data: 0.7,
  action: 0.7,
  commute: 0.6,
  navigation: 0.6,
  tup_knowledge: 0.5,
  general: 0.5,
}

const DEFAULT_FLOOR = 0.7

export const POST = authenticated(async (request, { user }) => {
  const body = await parseBody(request, QueryRequest)
  await enforceLimit(user.id, 'assistant')

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('student_number, full_name, program_code')
    .eq('id', user.id)
    .maybeSingle()

  const redaction = {
    studentNumber: profile?.student_number ?? null,
    fullName: profile?.full_name ?? null,
    email: user.email ?? null,
  }

  const routed = (
    await runCapability(
      'assistant_route',
      { query: body.query, available_templates: TEMPLATE_NAMES, history: body.history },
      { userId: user.id, redaction },
    )
  ).output as {
    route: string
    template: string | null
    parameters: Record<string, unknown>
    needs_composition: boolean
    confidence: number
  }

  if (routed.confidence < (CONFIDENCE_FLOOR[routed.route] ?? DEFAULT_FLOOR)) {
    return {
      route: 'clarify',
      answer:
        "I'm not sure what you're asking about — your own schedule and grades, something about TUP, or getting to campus?",
      computed: null,
      citations: [],
      actions: [],
      labelled: false,
    }
  }

  if (routed.route === 'own_data') {
    const template = routed.template ? TEMPLATES[routed.template] : undefined
    if (!template) {
      return {
        route: 'own_data',
        answer:
          "I can work out your cuts, your GWA, what's due, when you're free, and what grade you'd need. That one I can't do yet.",
        computed: null,
        citations: [],
        actions: [],
        labelled: false,
      }
    }

    /* One lookup, or several composed — the router already said which, so the
     * common question costs exactly the one model call it always did. See
     * `compose.ts` for the cap, the receipts and the grounding check. */
    const composed = routed.needs_composition
      ? await composeAnswer({
          context: { supabase, userId: user.id, now: new Date(), locale: body.locale },
          userId: user.id,
          redaction,
          query: body.query,
          history: body.history,
          firstTemplate: template.name,
          firstParameters: routed.parameters,
        })
      : null

    if (!composed) {
      const result = await template.run(
        { supabase, userId: user.id, now: new Date(), locale: body.locale },
        routed.parameters,
      )
      return {
        route: 'own_data',
        answer: result.answer,
        computed: { template: template.name, values: result.values },
        citations: [],
        actions: [],
        labelled: false,
      }
    }

    return {
      route: 'own_data',
      answer: composed.answer,
      computed: {
        template: composed.receipts.map((receipt) => receipt.template).join(' + '),
        values: Object.fromEntries(
          composed.receipts.map((receipt) => [receipt.template, receipt.values]),
        ),
      },
      /* Receipts: which lookups ran and what each one read. Non-negotiable for
       * anything that composes — a student who is told two things at once is
       * owed the ability to check both (10-FUTURE-ENHANCEMENTS.md §5.1). */
      receipts: composed.receipts.map((receipt) => ({
        template: receipt.template,
        read: receipt.answer,
      })),
      citations: [],
      actions: [],
      /* Still false. Every figure was computed; the model chose which lookups
       * to run and arranged their output into a sentence, and an answer whose
       * numbers are all computed is not generated content (AI spec §8.3). */
      labelled: false,
    }
  }

  if (routed.route === 'commute') {
    const { data: areas } = await supabase.from('commute_areas').select('name').eq('is_active', true)
    const names = (areas ?? []).map((area) => area.name)

    const intent = (
      await runCapability(
        'commute_intent',
        { query: body.query, known_areas: names, history: body.history },
        { userId: user.id, redaction },
      )
    ).output as {
      origin_area: string | null
      direction: string
      preference: string | null
      departure_time: string | null
      confidence: number
    }

    /* The intent call has its own confidence, and it was being ignored. A
     * misread area sends a student to the wrong side of the city with a fare
     * and a travel time attached, which is exactly the kind of confidently
     * wrong answer the routing floors exist to prevent. */
    if (intent.confidence < CONFIDENCE_FLOOR.commute) {
      return {
        route: 'commute',
        answer:
          "I'm not sure where you're travelling from. Which area — the commute screen has the list?",
        computed: null,
        citations: [],
        actions: [{ label: 'Open the commute screen', href: '/commute' }],
        labelled: false,
      }
    }

    if (!intent.origin_area) {
      return {
        route: 'commute',
        answer:
          "I don't have routes from there yet. Pick the nearest area on the commute screen, or add the route — the list comes from students.",
        computed: null,
        citations: [],
        actions: [],
        labelled: false,
      }
    }

    const { data: area } = await supabase
      .from('commute_areas')
      .select('id, name')
      .eq('name', intent.origin_area)
      .maybeSingle()

    const direction = intent.direction === 'outbound' ? 'outbound' : 'inbound'

    const { data: routes } = await supabase
      .from('v_route_summary')
      .select('*')
      .eq('area_id', area?.id ?? '')
      .eq('direction', direction)

    if (!routes || routes.length === 0) {
      return {
        route: 'commute',
        answer: `No routes on file from ${intent.origin_area} yet. You can add one — it takes a minute and it helps everyone from your area.`,
        computed: null,
        citations: [],
        actions: [{ label: 'Add a route', href: '/commute' }],
        labelled: false,
      }
    }

    /* The hour matters. A 9pm answer computed against the current time is wrong
     * by twenty minutes on exactly the corridors a student asks about, so the
     * departure time the model extracted is fed through `peak_bands` — the same
     * bands the departure screen uses. */
    const now = new Date()
    const departAt = intent.departure_time
      ? manilaInstant(manilaDate(now), intent.departure_time)
      : now

    const options = await withPeak(supabase, routes, departAt)
    const choice = chooseOptions(options, normalisePreference(intent.preference))
    if (!choice) {
      return {
        route: 'commute',
        answer: `No routes on file from ${intent.origin_area} yet. You can add one — it takes a minute and it helps everyone from your area.`,
        computed: null,
        citations: [],
        actions: [{ label: 'Add a route', href: '/commute' }],
        labelled: false,
      }
    }

    return {
      route: 'commute',
      answer: describeCommute(choice, {
        originArea: intent.origin_area,
        departureTime: intent.departure_time,
        now,
      }),
      computed: {
        template: 'commute_route',
        values: {
          primary: choice.primary,
          alternative: choice.alternative,
          departure_time: intent.departure_time,
          direction,
        },
      },
      citations: [],
      actions: [{ label: 'Open the commute screen', href: '/commute' }],
      /* The model extracted an origin and an hour. Every minute and every peso
       * came from `v_route_summary` and the fare rules, so this is not a
       * generated answer and marking it as one would make the label meaningless
       * where it matters (AI spec §8.3). */
      labelled: false,
    }
  }

  if (routed.route === 'navigation') {
    return {
      route: 'navigation',
      answer: 'The campus map has rooms, gates, printing and food, and it works without signing in.',
      computed: null,
      citations: [],
      actions: [{ label: 'Open the campus map', href: '/campus' }],
      labelled: false,
    }
  }

  /*
   * Everything else — a general question, or one about TUP itself.
   *
   * Retrieval over TUP's own documents is not wired up yet, so a question about
   * the university cannot be answered from sources. That used to end the
   * conversation with a flat refusal, which is how an assistant that is working
   * exactly as designed comes to look broken: most of what a student types is
   * neither a query against their own rows nor a commute.
   *
   * So the model answers, under a prompt that forbids it from stating anything
   * TUP-specific as fact (capabilities.ts, `assistant_general`). The grounding
   * rule that matters — never invent a policy, a prerequisite or a deadline —
   * still holds. What changes is that a student asking how to revise for finals
   * gets an answer instead of a door.
   *
   * `labelled` is true here, and it is the one route where it is: a model wrote
   * this, start to finish.
   */
  const isAboutTup = routed.route === 'tup_knowledge'

  try {
    const answer = (
      await runCapability(
        'assistant_general',
        { query: body.query, about_tup: isAboutTup, history: body.history },
        { userId: user.id, redaction },
      )
    ).output as string

    return {
      route: routed.route,
      answer,
      computed: null,
      citations: [],
      actions: [],
      labelled: true,
    }
  } catch {
    // The ladder is exhausted or the daily free-model quota is spent. Say what
    // still works rather than what does not.
    return {
      route: routed.route,
      answer: isAboutTup
        ? "I can't answer that one right now, and I don't have TUP's own handbook to check. The registrar or your department would know."
        : "I can't answer that one right now. Your schedule, cuts, grades and deadlines all still work — try asking about those.",
      computed: null,
      citations: [],
      actions: [],
      labelled: false,
    }
  }
})


function normalisePreference(value: string | null): CommutePreference | null {
  return value === 'cheapest' || value === 'fastest' || value === 'fewest_transfers' ? value : null
}

/**
 * The route rows, with what the chosen hour costs each of them.
 *
 * The peak penalty is per corridor, so it needs the legs — which is one extra
 * query for the whole set rather than one per route. Off-peak, and for any
 * route whose corridors have no band, this adds zero and changes nothing.
 */
async function withPeak(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  routes: readonly Record<string, unknown>[],
  departAt: Date,
): Promise<RouteOption[]> {
  const routeIds = routes.map((row) => String(row.route_id))

  const [{ data: legLinks }, { data: bandRows }] = await Promise.all([
    supabase
      .from('route_legs')
      .select('route_id, commute_legs(corridor)')
      .in('route_id', routeIds),
    supabase.from('peak_bands').select('*'),
  ])

  const corridorsOf = new Map<string, string[]>()
  for (const link of legLinks ?? []) {
    const leg = link.commute_legs as { corridor: string | null } | null
    if (!leg?.corridor) continue
    const id = String(link.route_id)
    const list = corridorsOf.get(id) ?? []
    if (!list.includes(leg.corridor)) list.push(leg.corridor)
    corridorsOf.set(id, list)
  }

  const bands: PeakBand[] = (bandRows ?? []).map((band) => ({
    corridor: String(band.corridor),
    days: (band.days ?? []) as Weekday[],
    startTime: String(band.start_time).slice(0, 5),
    endTime: String(band.end_time).slice(0, 5),
    penaltyMinutes: Number(band.penalty_minutes ?? 0),
    severity: (band.severity ?? 'moderate') as PeakBand['severity'],
  }))

  return routes.map((row) => {
    const routeId = String(row.route_id)
    const baseMinutes = Number(row.base_minutes ?? 0)
    const { minutes } = peakPenaltyAt(
      departAt,
      baseMinutes,
      corridorsOf.get(routeId) ?? [],
      bands,
    )

    return {
      routeId,
      label: (row.label as string | null) ?? null,
      baseMinutes,
      peakMinutes: minutes,
      fareStudent: Number(row.fare_student ?? 0),
      fareRegular: Number(row.fare_regular ?? 0),
      transfers: Number(row.transfers ?? 0),
      verifiedCount: Number(row.verified_count ?? 0),
      lastVerifiedAt: (row.last_verified_at as string | null) ?? null,
    }
  })
}
