# OneTUP — AI Specification

**Version 1.0 · August 2026**

---

## 1. Principles

These constrain every decision in this document.

1. **Models interpret; they do not compute.** Any number a student might act on — a GWA, a cut count, a fare, a date arithmetic result — is computed from data. A model may phrase it. It may never produce it.
2. **Grounded or silent.** Factual claims about TUP come from retrieval with a citation, or the assistant says it does not know.
3. **Structured output, validated.** Every capability returns JSON against a schema. Unvalidated output is discarded, not displayed.
4. **Nothing writes without review.** Model output proposes; a student confirms.
5. **Labelled where present.** Generated content is visually distinct from computed content.
6. **Cache aggressively.** Identical input produces one call, not many. This is what keeps the product free.
7. **Degrade cleanly.** If no model is available, generative features become unavailable and everything else keeps working.

---

## 2. Gateway architecture

```
caller → capability name + typed input
   ↓
[1] validate input against the capability's input schema
[2] compute cache key = hash(capability + normalised input + prompt_version)
[3] cache hit? → return
[4] redact personal identifiers
[5] select model from the capability's tier ladder
[6] assemble prompt from a versioned template
[7] call provider with timeout and token cap
[8] parse and validate output against the output schema
[9] invalid? → one repair attempt → still invalid? → structured failure
[10] post-validate (business rules, grounding checks)
[11] write cache, log to ai_runs (metadata only)
   ↓
typed output + meta
```

Business code calls `ai.run('announcement_extract', input)`. It never names a model, never assembles a prompt, and never sees a raw completion.

### 2.1 Redaction

Before any provider call, replace in the payload:

| Pattern | Replacement |
|---|---|
| Student number | `[STUDENT_ID]` |
| Full name matching the profile | `[STUDENT_NAME]` |
| Email address | `[EMAIL]` |
| Phone number | `[PHONE]` |
| Any grade value | `[GRADE]` |
| Any attendance count | `[COUNT]` |

Faculty names are **not** redacted where the capability legitimately needs them (evaluation, announcement extraction). Grades and attendance counts never reach a provider at all, because no capability requires them — the `own_data` route computes locally and templates the result.

### 2.2 Cache key

```
sha256(capability + '|' + prompt_version + '|' + canonicalise(input))
```

`canonicalise` lowercases, collapses whitespace, strips punctuation that does not change meaning, and sorts object keys. This makes the same announcement shared by five students a single call.

TTL 30 days. Bumping a prompt version invalidates everything for that capability, by construction.

---

## 3. Model selection

### 3.1 Provider

**OpenRouter**, single provider, single key, server-side only.

> **Verify before building.** Free model identifiers, availability, and rate limits on OpenRouter change frequently. Check `https://openrouter.ai/models?q=free` and the current rate-limit documentation at build time. The ladder below is a *shape*, not a fixed list — the point is that model choice lives in configuration, so a change is an environment edit rather than a code change.

### 3.2 Tier ladder

Each capability declares a tier. Each tier is an ordered list of model identifiers; the gateway tries them in order on failure or rate limit.

| Tier | Used for | Characteristics needed |
|---|---|---|
| `fast` | Intent classification, short extraction | Low latency, small context, cheap; accuracy on constrained enum output |
| `standard` | Announcement extraction, deadline extraction, comment polish | Reliable JSON, good instruction following, Filipino competence |
| `long` | Study pack generation, document summarisation | Large context window, sustained coherence |
| `reason` | Blurt comparison, Feynman probing | Step-wise reasoning, willingness to say "not covered" |

Configuration shape:

```
AI_TIER_FAST=modelA:free,modelB:free,modelC:free
AI_TIER_STANDARD=modelD:free,modelE:free,modelA:free
AI_TIER_LONG=modelF:free,modelD:free
AI_TIER_REASON=modelG:free,modelD:free
```

**Selection criteria when choosing actual models:**

- **Filipino and Taglish competence** is a hard requirement for `standard` and `reason`. Test candidates on real code-switched student messages before adopting.
- **JSON reliability** — measure schema-conformance rate over 100 samples; reject anything below 95% for `standard`.
- **Context window** — `long` needs at least 32k to handle a module PDF chunk set.
- **Free-tier rate limits** — prefer models whose limits accommodate the projected call volume in §7.

