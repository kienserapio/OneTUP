# OneTUP — The next eight

**Status:** **all eight built**, September 2026. This document is now the
record of what was planned *and* of where the build departed from it — the
departures are marked **Built differently** and each says why.
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

| # | Feature | Source | State |
|---|---|---|---|
| 1 | Model ladder repair | this doc §3 | **Built.** Plus `scripts/check-models.mjs` in CI |
| 2 | Study packs | this doc §4 | **Built**, phases 1–3. Phase 4 (generation) deferred — see below |
| 3 | Suspension advisories, Phase 1 | `15` §7 | **Built.** Migration `036` |
| 4 | Assistant memory | `14` §4 | **Built** |
| 5 | Answers with shape | `14` §5 | **Built** |
| 6 | Walk-leg geometry | `13` §9 Ph. 1 | **Built.** Migration `037`, `scripts/route-walk-legs.mjs` |
| 7 | Commute answers | `14` §6 | **Built.** Two `commute_intent` bugs fixed on the way |
| 8 | Assistant tool use | `14` §8 Ph. 5 | **Built**, gated on a router flag so the common question still costs one call |

**Study packs Phase 4 is the one thing on this list not built.** It is the only
phase that needs a Storage bucket and a model call, and both need a live
database to create and verify against. Phases 1–3 — the review loop, offline,
and deadline compression — are complete and are what makes the feature usable.

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

- [x] Replace the five ladders in `.env.example`
- [x] Mirror them into the local `.env`
- [x] One live call per tier, confirming the first rung answers
- [x] A note in `06-AI-SPEC.md` recording the verification date and how to re-check

**Built differently — one correction to §3.2 above.** That table calls the
column "structured outputs". The provider asks for JSON with
`response_format: { type: 'json_object' }`, so the capability that actually
matters is `response_format`. Only three free models advertise
`structured_outputs` — the stricter `json_schema` mode nothing here uses — and
reading that field instead makes a perfectly healthy ladder look broken. The
seven models listed are correct; the label was not.

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

**Phase 1 — the review loop** — built

- [x] `lib/queries/study.ts`
- [x] `study-view.tsx`, `pack-create.tsx`, `pack-detail.tsx`, `card-editor.tsx`
- [x] `review-session.tsx` with the four quality buttons and their intervals
- [x] Nav entry, and `IconCards` for Study — `IconStudy` stays with Faculty eval
- [x] Tests: the SM-2 ladder, a `quality < 3` reset, and a card reviewed today
      not reappearing in today's queue

**Built differently — there are no API routes.** §4.5 planned five. Packs,
cards and reviews turned out to be ordinary rows a student owns, with no dedupe
to run, no meter to enforce and no privilege to check — which is exactly what
`deadlines` is, and `deadlines` is written entirely through the offline
mutation queue with no route at all. Following that idiom instead has the
property this feature actually needs: **a card can be added, edited and reviewed
on a train.** A route would have made the review loop the one part of the
product that requires signal.

The consequence is that scheduling happens on the device, so `scheduleReview` in
`packages/core/src/study/sm2.ts` is now the single answer to "when does this card
come back" — SM-2 step and deadline compression in one function, called by both
the write path and the button preview. The number a student reads before
pressing is the number they get.

**Phase 2 — offline** — built

- [x] `study_packs` and `flashcards` into `EntityName` and the sync set
- [x] `flashcard_reviews` as a queued append-only insert, with a client-generated
      id so a replayed write cannot record the same review twice
- [x] The exclusion comment in `db.ts` amended to name chunks rather than packs
- [ ] Airplane-mode verification — needs a live database

**Phase 3 — deadline compression** — built

- [x] `compressForDeadline` inside `scheduleReview`, sourcing `daysUntilDeadline`
      from the pack's enrollment through the local store
- [x] The pack list and the pack detail both say *every card before Friday* when
      it is compressing

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

**Build** — built

- [x] `036_suspensions.sql` — column, table, RLS, grants, and `recorded_via`
      widened to allow `suspension`
- [x] `database.types.ts` extended by hand, because `pnpm db:types` needs a
      database that currently does not exist
- [x] `advisoryForToday` in core — one notice, narrowest scope first
- [x] `suspension-card.tsx`, wired into `today-view.tsx`
- [ ] Seeding one by hand and confirming the three writes — needs a database

**Built differently — the advisory is offline.** `15` did not say either way.
It is in the offline set for the obvious reason: the day a suspension is
announced is a typhoon day, and a typhoon day is when the signal is worst.

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

**Build** — built

