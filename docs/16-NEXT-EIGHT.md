# OneTUP — The next eight

**Status:** plan only. Nothing in this document is built.
**Date:** September 2026
**Depends on:** [11-HANDOVER.md](11-HANDOVER.md) §6, [12-CLASSROOMS-PLAN.md](12-CLASSROOMS-PLAN.md),
[13-COMMUTE-ROUTING-PLAN.md](13-COMMUTE-ROUTING-PLAN.md), [14-ASSISTANT-PLAN.md](14-ASSISTANT-PLAN.md),
[15-SUSPENSIONS-PLAN.md](15-SUSPENSIONS-PLAN.md)

Documents `12`–`15` each argue for a feature. This one decides **which eight
happen next and in what order**, and carries the detail for the two that have no
plan of their own. Where `13`, `14` or `15` already made a decision, this
document points at it rather than restating it — and where a decision made since
those documents *overrides* them, it says so explicitly.

---

## 1. The eight, in order

| # | Feature | Source | Blocked by | Effort |
|---|---|---|---|---|
| 1 | Model ladder repair | this doc §3 | nothing | minutes |
| 2 | Study packs | this doc §4 | nothing | ~1 week |
| 3 | Suspension advisories, Phase 1 | `15` §7 | nothing | ~2 days |
| 4 | Assistant memory | `14` §4 | nothing | ~2 days |
| 5 | Answers with shape | `14` §5 | nothing | ~2 days |
| 6 | Walk-leg geometry | `13` §9 Ph. 1 | nothing | ~2 days |
| 7 | Commute answers | `14` §6 | 4 | ~3 days |
| 8 | Assistant tool use | `14` §8 Ph. 5 | 4, 5 | ~1 week |

Nothing in this list waits on a person, a permission, an account, or a paid
tier. That is the property that got these eight chosen over the alternatives in
§11.

**Order is not arbitrary.** `1` is a live defect and costs minutes. `2` is the
largest amount of finished-but-invisible work in the repository. `3` is the
highest value per day of any feature here. `4` is a prerequisite for `7` and `8`
and the cheapest fix for the loudest complaint. `6` is independent of everything
and can be done by anyone at any point.

---

## 2. Decisions this document records

Four decisions were made in the session that produced this list. Each one
changes a plan that already existed, so each is written down where it can be
found again.

**A second provider is rejected. OpenRouter stays the only vendor.**
`14` §3 argues for a Gemini adapter and §8 Phase 2 schedules it. That phase is
**cancelled** — see §3 below for what replaces it. The privacy obligation in
`14` §3.2 is cancelled with it, since no training-on-input tier is now reached.

**The knowledge base stays dormant.** `015_knowledge_base.sql` built
`knowledge_documents`, `knowledge_chunks` and `match_knowledge_chunks()` in
full, with grants and indexes, and nothing has ever called them. Seeding it
needs authoritative TUP curriculum and policy documents, and the schema refuses
a chunk without a traceable source. **The decision is to ground the assistant on
the student's own records instead** — which is what §10 builds. `tup_knowledge`
questions continue to be answered by a model and continue to carry
`labelled: true`. This is the status quo; nothing regresses.

**Push notifications are not a priority.** `12` §13 already defers them. This
confirms it. The consequence is that `15` Phase 3 and `12` Phase 5 stay out of
this list, and the dispatch cron is not written yet.

**The Supabase region move is on hold.** `OPERATIONS.md` has the runbook when
it is wanted.

---

## 3. Feature 1 — Model ladder repair

### 3.1 Why this is first

**Three rungs in `.env.example` no longer exist on OpenRouter.** Checked against
`https://openrouter.ai/api/v1/models`:

- `nvidia/nemotron-3-nano-30b-a3b:free`
- `openai/gpt-oss-20b:free`
- `nvidia/nemotron-nano-12b-v2-vl:free` — one of only four rungs in `AI_TIER_VISION`

Nothing crashes. `provider.ts:171` turns a 4xx into a `RetryableProviderError`
and falls through, which is exactly the guard that was added for this. But the
ladder is **shorter than it reads**, and the whole point of a long ladder
(`.env.example:27`) is defeated quietly.

`AI_TIER_VISION` is the one to worry about: one of its four rungs is gone and a
second (`gemma-4-31b`) is a sibling of the first, so a `gemma` outage takes most
of the tier with it.

### 3.2 What is actually available

