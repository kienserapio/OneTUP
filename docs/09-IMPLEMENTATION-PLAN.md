# OneTUP — Implementation Plan & QA

**Version 1.0 · August 2026**

---

## 1. Approach

Iterative, thin-slice. Each sprint delivers something a real student could use, not a layer of infrastructure with nothing on top. The order is driven by dependency (M1 first, because everything reads from it) and by risk (the ERS parser and RLS are the two things most likely to be wrong, so they get real usage earliest).

**Team:** one primary engineer, expanding to two or three contributors from GDG on Campus after V1.
**Cadence:** two-week sprints.
**Definition of done:** merged, tested, deployed to staging, documented, and verified against acceptance criteria by someone other than the author where possible.

---

## 2. Environments

| Environment | Purpose | Data |
|---|---|---|
| Local | Development | Seeded fixtures, no real students |
| Staging | Integration and pilot | Real accounts, real ERS, pilot cohort only |
| Production | Live | Real |

Staging uses a separate Supabase project and a separate worker deployment. Production secrets never exist in staging.

**ERS testing.** The scraper cannot be tested against a mock alone — the value is in handling the real portal's quirks. Testing uses the maintainer's own account plus explicitly consenting pilot volunteers. A recorded HTML fixture set is captured from real responses for the unit-level parser tests, with all personal values replaced.

---

## 3. Phases

### Phase 0 — Foundations (2 weeks)

| # | Deliverable |
|---|---|
| 0.1 | Repository, CI, linting, formatting, commit conventions |
| 0.2 | Supabase projects (staging, production), migration tooling |
| 0.3 | Migrations 001–004 with RLS policies |
| 0.4 | RLS coverage, policy existence, and view-safety CI checks (schema doc §17) |
| 0.5 | Next.js app skeleton, PWA manifest, service worker registration |
| 0.6 | IndexedDB layer, write queue, sync engine |
| 0.7 | Supabase Auth: sign-up, sign-in, verification, reset |
| 0.8 | Error envelope, request ID propagation, structured logging |

**Exit:** a student can create an account, sign in, and the app installs to a home screen. Cross-user access tests pass.

---

### Phase 1 — Schedule (3 weeks)

| # | Deliverable |
|---|---|
| 1.1 | Sync Worker container: browser automation, login, schedule fetch |
| 1.2 | Parser with versioned column configuration and day-code mapping |
| 1.3 | Parser unit tests against recorded fixtures, including malformed rows |
| 1.4 | `POST /api/ers/import` with rate limiting and lockout |
| 1.5 | Consent screen |
| 1.6 | Review-and-correct step |
| 1.7 | `POST /api/schedule/commit`, idempotent |
| 1.8 | Paste import fallback |
| 1.9 | Manual block creation and editing |
| 1.10 | Timetable and day views, offline-cached |
| 1.11 | Re-sync with diff and per-change accept/reject |
| 1.12 | Derived queries: `now`, `next`, `day`, `freeBlocks` |

**Exit:** ≥95% import success across at least 20 real student accounts spanning at least three programs. Offline schedule verified with the network disabled.

**Risk focus:** this is where the `TH`/`T` ordering bug, compound day codes, and column drift will surface. Budget time for a second parser iteration after first contact with real data from programs other than the maintainer's own.

---

### Phase 2 — Attendance & grades (2 weeks)

| # | Deliverable |
|---|---|
| 2.1 | Attendance recording, one tap, offline-safe |
| 2.2 | Prompt scheduling at class end, with suppression rules |
| 2.3 | Weekly catch-up view |
| 2.4 | Absence arithmetic including late conversion and excused exclusion |
| 2.5 | Per-course limits with preference defaults |
| 2.6 | Threshold states and notifications with state tracking |
| 2.7 | Grade entry, non-numeric marks handling |
| 2.8 | Term and cumulative GWA |
| 2.9 | What-if planner with feasibility reporting and pinning |
| 2.10 | Threshold configuration and monitoring |
| 2.11 | Component tracking |

**Exit:** arithmetic verified against a hand-computed reference set of at least 30 cases including edge conditions (all-INC term, zero graded units, pinned-infeasible targets).

---

### Phase 3 — Deadlines & announcements (3 weeks)

