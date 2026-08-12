# OneTUP — Product Requirements Document

**Version 1.0 · August 2026**

---

## 1. Why this exists

### 1.1 The problem

A TUP Manila student's academic life is scattered across systems that do not talk to each other:

- **The schedule** lives in ERS, behind a login, rendered as an HTML table that is painful to read on a phone.
- **Deadlines** live in six different Messenger group chats, several Google Classrooms, and whatever the professor said out loud on Tuesday.
- **Grades** are checked by logging into ERS, then computed by hand in a Notes app when a student wants to know whether their scholarship survives.
- **Attendance** is tracked by memory, badly, until a student discovers they are one absence past the limit.
- **Announcements** — a suspended class, a moved quiz, a changed room — reach students through a class representative relaying to a group chat, where they are buried within an hour.
- **Getting to campus** is a daily gamble. Google Maps does not know jeepney routes, does not know fares, and has no concept of the 20% student discount.
- **Finding a room** on a campus you are new to means asking three people.

None of this is exotic. It is the ordinary texture of being a student, and it consumes attention that should go to studying.

### 1.2 The consequence

Students carry a permanent low-grade administrative load. They miss deadlines they knew about. They lose scholarships to arithmetic they did not do in time. Freshmen arrive late for weeks because nobody told them which gate is nearest the LRT walk. Commuters wake up at a guessed hour and either arrive exhausted and early or stressed and late.

### 1.3 Why now

Three things make this solvable in 2026 that were not true before:

1. **ERS exposes schedule data** to an authenticated student, in a parseable form.
2. **PWAs are viable** on both mobile platforms — installable, offline-capable, push-enabled — removing the app store as a barrier for a free student project.
3. **Capable language models are free at the API tier**, making per-student AI features economically possible for a product with no revenue.

### 1.4 What we are not doing

We are not building a social network, a marketplace, a replacement for ERS, or an official university system. We are not monetising. We are not building anything that requires institutional approval to launch, though we will pursue it where it improves the product.

---

## 2. Product statement

> **OneTUP is one app for your TUP student life.** Import your schedule once, and it handles the rest — what is due, how many cuts you have left, what your GWA needs to be, what your class representative just posted, when to leave the house, and where Room 312 actually is.

**Positioning note.** OneTUP is a student utility that happens to use AI in specific, labelled places. It is never marketed as an AI product. Most of it — the GWA maths, the attendance counter, the schedule, the fare tables — is ordinary deterministic software. See §9.3.

---

## 3. Users

### 3.1 Primary persona — the commuting undergraduate

Third-year, any program, lives 60–90 minutes from campus, 6 subjects, 21 units. Owns a mid-range Android phone with limited storage and an unreliable data plan. Checks their phone constantly but installs almost nothing. Cares about: not being late, not failing, not missing deadlines, and money.

**Needs from OneTUP:** what is next, what is due, how many cuts left, when to leave.

### 3.2 Secondary persona — the freshman

First semester, does not know the campus, does not know the culture, does not yet have a reliable group chat. Highest anxiety, lowest information.

**Needs from OneTUP:** where things are, how to get here, what a class representative is, what is happening.

### 3.3 Secondary persona — the class representative / class representative

One per section. Already relays announcements manually. Motivated by being useful and by reducing repeated questions.

**Needs from OneTUP:** post once, reach everyone, stop answering "may pasok ba?" forty times.

### 3.4 Secondary persona — the scholar

On a GWA-conditional scholarship or Dean's List track. Grade-anxious, computes constantly.

**Needs from OneTUP:** live GWA, what-if planning, threshold warnings.

### 3.5 Tertiary — the org officer

Runs a student organisation. Wants members to actually see event announcements.

### 3.6 Non-users

Faculty and administration are **not** users of V1 and have no visibility into student data. This is a deliberate constraint, not an omission — see §8.1.

---

## 4. Goals and success criteria

### 4.1 Product goals

| Goal | Why it matters |
|---|---|
| G1 — Become a daily-open habit | Retention comes from daily utility, not from feature count |
| G2 — Reduce missed deadlines and surprise absences | The core measurable harm we are addressing |
| G3 — Make commuting predictable | The highest-friction, least-served problem |
| G4 — Work when the network does not | Campus wifi and corridors are dead zones |
| G5 — Earn trust with sensitive data | Grades and attendance are the most private things a student holds |

### 4.2 Success metrics

