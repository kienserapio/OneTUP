# OneTUP — Making the assistant worth opening

**Status:** **§4, §5, §6 and §8 Phase 5 built** (September 2026) — conversation
memory, answer shape, commute answers, and tool use. **§3 is cancelled**: a
second model provider was rejected and OpenRouter stays the only vendor
([16-NEXT-EIGHT.md](16-NEXT-EIGHT.md) §2). Read doc 16 §§6–7 and §10 for what
was built differently, including the composition gate that keeps tool use inside
the free tier's daily quota.
**Superseded in part:** §3 and Phase 2 of §8 — the second provider — are
**cancelled**. OneTUP stays on OpenRouter alone; see
[16-NEXT-EIGHT.md](16-NEXT-EIGHT.md) §2 for the decision and §3 for what
replaces it. The privacy obligation in §3.2 lapses with it. Everything else
in this document stands.
**Date:** August 2026
**Depends on:** [06-AI-SPEC.md](06-AI-SPEC.md), [02-ARD.md](02-ARD.md) (ADR-006, ADR-007), [10-FUTURE-ENHANCEMENTS.md](10-FUTURE-ENHANCEMENTS.md)

Ask OneTUP works. It is also flat, forgets everything between questions, and
answers a commute question with one sentence about one route. This document is
about why each of those is true and what specifically to change — including the
model, which is the part everyone reaches for first and is not actually the
biggest problem.

---

## 1. What exists

Worth stating precisely, because most of what a better assistant needs is
already here and the temptation is to rebuild rather than extend.

| Piece | Where | What it does |
|---|---|---|
| Provider boundary | `lib/ai/provider.ts` | The only file that knows a vendor. OpenRouter, model ids from `AI_TIER_*` env, a ladder per tier with fallback on 429/5xx/timeout/empty/truncated-JSON |
| Gateway | `lib/ai/gateway.ts` | validate → cache → redact → select → prompt → call → validate → repair once → post-validate → cache → log. The 30-day cache is why this fits in a free tier |
| Capabilities | `lib/ai/capabilities.ts` | Seven: `announcement_extract`, `deadline_extract`, `assistant_route`, `assistant_answer_grounded`, `assistant_general`, `evaluation_polish`, `commute_intent` |
| Templates | `lib/assistant/templates.ts` | Six computed answers: `absences_remaining`, `free_blocks`, `deadlines_due`, `gwa_now`, `grade_needed`, `next_class` |
| Router | `api/assistant/query/route.ts` | Classifies into `own_data` / `tup_knowledge` / `commute` / `navigation` / `action` / `general`, then dispatches |

The architecture is right and this plan changes none of it. ADR-007 — any number
a student acts on is computed, never generated — is the reason the templates
exist and it stays.

---

## 2. Why it feels bland

Five causes. Only one of them is the model, and it is not the biggest.

### 2.1 It has no memory

`POST /api/assistant/query` accepts `{ query, locale }`. That is the whole
input. `ask-view.tsx` keeps `turns` on the client and renders them, but nothing
is ever sent back.

So "how many cuts do I have in CS 3105?" works, and "what about MATH 2103?"
cannot. Every question starts from nothing. **This is the single largest cause
of the assistant feeling mechanical**, and it is the cheapest to fix.

### 2.2 The prompts ask for flatness

`assistant_general` says: two to five sentences, no markdown, no preamble, no
offer to help further. Every one of those rules was written against a real
failure — a model padding an answer, or formatting a table into a chat bubble —
and most should stay. But together they produce prose with no shape at all, and
a `temperature` of 0.4 on top of that is not going to rescue it.

The fix is not "let it ramble". It is to let the *answer* have structure when
the question has structure: a three-step process should be three steps.

### 2.3 The clarify gate fires too often

`assistant_route` is told to set confidence below 0.7 whenever a question is
ambiguous or could belong to more than one route, and below 0.7 the assistant
asks instead of answering:

> I'm not sure what you're asking about — your own schedule and grades,
> something about TUP, or getting to campus?

For `own_data` and `action` that caution is right: guessing writes data or
reports a wrong number. For `general` it is a door closed on a question the
model could simply have answered.

### 2.4 The free ladder is reasoning models on a token floor

`MIN_MAX_TOKENS = 1200` exists because free-tier reasoning models spend their
budget thinking and get truncated mid-thought. The comment in `provider.ts`
tells that story well. It works, and the cost is latency — a small free model
thinking for 1200 tokens before writing three sentences is why the assistant
feels slow as well as flat.

### 2.5 Commute answers stop at one sentence

The `commute` route already works: `commute_intent` extracts origin, direction
and preference, then `v_route_summary` is queried and ranked. The answer is one
templated sentence about the single best route.

A student asking "how do I get home from TUP at 9pm" gets a fastest-route
sentence with no mention that it is 9pm, no second option, and no way to ask a
follow-up (§2.1).

---

## 3. A second provider — cancelled

> **This section is no longer the plan.** Kept for the reasoning, which is
> still the right reasoning if a second provider is ever revisited. The
> decision and its replacement are in [16-NEXT-EIGHT.md](16-NEXT-EIGHT.md)
> §2 and §3.

