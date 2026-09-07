import 'server-only'

import { unsupportedNumbers } from '@onetup/core'
import { runCapability } from '@/lib/ai/gateway'
import { log } from '@/lib/api/handler'
import { TEMPLATES, type TemplateContext } from '@/lib/assistant/templates'
import type { HistoryTurn } from '@/lib/ai/capabilities'
import type { RedactionContext } from '@/lib/ai/redact'

/**
 * Composed answers.
 *
 * Until now the router picked exactly one template and its sentence was the
 * answer. That is right for *"ilang cuts pa ako"* and wrong for *"can I still
 * skip Thursday?"* — which is `absences_remaining` **and** `next_class`, two
 * facts the app already knew and could never put in one sentence.
 *
 * Three things bound this, and each of them is load-bearing:
 *
 * **A hard cap.** At most `MAX_TEMPLATES` lookups and `MAX_COMPOSE_CALLS` model
 * calls per question. An uncapped tool loop on a free tier whose daily quota is
 * fifty requests is not a feature, it is an outage with extra steps.
 *
 * **Receipts.** The response carries which templates ran and what they read.
 * `10-FUTURE-ENHANCEMENTS.md` §5.1 makes receipts non-negotiable for anything
 * that acts, and this is the first thing in the product that composes.
 *
 * **Every number still comes from a template.** The model chooses *which*
 * lookups run; it never produces a figure. The composed answer is checked
 * against the material it was composed from, and one carrying a number nothing
 * computed is thrown away rather than repaired — a fabricated cut count reads
 * exactly like a real one (ADR-007).
 */

/** Including the one the router already chose. */
export const MAX_TEMPLATES = 3

/** One pass that may ask for more, one that must answer. Nothing beyond that. */
export const MAX_COMPOSE_CALLS = 2

export interface Receipt {
  template: string
  /** What that lookup returned, verbatim. The receipt is the evidence. */
  answer: string
  values: Record<string, unknown>
}

export interface ComposedAnswer {
  answer: string
  receipts: Receipt[]
  /** True when more than one lookup contributed. */
  composed: boolean
  /** Set when a composition was discarded, so the log can say why. */
  fellBack: 'ungrounded' | 'no_answer' | 'model_unavailable' | null
}

export interface ComposeRequest {
  context: TemplateContext
  userId: string
  redaction: RedactionContext
  query: string
  history: HistoryTurn[]
  firstTemplate: string
  firstParameters: Record<string, unknown>
}

export async function composeAnswer(request: ComposeRequest): Promise<ComposedAnswer | null> {
  const first = TEMPLATES[request.firstTemplate]
  if (!first) return null

  const receipts: Receipt[] = []
  const run = async (name: string, parameters: Record<string, unknown>) => {
    const template = TEMPLATES[name]
    if (!template) return
    if (receipts.some((receipt) => receipt.template === name)) return
    const result = await template.run(request.context, parameters)
    receipts.push({ template: name, answer: result.answer, values: result.values })
  }

  await run(request.firstTemplate, request.firstParameters)
  if (receipts.length === 0) return null

  /* The single-lookup answer, ready to return if composition adds nothing or
   * fails. It is a real answer, not a fallback of last resort — most questions
   * end here and should. */
  const single: ComposedAnswer = {
    answer: receipts[0].answer,
    receipts,
    composed: false,
    fellBack: null,
  }

  let composed: { answer: string; sources: string[] } | null = null

  for (let pass = 0; pass < MAX_COMPOSE_CALLS; pass++) {
    const mayRequestMore = pass < MAX_COMPOSE_CALLS - 1 && receipts.length < MAX_TEMPLATES
    const used = new Set(receipts.map((receipt) => receipt.template))

    let output: { need: { template: string; parameters: Record<string, unknown> }[]; answer: string }
    try {
      output = (
        await runCapability(
          'assistant_compose',
          {
            query: request.query,
            history: request.history,
            results: receipts.map((receipt) => ({
              template: receipt.template,
              answer: receipt.answer,
            })),
            available: Object.values(TEMPLATES)
              .filter((template) => !used.has(template.name))
              .map((template) => `${template.name} — ${template.description}`),
            may_request_more: mayRequestMore,
          },
          { userId: request.userId, redaction: request.redaction },
        )
      ).output as typeof output
    } catch {
      /* The ladder is exhausted or the daily quota is spent. The single-lookup
       * answer is still correct and still computed; there is no reason to fail
       * a question the app could already answer. */
      return { ...single, fellBack: 'model_unavailable' }
    }

    if (output.need.length > 0 && mayRequestMore) {
      for (const request_ of output.need.slice(0, MAX_TEMPLATES - receipts.length)) {
        await run(request_.template, request_.parameters)
      }
      continue
    }

    if (output.answer.trim()) {
      composed = {
        answer: output.answer.trim(),
        sources: [request.query, ...receipts.flatMap(sourcesOf)],
      }
    }
    break
  }

  if (!composed) {
    return { ...single, receipts, fellBack: 'no_answer' }
  }

  /* The check that makes tool use safe. Every figure in the composed sentence
   * must appear in what it was composed from. */
  const invented = unsupportedNumbers(composed.answer, composed.sources)
  if (invented.length > 0) {
    log('warn', 'assistant.compose.ungrounded', {
      templates: receipts.map((receipt) => receipt.template),
      unsupported: invented,
    })
    /* Discarded, not repaired. The lookups themselves are still true, so the
     * student gets those rather than nothing — joined, because two computed
     * sentences are a worse answer than one composed sentence and a much better
     * answer than an invented one. */
    return {
      answer: receipts.map((receipt) => receipt.answer).join(' '),
      receipts,
      composed: receipts.length > 1,
      fellBack: 'ungrounded',
    }
  }

  return {
    answer: composed.answer,
    receipts,
    composed: receipts.length > 1,
    fellBack: null,
  }
}

/**
 * Everything a receipt legitimately puts numbers into.
 *
 * Both the sentence and the raw values, because a template may compute a figure
 * it does not print — `absences_remaining` returns the allowance alongside the
 * remainder — and the composition is entitled to use it.
 */
function sourcesOf(receipt: Receipt): string[] {
  return [receipt.answer, JSON.stringify(receipt.values)]
}