| # | Deliverable |
|---|---|
| 3.1 | Deadline CRUD, urgency computation, panic view |
| 3.2 | Reminder scheduling and Web Push delivery |
| 3.3 | Subtasks |
| 3.4 | AI Gateway: routing, caching, redaction, validation, logging |
| 3.5 | `announcement_extract` capability with golden set |
| 3.6 | Web Share Target registration and intake endpoint |
| 3.7 | Paste and screenshot intake |
| 3.8 | Deduplication via SimHash |
| 3.9 | Announcement proposal, review, publish, fan-out |
| 3.10 | Confirmation and dispute mechanics |
| 3.11 | Class representative application and moderation |
| 3.12 | Announcement-to-deadline conversion |
| 3.13 | `deadline_extract` capability with OCR |

**Exit:** AI evaluation suite passes all thresholds in AI spec §6.2, including the three zero-tolerance metrics. Push delivery ≥90% within 60s on Android.

---

### Phase 4 — Commute & departure (3 weeks)

| # | Deliverable |
|---|---|
| 4.1 | Commute reference schema and seed for the top 8 origin corridors |
| 4.2 | Fare rule evaluator |
| 4.3 | Route query with ranking and peak adjustment |
| 4.4 | Leaflet map with leg rendering and labelled markers |
| 4.5 | Route contribution and verification flow |
| 4.6 | Staleness computation and demotion |
| 4.7 | Departure plan computation with iteration |
| 4.8 | Weather integration |
| 4.9 | Wake and leave notifications |
| 4.10 | Preference configuration |
| 4.11 | Offline route caching |
| 4.12 | `commute_intent` capability and map-linked answers |

**Exit:** departure plans verified against manual computation for 10 real student commutes. Route data offline-verified.

---

### Phase 5 — V1 hardening and pilot (2 weeks)

| # | Deliverable |
|---|---|
| 5.1 | Full accessibility audit against NFR-X1–X5 |
| 5.2 | Performance audit against NFR-P1–P6 |
| 5.3 | Security review against the pre-launch checklist (auth doc §12) |
| 5.4 | Degradation testing: every failure mode in ARD §6.4 |
| 5.5 | Pilot with 30–50 students across at least four colleges |
| 5.6 | Feedback triage and fixes |
| 5.7 | Privacy policy, terms, incident runbook |
| 5.8 | Public launch |

**Launch timing:** ideally the week before a term begins, when schedule import is most relevant. Second-best is the week before an evaluation period, paired with shipping M8.

---

### Phase 6 — V1.5: campus & evaluation (3 weeks)

| # | Deliverable |
|---|---|
| 6.1 | Campus place schema and seed |
| 6.2 | Public campus page, unauthenticated |
| 6.3 | Category filtering, room lookup |
| 6.4 | Correction submission and moderation |
| 6.5 | Offline emergency contacts |
| 6.6 | Evaluation instrument configuration |
| 6.7 | Keyboard-first evaluation entry with baseline fill |
| 6.8 | Draft autosave |
| 6.9 | `evaluation_polish` with content-addition guardrail |
| 6.10 | Submission abstraction with clipboard implementation |
| 6.11 | 360° tour embed, **if licensing is resolved** |

---

### Phase 7 — V2: study & assistant (4 weeks)

| # | Deliverable |
|---|---|
| 7.1 | File upload, text extraction, OCR fallback |
| 7.2 | Chunking and local embedding generation |
| 7.3 | `study_summary`, `study_flashcards`, `study_questions` |
| 7.4 | Artefact validation and source linking |
| 7.5 | SM-2 implementation and review queue |
| 7.6 | Study modes: Pomodoro, flashcards, blurt, Feynman, practice test |
| 7.7 | Knowledge base ingestion and indexing |
| 7.8 | `assistant_route`, `assistant_answer_grounded` |
| 7.9 | Own-data query templates |
| 7.10 | Bounded actions with preview and undo |
| 7.11 | Grounding-check post-validation |

---

### Phase 8 — TUP Data API (3 weeks, parallelisable)

| # | Deliverable |
|---|---|
| 8.1 | Curriculum data model and BSCS seed |
| 8.2 | Prerequisite graph with reverse edges |
| 8.3 | Public read endpoints with caching and rate limiting |
| 8.4 | Campus and calendar endpoints |
| 8.5 | MCP server exposing the same dataset |
| 8.6 | Documentation site and CC BY 4.0 licence |
| 8.7 | Expansion to three more programs |