### 3.1 Why

Not because OpenRouter is bad — because one free ladder is one point of failure,
and because the models on it rotate without warning. A second provider under the
same boundary is resilience first and quality second.

| | Free tier |
|---|---|
| **Gemini** (AI Studio key) | Flash and Flash-Lite free, per-day request caps that reset at midnight Pacific. Free-tier inputs and outputs may be used to improve Google's models |
| **OpenRouter** `:free` | 20 requests/minute; 50/day unfunded, 1,000/day after a one-time $10 credit purchase |

DeepSeek is cheap, not free, and is worth revisiting only if there is a budget.

### 3.2 The privacy condition

Gemini's free tier trains on what it is sent. That is acceptable here **only
because the gateway already redacts before the provider is called** —
`redactDeep` strips the student number, full name and email using the
`RedactionContext` the route assembles. Two obligations follow:

1. `06-AI-SPEC.md` gets a sentence saying which provider a tier may reach and
   what that provider does with the input. A student can read that document.
2. No capability that carries un-redactable personal content goes to a
   training-on-input tier. Today that is none of them, because ADR-007 keeps
   personal numbers on the computed path and out of prompts entirely. Keep it
   that way.

### 3.3 The change

`provider.ts` is already the only vendor-aware file (ADR-006), so this is one
file plus configuration. Dispatch on a prefix in the existing ladder:

```
AI_TIER_FAST=gemini:gemini-flash-lite-latest,openrouter:google/gemma-4-26b-a4b-it:free,...
```

`complete()` splits on the first `:`, and calls `callOpenRouter` or
`callGemini`. Fallback, timeout, truncation and error mapping stay exactly where
they are — the ladder does not care which vendor a rung is.

For the Gemini adapter, `@google/genai`:

```ts
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const response = await ai.models.generateContent({
  model,
  contents: request.user,
  config: {
    systemInstruction: request.system,
    temperature: request.temperature ?? 0.2,
    maxOutputTokens: Math.max(request.maxTokens, MIN_MAX_TOKENS),
    ...(request.json
      ? { responseMimeType: 'application/json', responseSchema: schema }
      : {}),
    // Gemini 3 Flash: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'.
    thinkingConfig: { thinkingLevel: 'LOW' },
  },
})
```

Two things this buys beyond a second vendor:

- **`responseSchema` instead of a prompt asking nicely for JSON.** The gateway's
  repair-once path exists because free models wrap JSON in prose. A schema
  enforced by the provider removes a whole class of failure — and the
  `extractJson` recovery in `provider.ts` stays for the OpenRouter rungs.
- **`thinkingLevel`.** The `MIN_MAX_TOKENS` floor is a workaround for
  uncontrollable reasoning budgets. Where the provider exposes the dial, use it:
  `MINIMAL` or `LOW` for extraction and routing, higher only for the assistant.

---

## 4. Memory

The fix for §2.1, and the one with the largest effect per line changed.

```ts
const QueryRequest = z.object({
  query: z.string().min(1).max(1000),
  locale: z.enum(['en', 'fil', 'auto']).default('auto'),
  /* The last few turns, oldest first. Capped hard: a long history is a large
   * prompt on a free tier, and the fourth-last thing a student asked is
   * rarely what makes the next question make sense. */
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) }))
    .max(6)
    .default([]),
})
```

Three consequences, each of which has to be handled deliberately:

- **`assistant_route` sees the history too.** "What about MATH 2103?" classifies
  as `own_data` with template `absences_remaining` only if the previous turn is
  in front of it. This is the point of the change.
- **The cache key must include the history.** `buildCacheKey` hashes capability,
  version and input; history is part of the input, so this works as long as
  history is genuinely in the input object. Get this wrong and two students
  asking "what about MATH 2103?" after different questions share an answer.
- **History is redacted like everything else.** It goes through `redactDeep`
  because it is model input, no exceptions.

The client already holds `turns`; it sends the last three pairs.

---

## 5. Answers with shape

For §2.2, and narrower than it sounds.

- **Keep the length rule for a factual answer.** "How many cuts do I have" is a
  sentence, and a model that turns it into five bullets is worse.
- **Allow a list where the answer is a list.** `assistant_general` already says
  "use a short list only when the answer really is a list of steps" — the model
  cannot comply, because the same prompt then forbids markdown. Permit `-` at
  the start of a line, nothing else. Render it as a list; keep every other
  markdown construct out.
- **Raise `temperature` to 0.6 for `assistant_general` only.** Extraction stays
  at 0.2, where determinism is the point.
- **Answer the language it was asked in.** The prompt says so; nothing checks
  it. The evaluation set (`09-IMPLEMENTATION-PLAN.md`) should include Taglish
  cases, because a student who writes Taglish and gets formal English back has
  been answered by something that is not paying attention.

And relax §2.3: when the router lands on `general` with confidence between 0.5
and 0.7, answer instead of clarifying. Keep the gate at 0.7 for `own_data` and
`action`, where a wrong guess reports a wrong number or writes a row.

---

## 6. Commute questions worth asking