**Eighteen** free models exist on OpenRouter today. Of those, seven support both
reasoning and structured outputs — and structured outputs matter, because
`announcement_extract`, `deadline_extract`, `assistant_route` and
`commute_intent` all ask for JSON.

| Model | Context | Reasoning | JSON | Vision |
|---|---|---|---|---|
| `minimax/minimax-m3:free` | 1,048,576 | yes | yes | yes |
| `dots-studio/dots-3-note-preview:free` | 512,000 | yes | yes | yes |
| `google/gemma-4-26b-a4b-it:free` | 262,144 | yes | yes | yes |
| `google/gemma-4-31b-it:free` | 262,144 | yes | yes | yes |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262,144 | yes | yes | no |
| `minimax/minimax-m2.7:free` | 196,608 | yes | yes | no |
| `liquid/lfm-2.5-2.6b:free` | 65,536 | yes | yes | no |

`minimax/minimax-m3:free` is the only free model that does all four. It leads
every tier where quality matters more than latency.

**A rung without structured-output support is not useless** — it still serves
prose capabilities — **but it will burn a retry on every JSON capability before
falling through.** So the JSON-capable models go first, and the long-context
reasoning-only models (`nemotron-3.5-lightning`, `nemotron-3-ultra-550b`) sit at
the bottom of `AI_TIER_LONG` where the input size is the binding constraint.

### 3.3 The change

`.env.example:24` is the rule: **changing a model is an environment edit, never
a code change.** No file in `apps/web/src` is touched.

```
AI_TIER_FAST=google/gemma-4-26b-a4b-it:free,minimax/minimax-m2.7:free,google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free
AI_TIER_STANDARD=minimax/minimax-m3:free,google/gemma-4-26b-a4b-it:free,nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free,minimax/minimax-m2.7:free
AI_TIER_LONG=minimax/minimax-m3:free,dots-studio/dots-3-note-preview:free,nvidia/nemotron-3.5-lightning:free,nvidia/nemotron-3-ultra-550b-a55b:free
AI_TIER_REASON=minimax/minimax-m3:free,nvidia/nemotron-3-super-120b-a12b:free,dots-studio/dots-3-note-preview:free,google/gemma-4-26b-a4b-it:free
AI_TIER_VISION=google/gemma-4-26b-a4b-it:free,minimax/minimax-m3:free,google/gemma-4-31b-it:free,dots-studio/dots-3-note-preview:free
```

`AI_TIER_FAST` deliberately does **not** lead with `minimax-m3`. That tier
exists for latency, and a 1M-context reasoning model is the wrong shape for it.
`gemma-4-26b-a4b` is a 4B-active MoE — it stays first.

### 3.4 Build

- [ ] Replace the five ladders in `.env.example`
- [ ] Mirror them into the local `.env`, then `pnpm env:sync`
- [ ] One live question per tier through `/ask`, confirming the first rung answers
- [ ] A note in `06-AI-SPEC.md` that the ladder was verified against the live
      model list on this date, and how to re-check it

### 3.5 The maintenance problem this exposes

Free models are withdrawn without notice, and nothing tells you. Three had gone
before anybody looked. **Worth a small script** — `scripts/check-models.mjs`,
fetching `/api/v1/models` and diffing it against the ladders in `.env.example`,
exiting non-zero on a missing rung. It is a dozen lines, it belongs in the
`check` CI job, and it converts a silent degradation into a failed build.

---

## 4. Feature 2 — Study packs

The largest piece of finished, invisible work in the repository.

### 4.1 What already exists

**The schema, in full.** `013_study.sql` created six tables with RLS, policies,
indexes and `updated_at` triggers:

| Table | Notes |
|---|---|
| `study_packs` | `status` (`processing`/`ready`/`failed`), `source_path` for Storage, `model_used`, `prompt_version`, optional `enrollment_id` |
| `study_chunks` | ordinal, content, `vector(384)` embedding |
| `flashcards` | front/back plus the SM-2 columns: `ease_factor`, `interval_days`, `repetitions`, `due_on`, `lapses` |
| `flashcard_reviews` | one row per review, `quality` 0–5 |
| `practice_questions` | question, answer, explanation, difficulty |
| `study_sessions` | six modes: `pomodoro`, `flashcards`, `blurt`, `feynman`, `practice_test`, `cram` |

Every generated artefact carries `source_chunk_id`. The migration comment says
why: it is what turns "check it against the source" from a disclaimer into an
action.