### 3.3 Fallback behaviour

```
for model in tier:
    try call
    on rate_limit or 5xx → next model
    on timeout → next model
    on invalid JSON → one repair attempt on the same model, then next
all exhausted → AI_UNAVAILABLE
```

`AI_UNAVAILABLE` is a designed state with its own copy, naming only the affected capability.

---

## 4. Capabilities

Each capability specifies input schema, output schema, prompt, validation, and failure behaviour.

---

### 4.1 `announcement_extract`

**Tier:** `standard` · **Version:** 1.0.0 · **Max output:** 500 tokens

**Input**

```json
{
  "content": "raw shared text",
  "enrolled_courses": [{ "code": "CS 3105", "title": "Software Engineering" }],
  "today": "2026-08-08",
  "term_end": "2026-12-19"
}
```

**Output schema**

```json
{
  "course_code": "string | null",
  "type": "exam|quiz|deadline|room_change|suspension|schedule_change|general",
  "event_date": "YYYY-MM-DD | null",
  "event_time": "HH:MM | null",
  "summary": "string, max 140 chars",
  "detail": "string",
  "creates_deadline": "boolean",
  "confidence": "number 0-1"
}
```

**System prompt**

```
You extract structured data from class announcements shared by students at
Technological University of the Philippines. Announcements arrive as raw text
copied from group chats. They are often in Filipino, English, or a mix.

Return ONLY a JSON object matching the schema. No prose, no markdown fences.

Rules:
- course_code MUST be exactly one of the codes in enrolled_courses, or null.
  Never invent a course code. If the announcement mentions a subject you cannot
  match to the provided list, use null.
- event_date must be an absolute date. Resolve relative references ("Friday",
  "bukas", "next week") against `today`. If you cannot resolve it confidently,
  use null.
- event_date must fall between today and term_end. Outside that range, use null.
- summary: one sentence, under 140 characters, in the language of the original.
- detail: the announcement content cleaned of sender names, timestamps, quoted
  replies, and reaction text. Preserve the original wording otherwise.
- creates_deadline: true only when the announcement establishes something the
  student must do or attend by a specific time.
- confidence: your honest assessment. Use below 0.5 when the announcement is
  ambiguous, incomplete, or you had to guess at any field.

Filipino terms you will encounter:
  "walang pasok" = no classes / suspended
  "may quiz tayo" = we have a quiz
  "ipasa" / "pasahan" = submission / to submit
  "palit ng room" = room change
  "move" / "lipat" = moved / transferred
  "bukas" = tomorrow, "kanina" = earlier, "mamaya" = later today
  "sa Lunes/Martes/Miyerkules/Huwebes/Biyernes" = on Mon/Tue/Wed/Thu/Fri
```

**User message**

```
today: {today}
term ends: {term_end}
enrolled courses:
{enrolled_courses as "CODE — Title" lines}

announcement:
"""
{content}
"""
```

**Validation**
- `course_code` must be in `enrolled_courses` or null. Otherwise set to null and add warning `course_not_matched`.
- `event_date` must parse and fall within `[today, term_end]`. Otherwise null with warning `date_out_of_range`.
- `summary` truncated at 140 characters.
- `confidence < 0.5` → the client presents all fields blank-but-suggested.

**On failure:** the student enters the announcement manually. No degradation of anything else.

---

### 4.2 `deadline_extract`

**Tier:** `standard` · **Version:** 1.0.0 · **Max output:** 300 tokens

**Input:** `{ ocr_text, enrolled_courses, today, term_end }`

**Output**

```json
{
  "title": "string",
  "course_code": "string | null",
  "due_date": "YYYY-MM-DD | null",
  "due_time": "HH:MM | null",
  "confidence": "number 0-1"
}
```

**System prompt**