The `commute` route already resolves an origin and ranks routes. What it needs
is to answer the question that was actually asked.

**Time of day.** `commute_intent` extracts origin, direction and preference. Add
`depart_at`. The departure planner in `@onetup/core` already applies
`peak_bands`; a 9pm answer that ignores that is wrong by twenty minutes on the
corridors where it matters most.

**More than one option.** Two routes, not one: the fastest and the cheapest,
when they differ. That is the comparison the commute screen exists to make, and
it is what a student actually wants at the gate.

**Say what is known and what is guessed.** `verified_count` and
`last_verified_at` are on the row already. A route nobody has confirmed in three
months should say so in the answer, not only on the screen.

**A follow-up should work.** "What about from Cubao?" — §4.

**Still computed, still not generated.** Fares and minutes come from
`v_route_summary` and the fare rules; the model extracts intent and nothing
else. `labelled: false` on this route is correct and stays.

---

## 7. Where this meets the agentic roadmap

[10-FUTURE-ENHANCEMENTS.md](10-FUTURE-ENHANCEMENTS.md) argues the real shift is
from a chatbot that waits to an agent that acts between sessions, and it is
right — but the two are not sequential. Sections 3 to 6 here are what makes the
reactive assistant good, and three of them are also prerequisites for the
agentic loop:

| This plan | What §10 needs it for |
|---|---|
| Second provider, schema-enforced JSON | A background agent cannot ask a student to retry a malformed answer |
| History in the request | An agent's chain is a conversation with itself |
| Commute intent with `depart_at` | "Move the alarm because the quiz is at 2pm" is a departure recomputation |

The bridge between them is **tool use**: today the router picks one of six
templates and stops. An assistant that can call a template, read the result, and
decide whether it needs another is one loop around the same pieces — and it is
the same loop the event-driven agent runs, minus the trigger.

Two rules from §10 apply the moment that loop exists, and are cheaper to build
in now than to retrofit:

- **Receipts.** Every action an assistant takes on a student's behalf shows what
  it did and what it read.
- **Undo on everything.** Including the ones that look harmless.

Do not start the agentic loop until an assistant that answers well is boring.
An agent built on a bland assistant is a bland assistant that also writes to the
database.

---

## 8. Build order

### Phase 1 — Memory (~2 days)

- [ ] `history` on the request schema, capped at six turns
- [ ] Passed to `assistant_route` and to `assistant_general`
- [ ] Included in the cache key, and redacted like every other input
- [ ] `ask-view.tsx` sends the last three pairs
- [ ] Evaluation cases for follow-ups: "what about MATH 2103?", "and tomorrow?"

### Phase 2 — ~~The Gemini adapter~~ → repair the OpenRouter ladder (~minutes)

Replaced. See [16-NEXT-EIGHT.md](16-NEXT-EIGHT.md) §3 — three rungs in
`.env.example` no longer exist upstream, and fixing that buys more than a
second vendor would have.

<details><summary>The cancelled checklist</summary>

- [ ] `provider.ts` dispatches on a `vendor:model` prefix
- [ ] `callGemini` via `@google/genai`, with `responseSchema` where the
      capability declares `json`
- [ ] `.env.example` documents both prefixes and where each key comes from
- [ ] `06-AI-SPEC.md` records which providers a tier may reach and what each
      does with the input
- [ ] Verify the ladder still falls through: a Gemini quota exhaustion must land
      on the next rung, not on `AI_UNAVAILABLE`

</details>

### Phase 3 — Answers that read like answers (~2 days)

- [ ] Lists permitted in `assistant_general`, and only lists
- [ ] `temperature` 0.6 for that capability alone
- [ ] Clarify gate relaxed for `general`, unchanged for `own_data` and `action`
- [ ] Taglish cases in the evaluation set

### Phase 4 — Commute answers (~3 days)

- [ ] `depart_at` on `commute_intent`, fed into the departure planner
- [ ] Two options where fastest and cheapest differ
- [ ] Freshness stated in the answer when a route is stale
- [ ] A follow-up that changes only the origin works

### Phase 5 — Tool use (~1 week, and the door to §10)

- [ ] The router may call a template, read its result, and decide to call another
- [ ] A hard cap on calls per question
- [ ] Receipts in the response: which templates ran, what they read
- [ ] Then, and only then, revisit `10-FUTURE-ENHANCEMENTS.md` §2

---

## 9. Things that will bite

- **A cache key without the history in it.** Two students get each other's
  follow-up answers. Silent, and the kind of bug that is found by a screenshot.
- **A provider that trains on input, reached by a capability carrying a name.**
  The redaction layer is what makes §3 acceptable; a capability added later
  without a `RedactionContext` quietly removes that.
- **Longer answers mistaken for better ones.** The length rules exist because a
  model padding a cut count is worse than one stating it. Loosen shape, not
  length.
- **Reasoning budget spent on extraction.** `announcement_extract` does not need
  to think. Where the dial exists, turn it down; the free ladder's slowness is
  mostly this.
- **A commute answer that sounds certain about a route nobody has ridden this
  term.** `last_verified_at` exists so the answer can be honest. Use it.
- **Building the agent first.** §7.