**The algorithm, tested.** `packages/core/src/study/sm2.ts` exports
`initialCardState`, `reviewCard`, `compressForDeadline`, `orderReviewQueue`,
`QUALITY`, `MINIMUM_EASE_FACTOR`, `DEFAULT_EASE_FACTOR`. The interesting one is
`compressForDeadline` — intervals shorten so every card is seen before an exam,
and are never stretched.

**The rate limit.** `rate-limit.ts:35` already carries
`study_pack: { limit: 3, windowSeconds: 86_400 }`.

**The icon.** `IconStudy` exists in `components/ui/icon.tsx` — currently borrowed
by Faculty eval, which will want its own once Study has a real claim on it.

**What does not exist:** any route under `apps/web/src/app/api/study`, any page,
any component, and any import of `sm2.ts` anywhere in `apps/web/src`. Confirmed
by search: zero references.

### 4.2 The decision that shapes the phasing

The schema was designed around **AI generation from an uploaded document** —
`source_path`, `model_used`, `prompt_version`, `source_chunk_id`, embeddings.
That is the eventual shape and none of it should be dropped.

**But Phase 1 builds none of it.** A student typing their own cards exercises
every table except `study_chunks`, needs no model call, no Storage bucket, no
embedding pipeline, and no rate limit — and it ships a working spaced-repetition
system in days rather than weeks. `source_chunk_id` is nullable precisely
because a hand-written card has no source.

The order is therefore: **review loop first, generation second.** The reverse
order builds a generator whose output has nowhere to go.

### 4.3 The rule that matters

**The review queue is computed, never stored.** `due_on` is a column; the
*order* cards are shown in is not. `orderReviewQueue` runs per render against
whatever is due today, the same way `deadlines/urgency` recomputes its bands
(ADR-007, and `11-HANDOVER.md` §2). A stored queue is a queue that is wrong the
moment a review lands.

**And a review is two writes, not one.** `flashcard_reviews` gets a row (the
history, immutable) and `flashcards` gets its SM-2 state updated (the
projection). Writing only the second loses the ability to ever recompute; writing
only the first means the next queue is wrong.

### 4.4 Offline

`lib/offline/db.ts:15` states the current position outright: *"days, study pack
contents, and assistant history are excluded: they are not what a student needs
while walking between buildings, and keeping them would bloat the store."*

**That stays true for pack contents and stays wrong for the review queue.** A
commute is the single best time to review flashcards and the single worst time
for signal. The resolution:

- `study_packs` and `flashcards` **join** the offline set — a pack's cards are
  small text rows, and they are the point
- `study_chunks`, `practice_questions` and `study_sessions` **stay out** — chunks
  are the bloat the comment is about
- `flashcard_reviews` is **queued, never read back** — it is append-only, so a
  queued insert needs no conflict target and no local copy

Which means `lib/offline/keys.ts` needs no new entry: both new entities are keyed
on `id`, and `naturalKeyFor` returns `undefined` for an append-only insert. The
comment in `db.ts` gets amended rather than deleted, because its reasoning is
still right about chunks.

### 4.5 Files

Nothing here needs a migration.

**Core** — nothing new. `sm2.ts` is complete and its tests pass.

**API**

- `app/api/study/packs/route.ts` — `GET` the student's packs, `POST` a new one
  (`title`, optional `enrollment_id`; `status` goes straight to `ready` for a
  hand-made pack)
- `app/api/study/packs/[id]/route.ts` — `GET` one pack with its cards, `PATCH`
  title, `DELETE`
- `app/api/study/packs/[id]/cards/route.ts` — `POST` a card, using
  `initialCardState()` for the SM-2 columns
- `app/api/study/cards/[id]/route.ts` — `PATCH` front/back, `DELETE`
- `app/api/study/cards/[id]/review/route.ts` — the one that matters. Body is
  `{ quality: 0|3|4|5 }`. Reads the card's state, calls `reviewCard`, applies
  `compressForDeadline` when the pack's `enrollment_id` has a deadline inside
  seven days, writes both rows.

All of them follow the house idiom in
`app/api/classrooms/[id]/posts/route.ts`: `authenticated(...)` from
`lib/api/handler`, a `zod` schema through `parseBody`, `supabaseServer()`, and
`segments(request)` for the path id.

**Queries**

- `lib/queries/study.ts` — `packsFor(userId)`, `packWithCards(packId)`,
  `dueToday(userId)`. `dueToday` reads `flashcards` where `due_on <= today` and
  hands the rows to `orderReviewQueue`; the index `idx_cards_due (user_id,
  due_on)` already exists for exactly this.