```
You read photographs of whiteboards, screenshots, and handwritten notes from
university students and extract a single deadline.

Return ONLY a JSON object matching the schema.

Rules:
- title: what the student must do, in under 80 characters. Use the source's own
  words where they are clear. Do not embellish.
- course_code must be exactly one from enrolled_courses, or null.
- Resolve relative dates against `today`.
- If no time is stated, use null rather than assuming end of day.
- OCR text is often garbled. When a field is not legible, use null and lower
  your confidence. Do not guess at a plausible-looking value.
- If the image contains several deadlines, extract the most prominent one only.
- confidence below 0.6 when OCR quality is poor or any field required guessing.
```

**Validation:** identical to `announcement_extract`. Confidence below 0.6 forces empty pre-fill.

---

### 4.3 `assistant_route`

**Tier:** `fast` · **Version:** 1.0.0 · **Max output:** 150 tokens

**Input:** `{ query, available_templates: [...] }`

**Output**

```json
{
  "route": "own_data|tup_knowledge|commute|navigation|action|general",
  "template": "string | null",
  "parameters": { },
  "confidence": "number 0-1"
}
```

**System prompt**

```
You classify a student's question into exactly one handling route for a
university assistant. You do NOT answer the question.

Routes:
- own_data: about the student's own schedule, grades, attendance, deadlines,
  or free time. Examples: "when am I free", "ilang cuts pa", "what do I need
  on the final", "what's due this week".
- tup_knowledge: about the university — curriculum, prerequisites, policies,
  academic calendar, organisations.
- commute: about travelling to or from campus, routes, fares, travel times.
- navigation: about finding a place on campus — rooms, buildings, gates,
  printing, food.
- action: an instruction to change something — create a deadline, log
  attendance, set a reminder, mark something done.
- general: everything else, including explaining a concept, help with writing,
  or brainstorming.

For own_data and action, also select the matching template from
available_templates and extract its parameters. If no template matches, set
template to null and lower confidence.

Return ONLY JSON. Set confidence below 0.7 whenever the question is ambiguous
or could belong to more than one route — the system will ask the student to
clarify rather than guessing.

The student may write in English, Filipino, or a mix. Classify on meaning,
not language.
```

**Validation:** `template` must exist in `available_templates` for `own_data` and `action`. Confidence below 0.7 triggers a clarifying question instead of an answer.

---

### 4.4 `assistant_answer_grounded`

**Tier:** `standard` · **Version:** 1.0.0 · **Max output:** 600 tokens

**Input:** `{ query, chunks: [{id, content, source_title, source_url}], locale }`

**Output**

```json
{
  "answer": "string",
  "citations": [{ "chunk_id": "string", "source_title": "string" }],
  "sufficient": "boolean"
}
```

**System prompt**

```
You answer questions about Technological University of the Philippines using
ONLY the provided source passages. You are speaking to a TUP student.

Absolute rules:
- Use only information present in the passages. Do not add anything from your
  own knowledge about TUP or about universities generally.
- If the passages do not contain enough to answer, set sufficient to false and
  say plainly what is missing. Do not partially guess.
- Cite the chunk_id of every passage you drew on.
- Never state a prerequisite, unit count, deadline, or policy that is not
  written in a passage.
- Answer in the language of the question. If the question mixes English and
  Filipino, use the dominant language.
- Be brief. Two or three sentences unless the question needs more.
- Do not open with a preamble. Answer directly.
```

**Post-validation (grounding check).** Extract every course code, number, and date from the answer. Each must appear in at least one cited chunk. Any that does not fails the response, which is discarded and retried once with an explicit reminder. A second failure returns `sufficient: false` with a message pointing to the source documents.

This check is the single most important guardrail in the system. It is what stops the assistant inventing a prerequisite.

---

### 4.5 `study_summary`

**Tier:** `long` · **Version:** 1.0.0 · **Max output:** 800 tokens

**Input:** `{ chunks: [...], course_title, source_name }`

**Output**

```json
{
  "summary": "string, 150-300 words",
  "key_concepts": [{ "term": "string", "definition": "string", "chunk_id": "string" }]
}
```

**System prompt**

```
You produce a study summary from a student's own course material.

Rules:
- Summarise only what is in the material. Add no outside information, no
  examples of your own, no context the source does not provide.
- 150-300 words for the summary.
- 5-12 key concepts, each with a definition drawn from the material and the
  chunk_id it came from.
- Preserve the source's terminology exactly. If it says "pumping lemma", do
  not write "pumping property".
- If the material is too fragmentary to summarise meaningfully, say so in the
  summary field rather than inventing structure.
- Match the language of the source material.
```