**Activation**
- ≥70% of sign-ups complete schedule import in the first session
- ≥50% install to home screen within 7 days
- Median time from sign-up to first useful screen: under 3 minutes

**Engagement**
- ≥40% D7 retention, ≥25% D30
- ≥3 sessions per active day for commuting students
- ≥60% of scheduled classes get an attendance response within 24h

**Outcome**
- Self-reported: ≥60% say they missed fewer deadlines
- ≥80% of students who set a GWA target check the what-if planner more than once
- Announcements reach ≥70% of an active section within 2 hours of posting

**Reliability**
- Schedule import success rate ≥95%
- Offline schedule availability 100%
- Push delivery for class reminders ≥90% within 60s of target time

### 4.3 Anti-goals

- We do not optimise for time-in-app. A student who opens OneTUP, sees what they need, and closes it in 8 seconds is a success.
- We do not gamify studying into compulsion.
- We do not add features that only Computer Science students would understand.

---

## 5. Scope

### 5.1 V1 — the spine

Six modules. Everything else is sequenced behind these.

| Module | Solves |
|---|---|
| **M1 Schedule** | Fragmentation. The keystone; all other modules read from it |
| **M2 Attendance** | "How many cuts do I have left?" |
| **M3 Grades & GWA** | Grade anxiety, threshold risk |
| **M4 Deadlines** | "What's due and when?" |
| **M5 Announcements** | "Is there class today? What did I miss?" |
| **M6 Commute & departure** | "What time do I need to wake up?" |

### 5.2 V1.5

| Module | Solves |
|---|---|
| **M7 Campus** | "Where is Room 312 / the nearest printing shop?" |
| **M8 Faculty evaluation** | A slow mandatory form; also a seasonal adoption spike |

### 5.3 V2

| Module | Solves |
|---|---|
| **M9 Study** | "I have a quiz Friday and a pile of unread notes" |
| **M10 Assistant** | Everything above, asked conversationally |

### 5.4 V3 and beyond

Social coordination, end-of-term recap, community resource library, and the agentic layer. See [10-FUTURE-ENHANCEMENTS.md](10-FUTURE-ENHANCEMENTS.md).

### 5.5 Out of scope permanently

- Anything that writes to ERS other than through a student's own explicit, reviewed action
- Faculty-facing dashboards or any aggregate reporting on students
- Automated submission of academic work
- Automated completion of faculty evaluations (see §8.4)
- Payment processing

---

## 6. Functional requirements

Requirements are numbered `FR-<module>-<n>`. Priority: **P0** must ship in that module's version, **P1** should, **P2** may.

### 6.1 M1 — Schedule

| ID | Requirement | Pri |
|---|---|---|
| FR-M1-1 | A student can import their current-term schedule by supplying ERS credentials once during onboarding | P0 |
| FR-M1-2 | Import produces structured records: course code, title, lecture units, lab units, total units, faculty name, day, start time, end time, room | P0 |
| FR-M1-3 | A student can review and correct any imported field before it is committed | P0 |
| FR-M1-4 | A student can add manual blocks (org meetings, work, personal) that behave identically to imported blocks | P0 |
| FR-M1-5 | A student can re-sync on demand; the system shows a diff of what changed before applying | P0 |
| FR-M1-6 | The current and next 7 days of schedule are available with no network connection | P0 |
| FR-M1-7 | If import fails, the student can paste raw ERS schedule text as a fallback | P0 |
| FR-M1-8 | The system computes free blocks of a requested minimum duration | P1 |
| FR-M1-9 | A student can share their free-block availability with a named group | P2 |

### 6.2 M2 — Attendance

| ID | Requirement | Pri |
|---|---|---|
| FR-M2-1 | At each class end time, the student is prompted to record Present, Absent, or Late in one tap | P0 |
| FR-M2-2 | A student can set a per-course allowed-absence limit, defaulting to a configurable university-wide value | P0 |
| FR-M2-3 | The system displays absences used against the limit per course | P0 |
| FR-M2-4 | The system warns at 50%, 80%, and 100% of the limit | P0 |
| FR-M2-5 | A weekly catch-up view lets a student fill any unanswered prompts for the past 7 days | P0 |
| FR-M2-6 | Attendance data is visible only to the owning student, with no aggregate or comparative view anywhere in the product | P0 |
| FR-M2-7 | A student can edit or delete any past attendance record | P0 |
| FR-M2-8 | Late records are counted per a student-configurable rule (e.g. 3 lates = 1 absence) | P1 |

### 6.3 M3 — Grades & GWA