**Pages**

- `app/(app)/study/page.tsx` — the pack list
- `app/(app)/study/new/page.tsx`
- `app/(app)/study/[id]/page.tsx` — one pack, its cards, edit and add
- `app/(app)/study/review/page.tsx` — the queue across all packs

**Components** — `components/study/`

- `study-view.tsx` — the list, at dashboard density: a figure strip
  (**due today**, **cards**, **packs**, **streak**), two columns above 1024px.
  `today-view.tsx` is the reference, per `11-HANDOVER.md` §9.
- `pack-create.tsx`, `pack-detail.tsx`, `card-editor.tsx`
- `review-session.tsx` — one card at a time, tap to flip, then four buttons
  mapped to `QUALITY`: Again `0`, Hard `3`, Good `4`, Easy `5`. The next interval
  is shown on each button before it is pressed, because a student choosing
  between them is choosing when they next see the card.

**Navigation** — a `Study` item in `nav-items.ts`, in the **Academics** group,
above Faculty eval. It does not go in `PHONE_NAV`: that list is deliberately
four, and `MORE_NAV` picks it up automatically.

### 4.6 Build

**Phase 1 — the review loop (~4 days)**

- [ ] `lib/queries/study.ts`
- [ ] The five API routes
- [ ] `study-view.tsx`, `pack-create.tsx`, `pack-detail.tsx`, `card-editor.tsx`
- [ ] `review-session.tsx` with the four quality buttons and their intervals
- [ ] Nav entry; a distinct icon for Study, leaving `IconStudy` to Faculty eval
- [ ] `apps/web/tests/` — the review route writes both rows; a `quality < 3`
      resets `repetitions` and increments `lapses`; a card reviewed today does
      not reappear in today's queue

**Phase 2 — offline (~1 day)**

- [ ] `study_packs` and `flashcards` into `EntityName` and the sync set
- [ ] `flashcard_reviews` as a queued append-only insert
- [ ] Amend the exclusion comment in `db.ts` to name chunks rather than packs
- [ ] Verified the way the classroom write was: review three cards in airplane
      mode, reconnect, confirm three rows and the right SM-2 state

**Phase 3 — deadline compression (~1 day)**

- [ ] `compressForDeadline` wired into the review route, sourcing
      `daysUntilDeadline` from the pack's enrollment
- [ ] The pack detail says *every card before Friday* when it is compressing, so
      the behaviour is visible rather than mysterious

**Phase 4 — generation (~3 days, and the first one that needs a model)**

- [ ] A Storage bucket, RLS-scoped per user, for `source_path`
- [ ] A `study_pack_generate` capability in `capabilities.ts`, `tier: 'long'`
- [ ] Chunk the upload into `study_chunks`; generate cards carrying
      `source_chunk_id`
- [ ] `enforceLimit(user.id, 'study_pack')` — the policy is already written
- [ ] `status` moves `processing` → `ready`/`failed`, and the UI shows all three
- [ ] Every generated card is marked generated, and links to its chunk (ADR-007)

Embeddings on `study_chunks` stay null until something searches them. Phase 4
does not need them.

---

## 5. Feature 3 — Suspension advisories, Phase 1

Fully specified in [15-SUSPENSIONS-PLAN.md](15-SUSPENSIONS-PLAN.md). What
follows is only what is needed to start.

**Migration `036`.** Both pieces from `15` §4 in one file: the
`delivery_mode` column on `attendance_records` with its comment, and the
`suspension_advisories` table with its unique constraint. Read-only reference —
everyone selects, only `service_role` writes — so RLS is one permissive select
policy and no per-user clause. Grants in the same file, per the lesson in
`022`/`023` that a correct policy without a `GRANT` yields *permission denied*.

**The card.** `components/today/suspension-card.tsx`, rendered by
`today-view.tsx` only on `effective_on = today`. Three actions, and `15` §5 is
precise about all three: *My classes were cancelled* writes `cancelled` through
the existing attendance path; *They moved online* writes `present` with
`delivery_mode = 'online'` and **prompts per class rather than guessing which
ones**, reusing `attendance-prompt.tsx`; *Dismiss* writes nothing.

**`--warning`, never `--danger`.** It is a notice.

**The rule that must not be broken:** an advisory never cancels a class by
itself. `15` §1 is the whole feature. A signal-1 announcement suspends
face-to-face classes and half the faculty move online; auto-marking `cancelled`
would delete a class the student attended, in their own attendance record.