- [x] `history` on the request schema — `max(6)`, oldest first, 2000 chars each
- [x] Passed to `assistant_route`, `assistant_general` and `commute_intent`
- [x] Inside the hashed input, not alongside it
- [x] `ask-view.tsx` sends the last three pairs, error turns excluded
- [x] Both evaluation cases pass against a live model. The decisive one:
      *"what about MATH 2103?"* routes to `absences_remaining` at 0.95 with
      history and scores 0.65 — below its floor — without it. That gap is the
      feature.

---

## 7. Feature 5 — Answers with shape

[14-ASSISTANT-PLAN.md](14-ASSISTANT-PLAN.md) §5. Narrower than it sounds, and
none of it is a model change.

The contradiction to fix: `assistant_general` tells the model to *"use a short
list only when the answer really is a list of steps"* and then forbids markdown.
The model cannot comply with both.

- [x] Permit `-` at the start of a line and nothing else; `splitIntoBlocks`
      renders it, every other construct stays literal text
- [x] `temperature` 0.6 for `assistant_general` alone — extraction stays at 0.2
- [x] Clarify gate 0.5 for `general` and `tup_knowledge`, 0.6 for `commute` and
      `navigation`, **unchanged at 0.7 for `own_data` and `action`**
- [x] Taglish verified live: a Taglish question gets a Taglish answer
- [x] The length rule holds — a direct question got one sentence

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

- [x] `037_geometry_source.sql` — `routed` / `osm_relation` / `manual`
- [x] `scripts/route-walk-legs.mjs`, with `--probe`, `--dry-run` and `--redo`
- [x] An implausible path is left null, and the judgement is unit-tested
- [ ] Running it against real legs — needs a database

**Built differently — the detour limit is 6, not 3.** `--probe` routed its
first pair, Ayala Bridge to TUP Manila: 579 m apart in a straight line, 2.21 km
on foot, a ratio of 3.8, because the Pasig River is between them and the only
crossing is a bridge. That is a *correct* path, and an obvious limit of 2 or 3
would discard correct geometry across most of Manila — rivers, walled campuses,
esteros with one crossing a kilometre away. So the duration check does the real
work, because it compares against a figure a person timed on foot, and the
detour ratio is loosened to where it catches a hub coordinate dropped in the
wrong city and nothing else.

Also worth recording: Valhalla returns **polyline6**, not the polyline5 most
decoders assume, and the host that answers a POST is `valhalla1.openstreetmap.de`
— the unnumbered one returns 405.

Transit corridors (Phase 2), the rest of the corridors (Phase 3) and fares
(Phase 4) stay out of this list. They are mostly data gathering and per-leg
verification with real riders, not code.

---

## 9. Feature 7 — Commute answers

[14-ASSISTANT-PLAN.md](14-ASSISTANT-PLAN.md) §6. **Needs feature 4 first** — the
follow-up case is the memory case.

- [x] `departure_time` on `commute_intent`, fed through `peakPenaltyAt` — a new
      core function that computes the penalty for a journey *starting* at a
      moment, rather than working backwards from a class the way the departure
      planner does
- [x] Two options where fastest and cheapest differ, and silence when they do not
- [x] `verified_count` and `last_verified_at` stated in words
- [x] *"What about from Cubao?"* verified live — it keeps the 21:00 from the
      previous turn and changes only the origin
- [x] `labelled: false` stays correct

**Two bugs found while building it.** `commute_intent` required a `confidence`
its own prompt never asked for, so every real call failed validation and burned
the gateway's one repair attempt. And *"pauwi ako sa Antipolo"* returned a null
area, because the field is called `origin_area` and the model reasoned that the
origin of a journey home is TUP — leaving the student with "I don't have routes
from there yet" about an area that is in the list.

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

- [x] `assistant_compose` reads a template's result and may request another
- [x] A hard cap: three lookups, two composition calls
- [x] Receipts in the response, opened in the Ask screen when more than one
      lookup contributed
- [x] `unsupportedNumbers` checks the composed answer against what it was
      composed from. An answer carrying a figure nothing computed is
      **discarded, not repaired** — the student gets the computed sentences
      joined instead
- [ ] `10-FUTURE-ENHANCEMENTS.md` §2 — still to revisit

**Built differently — composition is gated on a router flag.** Composing every
`own_data` question would double or triple its cost against a fifty-a-day free
quota, which §12 already names as the most common reason a working assistant
looks broken. So `assistant_route` returns `needs_composition` — it is looking
at the question anyway and costs nothing extra — and only a question that needs
two lookups pays for one. Verified live: *"ilang cuts pa ako sa CS 2103?"*
false, *"what's my GWA?"* false, *"can I still skip Thursday?"* true.

The grounding check is deliberately one-directional and says so in its own
tests: it proves no figure was conjured, not that figures were rearranged
correctly. The second is a far harder problem; the first is the failure that
matters.

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
