# OneTUP — Technical Design: App / Dashboard Module

**Version 1.0 · August 2026**

This document specifies behaviour, logic, state, and algorithms for the authenticated application. It deliberately does not specify layout, components, or styling — those belong to the design system, produced separately.

---

## 1. Module inventory

| ID | Module | Version | Depends on |
|---|---|---|---|
| M1 | Schedule | V1 | — |
| M2 | Attendance | V1 | M1 |
| M3 | Grades & GWA | V1 | M1 |
| M4 | Deadlines | V1 | M1 |
| M5 | Announcements | V1 | M1, M4 |
| M6 | Commute & departure | V1 | M1 |
| M7 | Campus | V1.5 | — |
| M8 | Faculty evaluation | V1.5 | M1 |
| M9 | Study | V2 | M1, M4 |
| M10 | Assistant | V2 | all |

M1 is the keystone. Every module except M7 reads from it.

---

## 2. Application state

### 2.1 State categories

| Category | Store | Persistence | Example |
|---|---|---|---|
| **Server state** | React Query over Supabase | IndexedDB mirror | Schedule blocks, grades |
| **Local-first entities** | IndexedDB, primary read source | Durable | Everything in the offline set |
| **Write queue** | IndexedDB | Durable until flushed | Offline attendance taps |
| **Session state** | Memory | None | Current view, filters |
| **Preferences** | IndexedDB + server | Durable, synced | Prep time, buffers, thresholds |

### 2.2 The offline set

These entities must be fully readable with no network:

`schedule_blocks` (current term) · `courses` and `enrollments` · `deadlines` (unfinished plus 30 days past) · `attendance_records` (current term) · `commute_routes` and `legs` (student's origin) · `campus_places` · emergency contacts · `departure_plans` (next 7 days) · current-term `grades`

Not in the offline set: announcements older than 14 days, study pack contents, assistant history, faculty evaluation questions.

### 2.3 Sync model

**Read path:** IndexedDB first, always. Render immediately. Revalidate against the server in the background. If revalidation returns changed data, update the store and re-render.

**Write path:**
1. Optimistically apply to IndexedDB and re-render.
2. Enqueue a mutation record `{id, entity, operation, payload, client_ts, attempts}`.
3. Attempt flush. On success, mark applied. On failure, retry with exponential backoff (2s base, ×2, cap 5 min, max 10 attempts).
4. After max attempts, surface a recoverable error and keep the local value.

**Conflict resolution:** last-write-wins per field, comparing server `updated_at` to the mutation's `client_ts`. If the server value is newer *and* differs, keep the server value and record a conflict entry. Conflicts are surfaced only for grades and deadlines, where a silent overwrite would be harmful; elsewhere they resolve silently.

**Sync triggers:** app foreground, network reconnect, pull-to-refresh, post-mutation, and a 15-minute background interval while foregrounded.

---

## 3. M1 — Schedule

### 3.1 Responsibilities

Own the canonical representation of when and where a student has commitments. Provide read APIs to every other module: *what is happening now*, *what is next*, *what is on day D*, *where are the free blocks*.

### 3.2 Import pipeline

```
collect → fetch → parse → normalise → validate → review → commit → cache
```

**Collect.** Student number, ERS password, birthdate. Birthdate is required because the ERS login form has three fields. Format must match the portal's expected format; the client normalises before sending.

**Fetch.** Delegated to the Sync Worker. See [07-AUTH-ERS.md](07-AUTH-ERS.md).

**Parse.** The worker returns raw rows. Each row from the ERS schedule table yields:

| Field | Source | Notes |
|---|---|---|
| `code` | column 1 | Course code, e.g. `CS 3105` |
| `title` | column 2 | Descriptive title |
| `lec_units` | column 3 | Numeric string |
| `lab_units` | column 4 | Numeric string |
| `units` | column 5 | Total |
| `faculty` | column 6 | May be blank or `TBA` |
| `schedule_raw` | column 7 | Compound string requiring sub-parsing |

**Sub-parsing `schedule_raw`.** The field contains a day code, a time range, and optionally a room, sometimes prefixed by other content separated by ` - `. Algorithm:

1. Take the segment after the final ` - `.
2. Match `^(\w+)\s+([\d:APM]+-[\d:APM]+)\s*(.*)$`.
3. Map the day code: `M`→Monday, `T`→Tuesday, `W`→Wednesday, `TH`→Thursday, `F`→Friday, `S`→Saturday, `SUN`→Sunday. **Order matters** — test `TH` before `T`, and `SUN` before `S`.
4. Split the time range on `-`, parse each side to 24-hour time.
5. Remainder is the room; empty means `TBA`.
6. If the match fails, emit the row with `parse_status = 'failed'` and the raw string preserved.

**Multi-day courses.** A course meeting on multiple days may appear as one row with a compound day code or as multiple rows. Normalisation expands either into one `schedule_block` per day-time pair, all referencing one `enrollment`.

**Validate.** Reject or flag:
- End time not after start time
- Overlapping blocks on the same day (flag, do not reject — legitimate in some enrollments)
- Total units outside 1–40 (flag)
- Any row with `parse_status = 'failed'`

**Review.** The student sees every parsed row with every field editable, and a count of anything flagged. Nothing is committed until the student confirms. This step is mandatory — never auto-commit an import.

**Commit.** Transactional. Upsert `courses` (global catalog, keyed by code and term), then `enrollments`, then `schedule_blocks`. Set `source = 'ers_import'` and stamp `imported_at`.

**Cache.** Write the full current-term set to IndexedDB.

### 3.3 Re-sync and diff

Re-sync runs the same pipeline, then compares against the committed set:

| Change | Presentation |
|---|---|
| New course | "Added: CS 3108" |
| Dropped course | "Removed: PE 4" — requires explicit confirmation, since it cascades to attendance and grades |
| Room change | "CS 3105 moved from Rm 312 to Rm 305" |
| Time change | "MATH 2103 now starts at 8:00" |
| Faculty change | "CS 3107 now taught by Prof. Santos" |

The student accepts or rejects each change individually. Rejected changes are remembered so the next diff does not re-propose them, unless the underlying ERS value changes again.

Manual blocks (`source = 'manual'`) are never touched by re-sync.

### 3.4 Fallback import

If the worker fails for any reason, offer paste import. The student copies the ERS schedule page content; the client attempts:
1. Tab- or multi-space-delimited table parse
2. HTML table parse if the paste contains markup
3. Line-by-line heuristic against the same regex as above

Whatever is recovered goes to the same review screen. Anything unrecovered can be entered manually.

### 3.5 Derived queries

```
now()          → block where day = today and start ≤ now < end
next()         → earliest block where day = today and start > now,
                 else first block of the next day with any blocks
day(D)         → ordered blocks for day D
freeBlocks(D, minMinutes)
               → gaps between consecutive blocks on D, plus the
                 leading gap from a configurable day start and the
                 trailing gap to a configurable day end,
                 filtered to gaps ≥ minMinutes
weekLoad()     → total scheduled minutes per day
```

`freeBlocks` is used by the study scheduler, the assistant, and group coordination. Day start and end default to 07:00 and 21:00 and are student-configurable.

---

## 4. M2 — Attendance

### 4.1 Prompt scheduling

For each `schedule_block` on a class day, schedule a local notification at `end_time + prompt_delay` (default 5 minutes). Firing requires an installed PWA with notification permission; if unavailable, the prompt appears in-app on next open.

Prompts are suppressed when: the student already recorded that block; the day is marked as suspended; or the block is a manual entry with prompting disabled.

### 4.2 Recording

One tap writes `{enrollment_id, block_id, date, status}` where status ∈ `present | absent | late | excused`. Writes are optimistic and offline-safe.

`excused` is student-declared and does not count toward the absence total. It exists so a student can distinguish an approved absence from a cut without inflating their count.

### 4.3 Absence arithmetic

```
absence_units = count(absent) + floor(count(late) / lates_per_absence)
```

`lates_per_absence` defaults to 3 and is per-course configurable. `excused` is excluded entirely.

```
remaining = max(0, allowed_absences − absence_units)
ratio     = absence_units / allowed_absences
```

Thresholds fire once each, on crossing:

| Ratio | State |
|---|---|
| < 0.5 | normal |
| ≥ 0.5 | caution |
| ≥ 0.8 | warning |
| ≥ 1.0 | at limit |

`allowed_absences` defaults from a university-wide value (see PRD Q1) and is overridable per course, since the real limit comes from the syllabus.

### 4.4 Catch-up

A weekly view lists every block from the past 7 days with no record, ordered by date. Each row records in one tap. The view exists because notification delivery is unreliable — especially on iOS — and a student who cannot backfill will abandon the feature.

### 4.5 Privacy enforcement

There is no query path, view, endpoint, or export in the entire product that returns attendance for more than one student. This is enforced by RLS and by the absence of any such endpoint. Section-level aggregates are not a future feature; they are excluded by design.

---

## 5. M3 — Grades & GWA

### 5.1 Scale

TUP uses 1.00 (highest) through 5.00 (failing), in 0.25 steps, with 3.00 as the passing threshold. Values are stored as `numeric(3,2)`. Non-numeric marks (`INC`, `DRP`, `W`) are stored in a separate `mark` column and excluded from GWA computation.

### 5.2 GWA computation

```
GWA = Σ(grade_i × units_i) / Σ(units_i)
```

over all courses with a numeric grade. Rounded to two decimals for display, full precision retained internally.

- **Term GWA** — courses in one term.
- **Cumulative GWA** — all graded courses across all terms.
- **Projected GWA** — graded courses plus student-estimated grades for ungraded ones, clearly marked as a projection.

Courses with a non-numeric mark are excluded from both numerator and denominator, and the exclusion is stated in the UI so a student is not confused by a denominator that does not match their unit load.

### 5.3 What-if planner

Given a target GWA `T`, graded courses `G`, and ungraded courses `U`:

```
required_total   = T × (Σunits(G) + Σunits(U))
achieved_points  = Σ(grade × units) over G
needed_points    = required_total − achieved_points
uniform_required = needed_points / Σunits(U)
```

`uniform_required` is the grade needed in every remaining course, assuming uniformity.

**Feasibility.** If `uniform_required < 1.00`, the target is unreachable; state this plainly with the best achievable GWA. If `uniform_required > 3.00`, the target is reachable even while failing courses; state that too.

**Non-uniform solving.** A student may pin an expected grade for specific courses. The solver then recomputes `uniform_required` across the unpinned remainder. If pinning makes the target infeasible, report which pin is responsible.

**Reverse mode.** Given a threshold (Dean's List, scholarship retention), report the maximum grade the student can receive in each remaining course while still clearing it.

### 5.4 Component tracking

Optional per course. A student defines components with weights summing to 100:

```
current_standing = Σ(score_i × weight_i) / Σ(weight_i)   [over completed components]
remaining_weight = 100 − Σ(weight_i)                     [over completed]
required_on_remaining = (target_percentage × 100 − Σ(score_i × weight_i)) / remaining_weight
```

Where `target_percentage` derives from the student's target letter grade via a per-course, student-editable mapping — because the percentage-to-1.00-scale mapping varies by professor and is not knowable centrally.

### 5.5 Threshold monitoring

Thresholds are student-defined records: `{name, comparator, value, scope}` — for example `{Dean's List, ≤, 1.75, term}`. On any grade change, evaluate all thresholds against current and projected GWA. Fire a notification on transition from clear to at-risk or breached. Never fire repeatedly for a state already reported.

---

## 6. M4 — Deadlines

### 6.1 Model

A deadline is `{title, course?, due_at, notes?, status, source, source_ref?}`. `course` is optional because not everything academic belongs to a course. `source` ∈ `manual | announcement | photo | assistant | group`.

Status transitions: `open → done`, `open → dismissed`, either reversible.

### 6.2 Urgency

```
hours_left = (due_at − now) / 3600

critical   hours_left ≤ 6
urgent     hours_left ≤ 24
soon       hours_left ≤ 72
upcoming   hours_left ≤ 168
later      otherwise
overdue    hours_left < 0 and status = open
```

Urgency drives ordering and emphasis. It is recomputed on render, never stored.

### 6.3 Reminders

Default at 72h, 24h, and 6h before `due_at`, each individually disableable, with per-deadline overrides. Reminders are suppressed when the deadline is already `done`, and when the fire time is in the past at scheduling time.

### 6.4 Photo extraction

```
capture → upload → OCR → structure → propose → confirm
```

OCR runs first; the extracted text goes to the AI Gateway with the `deadline_extract` capability. The model returns strict JSON: `{title, course_code, due_date, due_time, confidence}`.

Validation before proposing:
- `course_code` must match one of the student's current enrollments, else it is dropped and the field left blank
- `due_date` must be within the current term, else flagged
- Confidence below 0.6 presents all fields as empty-but-suggested rather than pre-filled

The student always confirms. Nothing from a photo is written without review.

### 6.5 Subtasks

A deadline may hold ordered subtasks, each with its own optional due date and status. Parent progress is `done_subtasks / total_subtasks`. Completing all subtasks proposes — does not force — marking the parent done.

---

## 7. M5 — Announcements

### 7.1 Intake channels

| Channel | Platform | Mechanism |
|---|---|---|
| Share target | Android | Web Share Target API; accepts text and images |
| Paste | All | Manual paste into an intake field |
| Image upload | All | Screenshot upload, OCR'd |
| Page webhook | All | Messages sent to an official OneTUP Facebook Page |
| Admin post | — | Direct authoring for university-wide items |

The share target is registered in the web app manifest with `method: POST` and `enctype: multipart/form-data`, accepting `title`, `text`, and `image` files. iOS Safari does not support Share Target; onboarding on iOS therefore surfaces paste and screenshot as the primary paths.

### 7.2 Processing pipeline

```
receive → normalise → deduplicate → extract → validate → propose → publish → fan out
```

**Normalise.** Strip quoted reply chains, sender names, timestamps, and reaction text. Collapse whitespace. For images, OCR first.

**Deduplicate.** Compute a SimHash over the normalised text. If an announcement exists in the same course within 48 hours with Hamming distance ≤ 3, treat as a duplicate: increment its confirmation count and attach the submitter, rather than creating a new record.

**Extract.** AI Gateway, capability `announcement_extract`. Returns strict JSON:

```json
{
  "course_code": "CS 3107 | null",
  "type": "exam|quiz|deadline|room_change|suspension|schedule_change|general",
  "event_date": "ISO date | null",
  "event_time": "HH:MM | null",
  "summary": "one sentence, ≤140 chars",
  "detail": "cleaned original content",
  "creates_deadline": true,
  "confidence": 0.0-1.0
}
```

**Validate.** `course_code` must match an enrollment held by the submitter; otherwise it is nulled and the announcement is routed as unclassified. Dates outside the term are flagged. Confidence below 0.5 means fields are proposed as blank.

**Propose.** The submitter reviews the structured result and can correct every field.

**Publish.** Insert with a trust level:

| Submitter | Trust | Behaviour |
|---|---|---|
| Approved class representative for that section | `verified` | Publishes with a verified marker |
| Enrolled student | `community` | Publishes with confirmation count starting at 1 |
| Administrator | `official` | Publishes university-wide, pushes to all |

**Fan out.** Visible to students enrolled in the matched course, or to everyone for university-wide. Push notification is sent for `verified` and `official`, and for `community` only once confirmations reach 3.

### 7.3 Community verification

Any enrolled student may confirm or dispute. Confirmations increment; disputes increment separately. At `disputes ≥ 2` and `disputes > confirmations`, the announcement is hidden pending moderation. This prevents both accidental misinformation and small-scale abuse without requiring a moderator in the loop for normal cases.

### 7.4 Representative verification

A student applies with section and a stated basis. A moderator approves or rejects. One active representative per section. The role is revocable, and revocation does not delete prior announcements but downgrades their trust marker to `community`.

### 7.5 Announcement to deadline

When `creates_deadline` is true and an `event_date` was extracted, offer a one-tap action creating a deadline with `source = 'announcement'` and `source_ref` pointing at the announcement, so the deadline always shows where it came from.

---

## 8. M6 — Commute & departure

### 8.1 Graph model

```
Area  (origin neighbourhoods)  ──┐
                                 ├── Leg ──► Hub ── Leg ──► TUP
Hub   (transfer points)       ───┘
```

A `Route` is an ordered list of `Leg`s from an `Area` to TUP. Legs are shared across routes — one "LRT-1 Monumento → Central Terminal" leg serves every route that uses it, so a fare change is a single edit.

**Leg fields:** `mode`, `from_point`, `to_point`, `base_fare`, `fare_rule`, `duration_minutes`, `peak_penalty_minutes`, `notes`, `last_verified_at`, `verified_count`, `geometry`.

### 8.2 Ranking

```
fastest         = min(Σ duration, adjusted for current peak)
cheapest        = min(Σ student_fare)
fewest_transfers= min(count(legs) excluding walking legs)
```

Ties break by verification recency, then by verification count.

### 8.3 Fare computation

```
student_fare(leg) =
  if fare_rule = 'puv_student_20'  → round(base_fare × 0.80, 2)
  if fare_rule = 'rail_matrix'     → lookup(matrix, from_point, to_point, 'student')
  if fare_rule = 'flat'            → base_fare
  if fare_rule = 'free'            → 0
```

Both regular and student fares are displayed. Rounding follows the operator's convention, configurable per rule.

### 8.4 Peak-hour model

Peak bands are configured per corridor as `{days, start, end, penalty_minutes, severity}`. A route intersecting a band adds the penalty. Severity drives whether an alert is shown and how strongly it is worded.

Default bands, adjustable from observed data:

| Corridor | Weekday morning | Weekday evening |
|---|---|---|
| Rail | 06:30–09:00 (+20) | 17:00–19:30 (+20) |
| EDSA bus | 06:00–09:30 (+30) | 16:30–20:00 (+30) |
| Jeep, city roads | 07:00–09:00 (+10) | 17:00–19:00 (+10) |

### 8.5 Departure plan

Recomputed nightly and on any change to schedule, saved route, or preferences.

```
class_start        = first class of the next class day
arrive_by          = class_start − arrive_early_buffer      (default 15 min)
base_duration      = Σ leg durations of the saved route
peak_penalty       = Σ penalties for bands intersecting the projected travel window
weather_penalty    = weather_buffer if precipitation_probability ≥ threshold  (default 60%, 15 min)
adjusted_duration  = base_duration + peak_penalty + weather_penalty
leave_at           = arrive_by − adjusted_duration
wake_at            = leave_at − preparation_time            (default 45 min)
```

**Iteration.** The projected travel window depends on `leave_at`, which depends on the penalty, which depends on the window. Compute once with an unadjusted window, then recompute with the resulting window, capped at three iterations. It converges in one or two in practice.

**Explanation.** Templated from the applied adjustments, never generated:

> "Rush hour adds about 20 minutes on LRT-1 and rain is forecast at 6 AM, so your alarm moved 15 minutes earlier."

**Notifications.** Wake alarm at `wake_at`; leave-now at `leave_at`; optional final nudge at `leave_at + 10` if no dismissal was recorded.

### 8.6 Route contribution

A student submits a route as an ordered set of legs, each with mode, endpoints, fare, and duration. New legs enter `pending` and are visible only to the submitter until a moderator approves or two other students confirm. Existing legs can be flagged as changed, which prompts re-verification and demotes the leg until resolved.

### 8.7 Staleness

```
fresh    last_verified_at within 30 days
aging    31–90 days      → marked
stale    over 90 days    → marked, demoted in ranking, prompts verification
```

Any student viewing a route may confirm it, which is a one-tap action that updates `last_verified_at` and increments `verified_count`.

---

## 9. M8 — Faculty evaluation

### 9.1 Interaction model

All questions for one faculty member are present simultaneously. Keyboard `1`–`5` sets the focused question and advances focus. A baseline action sets every unanswered question to a chosen value; already-answered questions are untouched unless the student explicitly re-baselines.

State is `{faculty_id, question_id, value}` plus a free-text comment. Autosave on every change, debounced 400ms, to IndexedDB and then the server.

### 9.2 Comment assistance

The student writes bullet points. The `evaluation_polish` capability rewrites **only the supplied points** into prose. Constraints enforced in the prompt and validated on return:

- No content may be introduced that is not present in the student's input
- No rating language may be added
- Output length within 1.5× the input length
- Neutral, professional register

The result is presented as an editable draft. The student may accept, edit, or discard. The original bullets are retained until the student explicitly replaces them.

**The system never generates ratings.** There is no code path that produces a Likert value.

### 9.3 Submission abstraction

```
interface EvaluationSubmitter {
  submit(responses: EvaluationResponse[]): Promise<SubmitResult>
  capabilities(): { automated: boolean, requiresReview: boolean }
}
```

Three implementations, selected by configuration:

1. `SanctionedApiSubmitter` — if TUP provides an endpoint. Preferred.
2. `ExtensionSubmitter` — fills the form the student is authenticated on, in their browser, requiring explicit review before their own submit action.
3. `ClipboardSubmitter` — formats responses for the student to transfer manually. Always available; the default.

The collection layer is independent of the submission layer, so a change of path requires no changes to M8.

---

## 10. M9 — Study

### 10.1 Study pack generation

```
upload → extract text → chunk → generate → validate → store
```

**Extract.** PDF via text layer, falling back to OCR. Images via OCR. Plain text directly.

**Chunk.** Semantic chunking at approximately 1,500 tokens with 150-token overlap, splitting on headings where present.

**Generate.** Sequential capabilities, each producing strict JSON:

| Capability | Output |
|---|---|
| `study_summary` | 150–300 word summary, key concept list |
| `study_flashcards` | 15–40 cards, `{front, back, source_chunk_id}` |
| `study_questions` | 8–20 questions, `{question, answer, explanation, difficulty, source_chunk_id}` |

Every artefact carries `source_chunk_id`, so any card or question can be traced back to the exact source passage. This is what makes "check it against the source" actionable rather than decorative.

**Validate.** Reject cards with empty sides, questions whose answer is not supported by the cited chunk (checked by a lightweight entailment pass), and duplicates within the pack.

### 10.2 Spaced repetition

SM-2 with standard parameters.

```
quality q ∈ {0 again, 3 hard, 4 good, 5 easy}

if q < 3:
  repetitions = 0
  interval    = 1
else:
  repetitions += 1
  interval = 1                    if repetitions = 1
           = 6                    if repetitions = 2
           = round(prev × EF)     otherwise

EF = max(1.3, EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02)))
next_review = today + interval days
```

Cards due today are surfaced. When a linked deadline is within 7 days, intervals for that pack compress so all cards are reviewed at least once before the date.

### 10.3 Study modes

| Mode | Mechanic |
|---|---|
| **Pomodoro** | 25/5 configurable timer; logs a `study_session` against the course |
| **Flashcards** | SM-2 queue as above |
| **Blurt** | Source hidden; student writes free recall; `blurt_compare` capability returns covered concepts, missed concepts, and any factual error, each citing a source chunk |
| **Feynman** | Student explains simply; `feynman_probe` returns up to three questions targeting apparent gaps; never asserts, only asks |
| **Practice test** | N questions drawn from the pack, timed, scored; wrong answers feed back into the SM-2 queue at `q = 0` |
| **Cram** | Given hours remaining, produce a condensed summary and a session plan; deterministic time allocation, generated content only for the summary |

### 10.4 Study block scheduling

```
inputs:  deadlines within horizon, free blocks from M1, pack sizes
compute: priority = urgency_weight × pack_remaining
allocate: greedily assign free blocks to highest-priority packs,
          respecting a per-day cap and a minimum block of 25 minutes
output:   proposed sessions
```

Proposals are suggestions. They are never written to the schedule without the student accepting them, and accepting creates a manual block that can be deleted like any other.

---

## 11. M10 — Assistant

### 11.1 Intent routing

The first step classifies the query into exactly one route. Misrouting is the main failure mode, so classification uses a small, tightly-constrained prompt with a fixed enum output plus a confidence value. Below 0.7 confidence, the assistant asks a clarifying question rather than guessing.

| Route | Handling | Model role |
|---|---|---|
| `own_data` | SQL over the student's rows; template the answer | Phrasing only |
| `tup_knowledge` | Vector search over curated corpus; grounded generation | Generation, with citations |
| `commute` | Query the route graph; render map plus template | Phrasing only |
| `navigation` | Query campus places | Phrasing only |
| `action` | Map to a bounded write operation | Parameter extraction only |
| `general` | Generic response | Full generation, labelled |

### 11.2 own_data handling

The model never sees raw academic values in the request and never produces them in the response. Flow:

1. Classify the question to a named query template (e.g. `absences_remaining`, `free_blocks`, `grade_needed`).
2. Extract parameters (course code, minimum duration, target GWA).
3. Execute the corresponding parameterised SQL under the student's RLS context.
4. Fill a response template with the computed values.

The model chooses the template and the parameters. It does not compute. If no template matches, the assistant says so.

### 11.3 Action handling

Permitted actions in V2, each reversible and each confirmed:

| Action | Parameters |
|---|---|
| `create_deadline` | title, course, due_at |
| `log_attendance` | course, date, status |
| `set_reminder` | target, offset |
| `mark_deadline_done` | deadline_id |

Every action shows a preview before execution and produces an undo affordance after. No action sends anything outside the app, and no action is irreversible.

### 11.4 Bilingual handling

Input in English, Filipino, or code-switched Taglish is normal. Responses match the language of the query; for code-switched input, the dominant language wins. No translation layer is used — the models handle Filipino directly, and prompts instruct matching the user's register.

---

## 12. Notifications

### 12.1 Catalogue

| ID | Trigger | Timing | Default |
|---|---|---|---|
| `class_reminder` | Class start | −15 min | on |
| `leave_now` | Departure plan | at `leave_at` | on |
| `wake_alarm` | Departure plan | at `wake_at` | on |
| `attendance_prompt` | Class end | +5 min | on |
| `deadline_72h` / `_24h` / `_6h` | Deadline | −72h / −24h / −6h | on |
| `announcement_verified` | Verified or official post | immediate | on |
| `suspension` | Official suspension | immediate | on, not disableable |
| `threshold_breach` | GWA or absence threshold crossed | immediate | on |
| `cards_due` | Flashcards due | 18:00 daily | off |

### 12.2 Delivery

Web Push via service worker. On iOS this requires home-screen installation; onboarding explains this at the point where the student would otherwise be confused by silence.

Quiet hours default 22:00–06:00, suppressing everything except `wake_alarm` and `suspension`. Suppressed notifications surface in an in-app catch-up list.

---

## 13. Performance techniques

| Concern | Approach |
|---|---|
| Cold start | App shell precached; Today view renders from IndexedDB before any network call |
| Bundle size | Route-level code splitting; Leaflet and OCR loaded on demand only |
| List rendering | Virtualise anything over 50 rows |
| Map | Initialise lazily on first view of a map surface; reuse the instance across route switches |
| Images | Client-side downscale before upload; WebP where supported |
| AI | Cache on normalised input hash; stream responses; never call on a background timer |
| Database | Index every foreign key and every `(user_id, date)` pair used in a range scan |

---

## 14. Error handling

### 14.1 Classes

| Class | Behaviour |
|---|---|
| **Recoverable** | Retry with backoff; show a non-blocking indicator; preserve local state |
| **User-correctable** | State exactly what is wrong and the action that fixes it |
| **Degraded** | Feature unavailable, rest of the app continues; explain what is unavailable and why |
| **Fatal** | Only for corrupted local state; offer a reset that preserves server data |

### 14.2 Specific handling

| Scenario | Behaviour |
|---|---|
| Import authentication failure | "Those credentials didn't work on ERS." Offer retry and paste fallback. Never state which of the three fields was wrong. |
| Import parse failure | Commit what parsed; present unparsed rows for manual entry; report the parser version to telemetry |
| Offline write failure after max retries | Keep the local value, mark it unsynced, offer a manual retry |
| AI unavailable | Feature shows an unavailable state naming the affected capability only |
| AI returns malformed JSON | Retry once with a repair instruction; on second failure, fall back to manual entry |
| Map tiles fail | Render legs as a list; map area explains the situation |
| Push permission denied | Explain what stops working; surface the in-app catch-up as the alternative |

---

## 15. Testing focus

| Area | Priority | Rationale |
|---|---|---|
| Schedule parser, all day codes and malformed inputs | Critical | Everything depends on it; `TH`/`T` ordering is a real bug class |
| GWA and what-if arithmetic | Critical | Wrong numbers drive wrong decisions |
| Absence arithmetic including late conversion | Critical | Same |
| RLS policies, cross-user access attempts | Critical | The privacy guarantee |
| Offline write queue and reconciliation | High | Data loss risk |
| Departure plan iteration and convergence | High | Wrong wake time is a real-world harm |
| Announcement deduplication | High | Poor dedup makes the feed unusable |
| AI JSON schema conformance | High | Downstream code assumes structure |
| Fare rule evaluation | Medium | Wrong fares erode trust |
| SM-2 scheduling | Medium | Wrong intervals degrade study value |

Detailed test plan in [09-IMPLEMENTATION-PLAN.md](09-IMPLEMENTATION-PLAN.md) §6.
