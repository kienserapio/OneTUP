import { z } from 'zod'
import { authenticated, parseBody } from '@/lib/api/handler'
import { enforceLimit } from '@/lib/api/rate-limit'
import { supabaseServer } from '@/lib/supabase/server'
import { runCapability } from '@/lib/ai/gateway'
import { TEMPLATES, TEMPLATE_NAMES } from '@/lib/assistant/templates'

/**
 * The assistant.
 *
 * Routing is the main failure mode, so classification is a small, tightly
 * constrained call with a fixed enum output. Below 0.7 confidence the assistant
 * asks rather than guesses — a confidently misrouted question is worse than one
 * more exchange.
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
})

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
      { query: body.query, available_templates: TEMPLATE_NAMES },
      { userId: user.id, redaction },
    )
  ).output as {
    route: string
    template: string | null
    parameters: Record<string, unknown>
    confidence: number
  }

  if (routed.confidence < 0.7) {
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

  if (routed.route === 'commute') {
    const { data: areas } = await supabase.from('commute_areas').select('name').eq('is_active', true)
    const names = (areas ?? []).map((area) => area.name)

    const intent = (
      await runCapability(
        'commute_intent',
        { query: body.query, known_areas: names },
        { userId: user.id, redaction },
      )
    ).output as { origin_area: string | null; direction: string; preference: string | null }

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

    const { data: routes } = await supabase
      .from('v_route_summary')
      .select('*')
      .eq('area_id', area?.id ?? '')
      .eq('direction', intent.direction === 'outbound' ? 'outbound' : 'inbound')

    const ranked = (routes ?? []).sort((a, b) =>
      intent.preference === 'cheapest'
        ? Number(a.fare_student ?? 0) - Number(b.fare_student ?? 0)
        : Number(a.base_minutes ?? 0) - Number(b.base_minutes ?? 0),
    )

    if (ranked.length === 0) {
      return {
        route: 'commute',
        answer: `No routes on file from ${intent.origin_area} yet. You can add one — it takes a minute and it helps everyone from your area.`,
        computed: null,
        citations: [],
        actions: [],
        labelled: false,
      }
    }

    const best = ranked[0]
    return {
      route: 'commute',
      answer: `${best.label ?? 'That route'} takes about ${best.base_minutes} minutes for ₱${Number(best.fare_student ?? 0).toFixed(2)} with your student discount.`,
      computed: { template: 'commute_route', values: best },
      citations: [],
      actions: [],
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
        { query: body.query, about_tup: isAboutTup },
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