This phase can run alongside Phases 6–7 if a contributor is available, and unlocks everything in the future-enhancements roadmap.

---

## 4. Sprint map

| Sprint | Weeks | Content |
|---|---|---|
| S1 | 1–2 | Phase 0 |
| S2 | 3–4 | Phase 1.1–1.7 |
| S3 | 5–6 | Phase 1.8–1.12 |
| S4 | 7–8 | Phase 2 |
| S5 | 9–10 | Phase 3.1–3.4 |
| S6 | 11–12 | Phase 3.5–3.13 |
| S7 | 13–14 | Phase 4.1–4.6 |
| S8 | 15–16 | Phase 4.7–4.12 |
| S9 | 17–18 | Phase 5 → **V1 launch** |
| S10 | 19–20 | Phase 6.1–6.6 |
| S11 | 21–22 | Phase 6.7–6.11 → **V1.5** |
| S12–13 | 23–26 | Phase 7 → **V2** |
| S14–15 | 27–30 | Phase 8 → **API public** |

Approximately 30 weeks to V2 with one engineer, allowing for coursework. Sequence is more important than the dates.

---

## 5. Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | |
| Styling | Tailwind | Design system defined separately |
| Client state | React Query + Zustand | |
| Local store | IndexedDB via `idb` | |
| Backend | Supabase: Postgres, Auth, Storage, Edge Functions | |
| Worker | Node + Playwright, containerised | Playwright over Selenium for a better headless API and built-in waiting |
| Maps | Leaflet + OpenStreetMap raster tiles | |
| AI | OpenRouter via internal gateway | |
| Embeddings | Local sentence-transformer, 384-dim | |
| OCR | Tesseract.js client-side; server fallback | |
| Push | Web Push, VAPID | |
| Hosting | Vercel (app), container host (worker) | |
| Monitoring | Self-hosted or free-tier error tracking | |

**Playwright rather than Selenium.** The reference scraper uses Selenium. Playwright offers better auto-waiting, a cleaner context isolation model (which matters for the credential constraint), and simpler containerisation. The parsing logic ports directly.

---

## 6. Test strategy

### 6.1 Levels

| Level | Scope | Tooling |
|---|---|---|
| Unit | Pure functions: parsers, arithmetic, fare rules, SM-2, urgency | Vitest |
| Integration | API endpoints, RLS policies, sync reconciliation | Vitest + Supabase local |
| Contract | AI capability schema conformance | Golden sets, automated |
| E2E | Critical user journeys | Playwright |
| Manual | Real ERS import, real devices, accessibility | Checklist |

### 6.2 Critical test cases

**Schedule parser**

| Case | Expectation |
|---|---|
| `TH` day code | Thursday, never Tuesday |
| `SUN` day code | Sunday, never Saturday |
| Compound `MW`, `TTH`, `MWF` | Expands to one meeting per day |
| Missing room | `TBA` |
| Malformed time range | `parse_status = failed`, raw preserved |
| Prefix before ` - ` | Ignored; final segment used |
| `10:00AM` and `10:00 AM` | Both parse identically |
| Empty faculty | Accepted, null |
| Row with fewer cells than expected | Flagged, not crashed |

**GWA**

| Case | Expectation |
|---|---|
| Standard mixed grades | Matches hand computation to 4 decimals |
| All courses `INC` | GWA undefined, stated plainly, no division by zero |
| Single course | Equals that grade |
| Target below best possible | Reported infeasible with best achievable |
| Target reachable while failing | Reported as such |
| Pinned grade making target infeasible | Names the responsible pin |

**Attendance**

| Case | Expectation |
|---|---|
| 3 lates, `lates_per_absence = 3` | 1 absence unit |
| 2 lates | 0 absence units |
| Excused entries | Excluded entirely |
| Crossing 0.8 ratio | Warning fires once, not repeatedly |
| Offline record then reconnect | Persists, no duplicate |

**RLS**

| Case | Expectation |
|---|---|
| User A reads B's grades | Zero rows |
| User A updates B's attendance | Fails |
| User A inserts an announcement into a course they are not enrolled in | Fails |
| Anonymous reads `campus_places` | Succeeds for approved rows only |
| Anonymous reads `schedule_blocks` | Zero rows |
| Every view queried as a non-owner | Zero rows |