**Build**

- [ ] `036_suspensions.sql` — column, table, RLS, grants
- [ ] `pnpm db:types`
- [ ] `lib/queries/today.ts` — the advisory for today
- [ ] `suspension-card.tsx`, wired into `today-view.tsx`
- [ ] Seed one advisory by hand; confirm each of the three actions writes exactly
      what `15` §5 says, and that Dismiss writes nothing

Phase 2 (PAGASA polling) and Phase 3 (the human path, which needs push) stay out
of this list. Note that `class_posts.kind` already accepts `'suspension'`, so
Phase 3's classroom half is half-built already.

---

## 6. Feature 4 — Assistant memory

[14-ASSISTANT-PLAN.md](14-ASSISTANT-PLAN.md) §4 carries the schema and the
reasoning. The largest effect per line changed in this whole list.

**Three things that are easy to get wrong**, all named in `14` §4:

1. **`assistant_route` must see the history**, not just the answer capability.
   *"What about MATH 2103?"* only classifies as `own_data` with template
   `absences_remaining` if the previous turn is in front of the router. This is
   the entire point.
2. **History goes into the cache key.** `buildCacheKey` hashes capability,
   version and input — so this works only if history is genuinely inside the
   input object. Get it wrong and two students asking the same follow-up after
   different questions share an answer.
3. **History is redacted.** It is model input; `redactDeep` applies, no
   exception.

**Build**

- [ ] `history` on the request schema — `max(6)`, oldest first, 2000 chars each
- [ ] Passed to `assistant_route` and `assistant_general`
- [ ] Confirmed inside the hashed input, not alongside it
- [ ] `ask-view.tsx` sends the last three pairs from the `turns` it already holds
- [ ] Evaluation cases: *"what about MATH 2103?"*, *"and tomorrow?"*

---

## 7. Feature 5 — Answers with shape

[14-ASSISTANT-PLAN.md](14-ASSISTANT-PLAN.md) §5. Narrower than it sounds, and
none of it is a model change.

The contradiction to fix: `assistant_general` tells the model to *"use a short
list only when the answer really is a list of steps"* and then forbids markdown.
The model cannot comply with both.

- [ ] Permit `-` at the start of a line in `assistant_general`, and nothing else;
      render it as a list, keep every other markdown construct out
- [ ] `temperature` 0.6 for `assistant_general` alone — extraction stays at 0.2,
      where determinism is the point
- [ ] Clarify gate relaxed to 0.5 for `general`; **unchanged at 0.7 for
      `own_data` and `action`**, where a wrong guess reports a wrong number or
      writes a row
- [ ] Taglish cases in the evaluation set — a student who writes Taglish and gets
      formal English back has been answered by something not paying attention
- [ ] The length rule stays: *"how many cuts do I have"* is a sentence, and five
      bullets is worse

---

## 8. Feature 6 — Walk-leg geometry

[13-COMMUTE-ROUTING-PLAN.md](13-COMMUTE-ROUTING-PLAN.md) §9 Phase 1. Independent
of everything else in this list.

**No hosting is required.** `13` §3.2 settled it: geometry is computed once and
stored, never fetched at request time — because `commute_legs` is in the offline
set, because the comparison screen loads a dozen legs at once, and because a
leg's path does not change between requests. So this is a one-off script against
the FOSSGIS public Valhalla server at `https://valhalla.openstreetmap.de/`, with
an `X-Client-Id` header. Self-hosting is a shipping concern, not a build one.

**`route-map.tsx` is not touched.** It already draws `geometry` when present.

- [ ] `037_geometry_source.sql` — a `geometry_source` column on `commute_legs`
      (`routed` / `osm_relation` / null) with a comment saying what each means
- [ ] `scripts/route-walk-legs.mjs` — every `walk` leg with null geometry, ask
      Valhalla, decode the polyline with `@mapbox/polyline`, simplify with
      `@turf/simplify`, sanity-check with `@turf/length` against the leg's stated
      duration, write back with `geometry_source = 'routed'`
- [ ] A leg whose routed path is implausibly long is **left null**, not stored —
      a wrong path is worse than a dashed line, which is the rule the whole
      document turns on
- [ ] Run it; spot-check three legs against the map

Transit corridors (Phase 2), the rest of the corridors (Phase 3) and fares
(Phase 4) stay out of this list. They are mostly data gathering and per-leg
verification with real riders, not code.

---