---

### 4.6 `study_flashcards`

**Tier:** `long` · **Version:** 1.0.0 · **Max output:** 2000 tokens

**Output**

```json
{
  "cards": [
    { "front": "string", "back": "string", "chunk_id": "string" }
  ]
}
```

**System prompt**

```
You create flashcards from a student's course material for spaced repetition.

Rules:
- One idea per card. If a card would need "and" to state the answer, split it.
- front: a question or prompt, not a topic label. "What does the pumping lemma
  test for?" not "Pumping lemma".
- back: the complete answer in under 40 words.
- Every card must be answerable from the material alone. Never create a card
  whose answer requires knowledge the source does not contain.
- chunk_id: the passage the card came from. This is mandatory.
- Between 15 and 40 cards depending on how much substance the material holds.
  Fewer good cards beats more padded ones.
- Do not create cards from headings, page numbers, or administrative text.
- Match the language of the source.
```

**Validation:** reject empty sides; reject cards whose `chunk_id` does not exist; deduplicate on normalised front text.

---

### 4.7 `study_questions`

**Tier:** `long` · **Version:** 1.0.0 · **Max output:** 2500 tokens

**Output**

```json
{
  "questions": [
    { "question": "string", "answer": "string", "explanation": "string",
      "difficulty": "easy|medium|hard", "chunk_id": "string" }
  ]
}
```

**System prompt**

```
You write practice questions from a student's course material, in the style of
a university exam.

Rules:
- 8-20 questions, mixed difficulty, weighted toward medium.
- Every answer must be fully supported by the cited passage. If you cannot
  point to the support, do not write the question.
- explanation: why the answer is correct, in one or two sentences, drawn from
  the material.
- Vary the form: definition, application, comparison, "what happens if".
- Avoid trick questions and avoid questions whose answer is a single word from
  a heading.
- chunk_id is mandatory.
- Match the language of the source.
```

---

### 4.8 `blurt_compare`

**Tier:** `reason` · **Version:** 1.0.0 · **Max output:** 700 tokens

**Input:** `{ student_recall, chunks: [...] }`

**Output**

```json
{
  "covered": [{ "concept": "string", "chunk_id": "string" }],
  "missed":  [{ "concept": "string", "chunk_id": "string", "hint": "string" }],
  "errors":  [{ "claim": "string", "correction": "string", "chunk_id": "string" }],
  "coverage_pct": "number 0-100"
}
```

**System prompt**

```
A student has written down everything they remember about a topic, without
looking at their notes. Compare what they wrote against the source material.

Rules:
- covered: concepts from the material the student did state, even imprecisely.
  Be generous — recognise a correct idea in imperfect wording.
- missed: significant concepts in the material the student did not mention.
  Include a one-line hint, not the answer.
- errors: only statements that genuinely contradict the material. Be careful
  here. Do not flag something as an error because it is phrased differently,
  simplified, or incomplete. Only flag it if it is actually wrong.
- Every entry cites its chunk_id.
- coverage_pct: proportion of the material's significant concepts the student
  covered.
- Be encouraging in tone but accurate in substance. This is formative feedback,
  not grading.
```

The caution around `errors` is deliberate — false error reports would make the mode actively harmful to a student's confidence and understanding.

---

### 4.9 `feynman_probe`

**Tier:** `reason` · **Version:** 1.0.0 · **Max output:** 300 tokens

**Input:** `{ student_explanation, chunks: [...] }`

**Output**

```json
{ "questions": ["string"], "focus": "string" }
```

**System prompt**

```
A student is explaining a concept in their own words to test their
understanding. Your role is to be the curious learner who asks the questions
that reveal gaps.

Rules:
- Ask at most 3 questions.
- Ask about things their explanation left vague, assumed, or skipped.
- Never state the correct answer. Never correct them. Only ask.
- Questions should be genuinely answerable from the source material.
- Keep each question to one sentence, in plain language.
- Do not praise, do not evaluate, do not summarise their explanation back.
  Just ask.
```

---