| ID | Requirement | Pri |
|---|---|---|
| FR-M3-1 | A student can enter a final grade per course on the TUP 1.00–5.00 scale | P0 |
| FR-M3-2 | The system computes unit-weighted term GWA and cumulative GWA | P0 |
| FR-M3-3 | A student can set a target GWA; the system computes the grade required in each ungraded course to reach it | P0 |
| FR-M3-4 | The system flags when a target is arithmetically unreachable and states why | P0 |
| FR-M3-5 | A student can configure threshold values (Dean's List, scholarship, retention) and receive a warning when a projection falls below one | P0 |
| FR-M3-6 | A student can enter graded components with weights per course and see live standing plus required score on remaining work | P1 |
| FR-M3-7 | The system shows GWA trend across terms | P1 |
| FR-M3-8 | Grades are visible only to the owning student | P0 |

### 6.4 M4 — Deadlines

| ID | Requirement | Pri |
|---|---|---|
| FR-M4-1 | A student can create a deadline with title, course, due datetime, and optional notes | P0 |
| FR-M4-2 | All deadlines appear in one list sortable by due date and by urgency | P0 |
| FR-M4-3 | A student can view only items due in the next 48 hours in one action | P0 |
| FR-M4-4 | Configurable reminders fire at 72h, 24h, and 6h before due | P0 |
| FR-M4-5 | A student can photograph a whiteboard or screenshot; the system extracts a proposed deadline for confirmation | P1 |
| FR-M4-6 | A deadline can be broken into subtasks with individual due dates | P1 |
| FR-M4-7 | A deadline can be shared with a group, where members see shared completion state | P2 |
| FR-M4-8 | Deadlines created from an announcement retain a link to their source | P0 |

### 6.5 M5 — Announcements

| ID | Requirement | Pri |
|---|---|---|
| FR-M5-1 | Any student can submit an announcement by sharing text or an image into the app | P0 |
| FR-M5-2 | The system extracts course, type, date, and detail from a submission and presents it for confirmation before publishing | P0 |
| FR-M5-3 | A verified class representative's submission publishes to their section with a verified marker | P0 |
| FR-M5-4 | An unverified submission publishes with a confirmation count; other students in the section can confirm or dispute | P0 |
| FR-M5-5 | Duplicate submissions of the same announcement are merged | P0 |
| FR-M5-6 | An announcement is shown only to students enrolled in the matched course, except university-wide announcements | P0 |
| FR-M5-7 | Each announcement offers: add to deadlines, set reminder, mark read, report as wrong | P0 |
| FR-M5-8 | An administrator can publish university-wide announcements, including class suspensions, which push to all users | P0 |
| FR-M5-9 | A student can apply to be a class representative; approval is manual | P0 |
| FR-M5-10 | A section may have at most one active representative; the role is revocable | P0 |

### 6.6 M6 — Commute & departure

| ID | Requirement | Pri |
|---|---|---|
| FR-M6-1 | A student selects a home origin area from a curated list during onboarding | P0 |
| FR-M6-2 | The system returns route options between that origin and TUP Manila, each broken into legs | P0 |
| FR-M6-3 | Each leg displays mode, boarding point, alighting point, duration, regular fare, and student fare | P0 |
| FR-M6-4 | Routes are ranked by fastest, cheapest, and fewest transfers | P0 |
| FR-M6-5 | Routes render on a map with each leg visually distinguished and labelled | P0 |
| FR-M6-6 | The student discount is applied as a rule at display time, never stored as a second fare figure | P0 |
| FR-M6-7 | Each route shows a last-verified date; routes past a staleness threshold are demoted and flagged | P0 |
| FR-M6-8 | A student can submit a new route or correct an existing one | P0 |
| FR-M6-9 | The system computes a departure plan for the next class day: wake time, leave time, arrival time | P0 |
| FR-M6-10 | The departure plan adjusts for configured preparation time, arrive-early buffer, peak-hour penalty, and forecast rain | P0 |
| FR-M6-11 | The departure plan states, in plain language, why it differs from the baseline | P0 |
| FR-M6-12 | A student can set a wake alarm and a leave-now notification from the plan | P0 |
| FR-M6-13 | A reverse (going-home) view exists, including last-trip warnings for rail | P1 |
| FR-M6-14 | Route data is cached and readable with no network connection | P0 |
| FR-M6-15 | A student can ask a natural-language question about routing and receive an answer grounded in the route database, rendered on the map | P1 |

### 6.7 M7 — Campus

| ID | Requirement | Pri |
|---|---|---|
| FR-M7-1 | A public, unauthenticated page shows campus locations on a map | P0 |
| FR-M7-2 | Locations are filterable by category: buildings, gates, printing, food, study spots, services | P0 |
| FR-M7-3 | A student can search a room number and receive building, floor, and nearest gate | P0 |
| FR-M7-4 | Printing spots show price per page, hours, services, and last-verified date | P0 |
| FR-M7-5 | Anyone can suggest a correction; corrections are moderated before publishing | P0 |
| FR-M7-6 | Emergency and service contacts are available offline | P0 |
| FR-M7-7 | A 360° virtual tour may be embedded where licensing permits | P2 |

### 6.8 M8 — Faculty evaluation

| ID | Requirement | Pri |
|---|---|---|
| FR-M8-1 | A student can enter Likert responses for all questions for one faculty member without pagination | P0 |
| FR-M8-2 | Number keys 1–5 set a response and advance to the next question | P0 |
| FR-M8-3 | A student can set all questions to a baseline value in one action, then adjust individually | P0 |
| FR-M8-4 | Responses autosave as drafts and survive session loss | P0 |
| FR-M8-5 | A student can write a free-text comment and optionally have their own bullet points rewritten into prose, which they must review and may edit before it is saved | P0 |
| FR-M8-6 | The system never generates evaluation ratings or opinions on the student's behalf | P0 |
| FR-M8-7 | Completed responses are exported for the student to submit themselves; submission path is abstracted behind an interface | P0 |

### 6.9 M9 — Study

| ID | Requirement | Pri |
|---|---|---|
| FR-M9-1 | A student can upload notes, modules, or slides against a course | P0 |
| FR-M9-2 | The system generates a study pack: summary, key concepts, flashcards, and practice questions with answers | P0 |
| FR-M9-3 | Every generated artefact is labelled as generated and linked to its source material | P0 |
| FR-M9-4 | Flashcards are scheduled by a spaced-repetition algorithm | P0 |
| FR-M9-5 | Study modes available: Pomodoro, blurt, flashcard recall, Feynman, timed practice test | P1 |
| FR-M9-6 | Blurt mode compares a student's written recall against the source and reports gaps | P1 |
| FR-M9-7 | A cram mode produces a condensed pack and a sprint plan given hours remaining | P2 |
| FR-M9-8 | Study sessions are logged against the course | P1 |

### 6.10 M10 — Assistant

| ID | Requirement | Pri |
|---|---|---|
| FR-M10-1 | A student can ask questions answered by computation over their own data | P0 |
| FR-M10-2 | A student can ask questions answered by retrieval over a curated TUP knowledge base, with the source shown | P0 |
| FR-M10-3 | Commute questions are answered from the route database, never generated | P0 |
| FR-M10-4 | The assistant states plainly when it does not know rather than guessing | P0 |
| FR-M10-5 | The assistant can perform bounded write actions (create deadline, log attendance) on explicit instruction, each reversible | P1 |
| FR-M10-6 | The assistant accepts and responds in English and Filipino, including code-switched input | P1 |
| FR-M10-7 | Every assistant response involving a model is visually distinguishable from computed output | P0 |

---

## 7. Non-functional requirements

### 7.1 Performance

| ID | Requirement |
|---|---|
| NFR-P1 | First contentful paint under 1.8s on a mid-range Android device over 4G |
| NFR-P2 | Today view interactive under 2.5s cold, under 800ms warm |
| NFR-P3 | Any view backed by cached data renders offline in under 500ms |
| NFR-P4 | Schedule import completes within 45s at p95 |
| NFR-P5 | Assistant first token within 3s at p95 |
| NFR-P6 | Total JS bundle for the app shell under 250KB gzipped |

### 7.2 Availability and resilience

| ID | Requirement |
|---|---|
| NFR-A1 | The app remains usable, in read mode, with zero connectivity for all cached modules |
| NFR-A2 | Writes made offline queue and reconcile on reconnect |
| NFR-A3 | ERS unavailability degrades only import and re-sync; all other functions continue |
| NFR-A4 | AI provider unavailability degrades only generative features; all deterministic features continue |
| NFR-A5 | Target 99% monthly availability for the hosted API |

### 7.3 Security and privacy

| ID | Requirement |
|---|---|
| NFR-S1 | ERS credentials are never written to any server-side persistent store |
| NFR-S2 | Row-level security is enabled on every table containing user data, from the first migration |
| NFR-S3 | All traffic over TLS 1.2 or higher |
| NFR-S4 | AI provider keys exist only server-side and are never exposed to a client |
| NFR-S5 | A student can export all their data in a machine-readable format |
| NFR-S6 | A student can delete their account and all associated data, completing within 30 days |
| NFR-S7 | Personal data content is never sent to a third-party AI provider without the student's explicit, feature-level consent |
| NFR-S8 | Audit log for every automated write action, retained 90 days |

### 7.4 Accessibility

| ID | Requirement |
|---|---|
| NFR-X1 | WCAG 2.1 AA colour contrast throughout |
| NFR-X2 | All interactive elements reachable and operable by keyboard with visible focus |
| NFR-X3 | Touch targets minimum 44×44 CSS pixels |
| NFR-X4 | Motion respects `prefers-reduced-motion` |
| NFR-X5 | All content and controls have accessible names; the app is navigable by screen reader |

### 7.5 Compatibility

| ID | Requirement |
|---|---|
| NFR-C1 | Chrome/Android 100+, Safari/iOS 16+, and current Edge and Firefox |
| NFR-C2 | Functional at 320px viewport width |
| NFR-C3 | Installable as a PWA on Android and iOS |
| NFR-C4 | Push notifications on Android; on iOS, push requires home-screen installation and the product must communicate this during onboarding |

### 7.6 Cost

| ID | Requirement |
|---|---|
| NFR-$1 | Zero marginal cost per student. All third-party services must operate within free tiers at the projected V1 scale |
| NFR-$2 | Every AI call is user-triggered and cached; no background or batch generation |
| NFR-$3 | Model provider is abstracted so that a change of provider or model is a configuration change |

---

## 8. Constraints and policy

### 8.1 Student data is student-owned

Attendance and grades exist so a student can manage themselves. They are never surfaced to faculty, administration, or other students in any form, including anonymised aggregates. This removes any incentive to falsify and any perception of surveillance. It is a product constraint, not a configuration option.

### 8.2 Credential handling

OneTUP requires ERS credentials to import a schedule. It does not store them server-side. The full design, its residual risks, and the migration path to a sanctioned integration are specified in [07-AUTH-ERS.md](07-AUTH-ERS.md). Two constraints are absolute:

- No plaintext or reversibly-encrypted credential store on any server OneTUP controls.
- The student is told, in plain language before entering anything, exactly what happens to the credentials.

### 8.3 Institutional relationship

OneTUP launches as a student project, not an official service, and says so. In parallel, the team pursues:

1. Acknowledgement from the office responsible for ERS, and ideally a sanctioned read-only integration.
2. Confirmation that the product does not conflict with the university acceptable-use policy.

If a sanctioned data path becomes available, the import interface is designed so it can be substituted without changes elsewhere.

### 8.4 Faculty evaluation integrity

OneTUP makes the evaluation form faster to complete. It does not answer it. The system never generates ratings, never pre-fills opinions, and never submits without the student reviewing the exact content. The comment assistant only rewrites the student's own supplied points, and the student edits and approves the result. This distinction is load-bearing: the evaluation exists to give the university real signal about teaching quality, and polluting it would harm the students who come after.

### 8.5 Data quality and crowdsourcing

Commute fares, campus places, and printing prices are crowdsourced and go stale. Every such record carries a `last_verified_at`. Stale records are visibly marked and demoted in ranking. No stale record is presented as current.

---

## 9. Experience constraints

This section states experience constraints only. It deliberately does not specify layout or components.

### 9.1 Interaction principles

- **Mobile-first, genuinely.** The phone is the design target; desktop is the adaptation.
- **One question answered on open.** The first screen answers "what do I need to know today?" Everything else is one interaction deeper.
- **Complete tasks in a single tap where the task is a single decision.** Attendance is the canonical case.
- **Offline is a first-class state**, not an error state. Cached content displays normally with its freshness indicated.
- **Nothing irreversible without confirmation.** Nothing automated without a receipt.

### 9.2 Visual direction

The intended feel: **institutional but warm; dense with information but calm.** TUP crimson (`#A51C30`) used sparingly as the single saturated colour so that it always means something; generous whitespace; glass-style translucency on floating navigation and controls.

As built, two details differ from the original intent and the code is the
authority:

- **Every surface is white**, not white-and-warm-grey. Cards therefore carry a
  hairline border, because a shadow alone is not separation on white and
  disappears in high-contrast mode.
- **Data that is scanned uses tabular figures in SF Pro**, not a monospace face.
  Columns still align; the interface keeps one voice.

There is no dark theme. The design system lives in `apps/web/src/design/`.

### 9.3 Language

- Describe what happened, not what technology produced it. "Your Friday is handled," not "AI generated a study plan."
- The product is never marketed as an AI product. AI features are labelled precisely where they appear, and nowhere else.
- Errors state what went wrong and what to do about it. Empty states invite an action.
- English and Filipino are both first-class. Code-switching is normal input, not an edge case.

---

## 10. Release plan

| Phase | Modules | Gate to proceed |
|---|---|---|
| **V1.0** | M1–M6 | ≥95% import success across ≥50 real students; offline verified; RLS audited |
| **V1.5** | M7, M8 | M8 shipped at least two weeks before an evaluation period |
| **V2.0** | M9, M10 | AI guardrails pass the evaluation suite in [06-AI-SPEC.md](06-AI-SPEC.md) |
| **V3.0** | Social, recap, community library, agentic layer | See [10-FUTURE-ENHANCEMENTS.md](10-FUTURE-ENHANCEMENTS.md) |

Sequencing rationale: V1 is what makes a student open the app every day. V2 is what makes them depend on it. Building V2 first is the standard failure mode — an excellent study tool nobody opens because it does not touch the daily routine.

---

## 11. Risks

| # | Risk | Impact | Likelihood | Response |
|---|---|---|---|---|
| R1 | ERS changes markup and breaks the parser | High | High | Version the parser, monitor success rate, alert on drop, always keep the paste fallback |
| R2 | University objects to automated ERS access | High | Medium | Engage before launch; keep the import interface swappable; paste fallback survives any restriction |
| R3 | Credentials compromised in transit or memory | Severe | Low | No persistence, isolated worker, short-lived process, memory zeroing, no logging of secrets |
| R4 | Free AI tier limits or pricing change | Medium | High | Provider abstraction, aggressive caching, graceful degradation, deterministic features unaffected |
| R5 | Crowdsourced fare and price data goes stale | Medium | High | Mandatory verification dates, staleness demotion, visible flags |
| R6 | Announcement system abused or used to spread false information | Medium | Medium | Verified rep model, confirmation counts, dispute action, moderation queue |
| R7 | Low adoption outside Computer Science | High | Medium | Recruit class representatives across colleges before launch; keep every V1 feature program-agnostic |
| R8 | Single-maintainer bus factor | High | Medium | Document everything, open-source the client, recruit co-maintainers from GDG on Campus |
| R9 | Model generates confidently wrong academic guidance | High | Medium | Retrieval-grounded answers only, source display, refusal path, no model authority over grades or prerequisites |
| R10 | Push notifications unreliable on iOS | Medium | High | Communicate the install requirement during onboarding; in-app catch-up covers missed prompts |

---

## 12. Open questions

| # | Question | Needed by | Owner |
|---|---|---|---|
| Q1 | What is the university-wide default allowed-absence rule, and does it vary by college? | M2 build | Product |
| Q2 | Is there an existing official campus location dataset, or is seeding entirely manual? | M7 build | Product |
| Q3 | What is the exact current faculty evaluation instrument — question count and wording? | M8 build | Product |
| Q4 | Does the acceptable-use policy address automated portal access explicitly? | Before launch | Product |
| Q5 | Can the TUPniverse tour be licensed for embedding, and is the hosting account stable? | M7 build | Product |
| Q6 | Are grades exposed in ERS in a parseable form, or is manual entry the only path? | M3 build | Engineering |

---

## 13. Glossary

| Term | Meaning |
|---|---|
| **ERS** | Enrollment and Records System — TUP's student portal, at `ers.tup.edu.ph/aims/students/` |
| **AIMS** | The application behind ERS |
| **GWA** | General Weighted Average, the Philippine unit-weighted grade average |
| **TUP grading scale** | 1.00 (highest) to 5.00 (failing); 3.00 is the passing threshold |
| **Class representative** | The student designated to relay announcements for a section |
| **Cut** | An absence |
| **Tambayan** | An informal hangout spot on campus |
| **Walang pasok** | No classes; a suspension |
| **Section** | A cohort of students taking the same subjects together |
| **Study pack** | A generated bundle of summary, concepts, flashcards, and practice questions for one source document |
| **Departure plan** | The computed wake, leave, and arrive times for a given class day |