## 9. Feature 7 — Commute answers

[14-ASSISTANT-PLAN.md](14-ASSISTANT-PLAN.md) §6. **Needs feature 4 first** — the
follow-up case is the memory case.

- [ ] `depart_at` on `commute_intent`, fed into the departure planner, which
      already applies `peak_bands`. A 9pm answer that ignores them is wrong by
      twenty minutes on the corridors where it matters most
- [ ] Two options where fastest and cheapest differ — the comparison the commute
      screen exists to make
- [ ] `verified_count` and `last_verified_at` stated in the answer. A route
      nobody has confirmed in three months should say so in words, not only on
      the screen
- [ ] A follow-up that changes only the origin — *"what about from Cubao?"*
- [ ] Fares and minutes still come from `v_route_summary` and the fare rules. The
      model extracts intent and nothing else, and `labelled: false` on this route
      stays correct

---

## 10. Feature 8 — Assistant tool use

[14-ASSISTANT-PLAN.md](14-ASSISTANT-PLAN.md) §8 Phase 5. **Needs 4 and 5.** The
one this list is pointed at.

This is what §2's knowledge-base decision resolves to. The assistant does not get
a corpus of TUP policy; it gets the ability to **reason over the student's own
records** — which are already structured, already authoritative, and already
reachable through the six computed templates in `lib/assistant/templates.ts`.

Today the router picks exactly one template and returns its output. Tool use
means it may call one, read the result, and decide to call another: *"can I still
skip Thursday?"* is `absences_remaining` **and** `next_class` **and** the term
end, composed.

- [ ] The router may call a template, read its result, and call another
- [ ] A hard cap on calls per question — an uncapped loop on a free tier is an
      outage
- [ ] **Receipts in the response**: which templates ran, and what they read.
      `10-FUTURE-ENHANCEMENTS.md` §5.1 makes receipts non-negotiable for anything
      that acts, and this is the first thing that composes
- [ ] Every number still comes from a template. The model chooses *which* to
      call; it never produces a figure (ADR-007)
- [ ] Only then revisit `10-FUTURE-ENHANCEMENTS.md` §2

---

## 11. What is deliberately not here

| Not in the eight | Why |
|---|---|
| Push notifications (`12` Ph. 5) | Deprioritised. Needs a real installed PWA on a real device to verify, per `12` §13 |
| Suspensions Ph. 2–3 (`15`) | Ph. 3 needs push; Ph. 2 needs an external poller and is worth little without Ph. 1 in use |
| Commute Ph. 2–4 (`13`) | Data gathering and rider verification, not code |
| Classroom term rollover (`12` Ph. 6) | Nothing breaks without it until a term actually ends |
| Knowledge-base seeding | §2. Needs authoritative sources; the schema refuses untraceable content |
| A second AI provider (`14` §3) | §2. Cancelled |
| Faculty evaluation submission | No open evaluation period in ERS to test against |
| Deployment, domain, region move | Owner decisions, held |
| The TUP Data API (`10` §4) | Strategically first for the *agentic* roadmap, and feature 8 is the gate in front of it |

---

## 12. Things that will bite

**A free model can vanish between two runs.** Three already had. §3.5 is the
answer; until it exists, a mysterious `AI_UNAVAILABLE` deserves a look at the
live model list before it deserves a look at the code.

**A JSON capability on a rung without structured outputs burns a retry.** It
looks like flakiness. It is the ladder doing exactly what it was built to do,
one rung too late.

**The review queue must not be stored.** §4.3. A stored order is wrong the
moment a card is reviewed, and the bug presents as *"it showed me the same card
twice"* days later.

**A review is two writes.** §4.3 again. This is the one place in study packs
where a half-done implementation looks completely fine until someone wants
history.

**`flashcards.due_on` is a `date`, not a `timestamptz`.** Comparisons must
happen in the student's local day, the way `attendance_records.session_date`
already does. A UTC comparison shifts the queue by a day for eight months of the
year.

**Assistant history must be inside the hashed input.** §6. Placed alongside it
instead, two students share an answer to the same follow-up asked after
different questions. This is a privacy bug wearing a caching bug's clothes.

**An implausible routed path must be discarded, not stored.** §8. The dashed
line is honest; a wrong line is not, and it is indistinguishable from a right one
on a map.

**`db.ts`'s offline exclusion comment is right about chunks and wrong about
cards.** Amend it, do not delete it — the reasoning it records is the reason
`study_chunks` stays out.