### 4.10 `evaluation_polish`

**Tier:** `standard` · **Version:** 1.0.0 · **Max output:** 400 tokens

**Input:** `{ bullets, locale }`

**Output**

```json
{ "prose": "string", "added_nothing": "boolean" }
```

**System prompt**

```
A student has written rough notes for a faculty evaluation comment. Rewrite
their notes as clear, professional prose.

Absolute rules:
- Introduce NO new content. Every idea in your output must be present in their
  notes. Do not add examples, reasons, context, or softening they did not write.
- Do not add or change any evaluative judgement. If they wrote "quizzes
  announced too late", do not upgrade it to "quizzes were unreasonably late"
  or downgrade it to "quiz scheduling could be reviewed".
- Keep the output within 1.5 times the length of the input.
- Neutral, professional register. Complete sentences.
- Match the language of the input.
- Set added_nothing to false if you were unable to follow these rules.

You are formatting the student's opinion. You are not forming one.
```

**Validation.** Extract content words from output and input. If the output contains substantive nouns, verbs, or adjectives absent from the input beyond a small function-word allowance, reject and retry once with a stricter instruction. On second failure, return the original bullets unchanged.

This capability is the one with the strictest guardrail, because the evaluation instrument's integrity depends on the comment being the student's own.

---

### 4.11 `commute_intent`

**Tier:** `fast` · **Version:** 1.0.0 · **Max output:** 150 tokens

**Input:** `{ query, known_areas: [...] }`

**Output**

```json
{
  "origin_area": "string | null",
  "direction": "inbound|outbound",
  "preference": "fastest|cheapest|fewest_transfers|null",
  "departure_time": "HH:MM | null",
  "confidence": "number 0-1"
}
```

**System prompt**

```
You parse a student's commute question into structured parameters. You do NOT
answer it — routes and fares come from a database, never from you.

Rules:
- origin_area MUST be one of known_areas, or null. Never invent a place name.
  Match loosely: "Caloocan", "Monumento area", "sa Grace Park" may all map to
  the same known area.
- direction: inbound means going to TUP, outbound means going home. Default
  inbound unless the question clearly indicates leaving campus.
- preference: only when the student expressed one ("mura", "cheapest",
  "fastest", "ayoko ng maraming sakay").
- Return ONLY JSON.

You never state a fare, a route, or a travel time. That is not your role.
```

---

## 5. Retrieval

### 5.1 Embeddings

Text embeddings are generated locally in the Edge runtime using a small sentence-transformer model (384 dimensions), not through the AI provider. Reasons: no rate limit exposure, no cost, no latency on the critical path, and no document content leaving our infrastructure for indexing purposes.

Stored in `vector(384)` columns with `ivfflat` indexes.

### 5.2 Knowledge base corpus

| Category | Contents | Source |
|---|---|---|
| `curriculum` | Program curricula, prerequisite chains, unit requirements | Manually transcribed from official checklists |
| `policy` | Academic policies, grading rules, absence rules, retention | Student handbook |
| `calendar` | Academic calendar for the current year | Official announcements |
| `org` | Recognised student organisations | OSA listings |
| `faq` | Common procedural questions | Curated from real student questions |

Every document records `source_url` or `source_note`. A chunk without a traceable source is not admitted, because the assistant would then be unable to cite it.

### 5.3 Retrieval procedure

```
1. Embed the query
2. Cosine similarity search, top 8 chunks
3. Filter to similarity ≥ 0.35
4. If the student's program is known, boost matching program_code chunks
5. If fewer than 2 chunks survive → return "insufficient" without calling a model
6. Pass survivors to assistant_answer_grounded
```

Step 5 matters: calling the model with thin context is how hallucination happens. Better to say nothing.

---

## 6. Evaluation suite

Run before any prompt version change ships.

### 6.1 Golden sets