**Departure plan**

| Case | Expectation |
|---|---|
| No peak, no rain | `leave_at = arrive_by − base` |
| Peak band intersects | Penalty applied once, not per leg |
| Iteration where the penalty shifts the window out of the band | Converges within 3 iterations |
| No class next day | No plan generated |
| Class before configured day start | Plan still generated |

**Offline**

| Case | Expectation |
|---|---|
| Airplane mode, cold open | Today view renders from cache |
| Attendance recorded offline | Queued, applied on reconnect |
| Queue flush fails 10 times | Local value preserved, error surfaced |
| Conflicting server value on grade | Conflict surfaced, not silently overwritten |

### 6.3 AI contract testing

Every capability runs against its golden set on every prompt change and weekly against the current model roster, since free-tier models can be swapped by the provider. A drop below threshold triggers a model-ladder review, not a code change.

### 6.4 Manual test matrix

| Device | Browser | Priority |
|---|---|---|
| Mid-range Android | Chrome | Critical — the primary target |
| iPhone | Safari, installed PWA | Critical — push behaviour differs |
| iPhone | Safari, not installed | High — confirm the degradation message |
| Low-end Android, 3G | Chrome | High — performance floor |
| Desktop | Chrome, Firefox | Medium |

---

## 7. Release process

```
feature branch → PR → CI (lint, unit, integration, RLS checks) → review
→ merge to main → deploy to staging → smoke test → manual gate
→ deploy to production → monitor 24h
```

**Migrations** are forward-only. Every migration has a documented rollback, tested on staging before it is applied to production. A migration that cannot be rolled back safely is split until it can be.

**Feature flags** gate anything user-visible that has not completed pilot testing. Flags are removed within two sprints of full rollout, so they do not accumulate.

---

## 8. Monitoring

| Metric | Alert threshold |
|---|---|
| Import success rate | < 90% over 1 hour |
| Parser failure by version | Any spike |
| AI error rate | > 10% over 30 min |
| AI cache hit rate | < 30% (indicates a cache-key bug) |
| Push delivery rate | < 80% |
| Offline queue depth, p95 | > 20 items |
| API p95 latency | > 2s |
| RLS violation attempts | Any |
| Worker timeout rate | > 5% |

**Never logged:** credentials, credential-shaped fields, grades, attendance values, announcement content, uploaded document content.

---

## 9. Rollout

**Pilot (30–50 students).** Recruited deliberately across at least four colleges — not only Computer Science — because the parser and the assumptions need contact with programs that have laboratory blocks, field work, and irregular scheduling. Direct feedback channel, weekly check-in.

**Soft launch.** GDG on Campus and one or two partner organisations. Class representative recruitment begins here: the announcement module has no value until sections have representatives.

**Public launch.** Timed to the start of a term. Campus map published first as a free-standing public page, since it needs no account and creates a reason to visit before the app itself is relevant.

**Growth.** The evaluation module shipped ahead of an evaluation period is the strongest single adoption lever, because it reaches every student simultaneously with something they must do anyway.

---

## 10. Post-launch operations

| Cadence | Activity |
|---|---|
| Daily | Check import success rate and error volume |
| Weekly | Triage moderation queue; review stale commute and campus records |
| Fortnightly | AI golden-set run against the current model roster |
| Per term | Refresh terms and calendar; verify parser against any portal changes; re-verify seeded fare data |
| Quarterly | Rotate worker secret; dependency audit; RLS re-audit |
| Annually | Curriculum data refresh; accessibility re-audit |

---

## 11. Sustainability

The single largest risk to this project is that it depends on one person who graduates in 2027.

| Measure | Purpose |
|---|---|
| Open-source the client | Others can fork and continue |
| Publish the TUP Data API under CC BY 4.0 | Creates dependents who have reason to maintain it |
| Document decisions, not just code | These documents are the handover |
| Recruit co-maintainers from GDG on Campus by V1.5 | Bus factor above one before the maintainer's final year |
| Keep the stack boring and managed | A successor should not need to run infrastructure |
| Record all operational credentials in a shared, access-controlled store | Handover is possible without the original owner |