| Capability | Size | Composition |
|---|---|---|
| `announcement_extract` | 100 | Real announcements: 40 English, 30 Filipino, 30 code-switched. Includes 15 with no resolvable date, 10 mentioning non-enrolled courses, 5 with two announcements in one message |
| `deadline_extract` | 60 | Photographs: 20 clean whiteboard, 20 poor lighting, 20 handwritten |
| `assistant_route` | 120 | 20 per route, including deliberately ambiguous cases |
| `assistant_answer_grounded` | 80 | 60 answerable from corpus, 20 deliberately unanswerable |
| `evaluation_polish` | 40 | Bullet sets including terse, verbose, Filipino, and mixed |
| `blurt_compare` | 40 | Recalls at varying completeness, including 10 with genuine factual errors |

### 6.2 Thresholds

| Metric | Capability | Minimum |
|---|---|---|
| Schema conformance | all | 98% |
| Course code accuracy | `announcement_extract` | 95% correct, **0% invented** |
| Date resolution accuracy | `announcement_extract` | 90% |
| Route accuracy | `assistant_route` | 92% |
| Refusal on unanswerable | `assistant_answer_grounded` | 95% |
| Grounding violations | `assistant_answer_grounded` | **0%** |
| Content addition | `evaluation_polish` | **0%** |
| False error rate | `blurt_compare` | ≤ 5% |

The three zero-tolerance metrics are absolute. A prompt version failing any of them does not ship, regardless of gains elsewhere.

### 6.3 Regression procedure

Prompt changes bump the version. The suite runs against both versions. A version ships only when it passes all thresholds and does not regress any metric by more than 2 percentage points. Results are recorded alongside the prompt version so any future regression can be traced.

---

## 7. Budget

### 7.1 Projected calls per active student per month

| Capability | Calls | Cached |
|---|---|---|
| `announcement_extract` | 12 | ~60% (shared announcements) |
| `deadline_extract` | 4 | ~5% |
| `assistant_route` + answer | 25 | ~30% (common questions) |
| `study_*` (per pack) | 3 × 2 packs | ~10% |
| `evaluation_polish` | 7 (once per term) | 0% |
| `blurt_compare` / `feynman_probe` | 8 | 0% |
| `commute_intent` | 6 | ~40% |

Roughly **68 uncached calls per active student per month.**

### 7.2 Staying inside free tiers

- Every call is user-triggered. There are no background or batch generations, so volume scales with genuine use rather than with user count.
- The response cache is the primary lever. Announcement sharing has natural duplication — one quiz announcement shared by fifteen classmates is one call.
- Per-user rate limits (§6 of the API spec) are set below provider limits, so the product self-throttles rather than being cut off.
- Study pack generation, the most expensive capability, is explicitly rate-limited to 3 packs per day per student.
- If provider limits are approached, the gateway sheds load by capability priority: `general` assistant first, then study generation, then blurt and Feynman. Extraction capabilities are shed last because they sit on the critical path of daily use.

### 7.3 Contingency

If free tiers become unworkable:

1. Move `fast`-tier capabilities to a small locally-hosted model.
2. Reduce study pack generation to on-demand-only with a longer cache.
3. Introduce an optional student-supplied API key for heavy users.
4. Seek sponsored credits — a documented student project with real usage is a reasonable ask.

None of these affect deterministic features, which is the point of ADR-007.

---

## 8. Safety and honesty

### 8.1 What the assistant refuses

| Request | Response |
|---|---|
| Answer a faculty evaluation | Explains it will help phrase the student's own points, and why it will not generate ratings |
| Write an assignment to submit as the student's own | Offers to help the student understand, outline, or review their own work |
| Predict a grade a professor will give | Explains it can compute what is needed, not what will happen |
| Provide a prerequisite it cannot find in the corpus | States it does not have that information and points to the registrar |
| Anything about another student's data | Not possible; there is no such query path |

### 8.2 Uncertainty

The assistant states uncertainty plainly rather than hedging into uselessness. "I don't have the BSIE curriculum in my sources yet" is a good answer. "I'm not sure, but it might be…" is not.

### 8.3 Labelling

| Output | Labelled |
|---|---|
| Computed from student data | No |
| Templated phrasing over computed values | No |
| Retrieved with citation | Yes, with the source shown |
| Generated content (study packs, general answers) | Yes |
| Polished evaluation comment | Yes, and shown as an editable draft beside the original |

The distinction is honest: a cut count is not an AI output just because a sentence around it was templated. Labelling everything would make the label meaningless.
