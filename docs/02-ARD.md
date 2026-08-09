# OneTUP — Architecture & Decision Records

**Version 1.0 · August 2026**

---

## 1. Architectural goals

Ranked. When two conflict, the higher one wins.

1. **Zero marginal cost per student.** Everything must fit inside free tiers at V1 scale.
2. **No server-side credential store.** This constrains the entire auth design.
3. **Offline-capable for daily-use data.** A student in a concrete corridor still sees their next class.
4. **Provider-swappable AI.** No business logic depends on a specific model or vendor.
5. **Data ownership enforced at the database layer**, not in application code.
6. **A single maintainer can operate it.** Boring, managed infrastructure over clever self-hosting.

---

## 2. System context

```
                          ┌────────────────────────┐
                          │       Students         │
                          └───────────┬────────────┘
                                      │
                      ┌───────────────▼───────────────┐
                      │   OneTUP PWA  (Next.js)       │
                      │   local-first, offline shell  │
                      └───┬──────────┬─────────┬──────┘
                          │          │         │
              ┌───────────▼──┐  ┌────▼─────┐  ┌▼─────────────┐
              │  Supabase    │  │  Sync    │  │  Map tiles   │
              │  Postgres    │  │  Worker  │  │  (OSM/Carto) │
              │  Auth        │  │(container)│ └──────────────┘
              │  Storage     │  └────┬─────┘
              │  Edge Funcs  │       │
              └───┬──────────┘       │ transient credentials
                  │                  │ (never persisted)
                  │                  ▼
                  │            ┌───────────┐
                  │            │ ERS/AIMS  │
                  │            │ (TUP)     │
                  │            └───────────┘
                  │
       ┌──────────▼───────────┐      ┌──────────────────┐
       │  AI Gateway (Edge)   ├─────►│   OpenRouter     │
       │  routing, caching,   │      │   free models    │
       │  redaction, limits   │      └──────────────────┘
       └──────────────────────┘
                  │
       ┌──────────▼───────────┐
       │  TUP Data API        │  public, read-only, non-personal
       │  curriculum, campus  │  (see 05-API-SPEC.md)
       └──────────────────────┘
```

**Trust boundaries.** Three matter:

- **Client ↔ Supabase.** The client is untrusted. All authorisation is enforced by row-level security in Postgres, never by client code.
- **Client ↔ Sync Worker.** Credentials cross this boundary transiently. The worker is isolated, stateless, and logs nothing sensitive.
- **Edge ↔ AI provider.** Personal data is redacted before crossing. Provider keys never cross toward the client.

---

## 3. Component responsibilities

| Component | Owns | Explicitly does not |
|---|---|---|
| **PWA client** | Rendering, local cache, offline queue, service worker, share-target intake | Authorisation decisions, secrets, direct AI calls |
| **Supabase Postgres** | System of record, RLS, computed views, referential integrity | Long-running jobs, browser automation |
| **Supabase Auth** | Identity, sessions, JWT issuance | ERS credentials |
| **Edge Functions** | AI gateway, announcement processing, notification dispatch, webhooks | Browser automation, credential storage |
| **Sync Worker** | Headless-browser ERS scraping, parsing, normalising | Persisting anything at all |
| **TUP Data API** | Curriculum, prerequisites, catalog, campus geometry, calendar | Personal data of any kind |

The Sync Worker is a separate deployable specifically because it needs a browser runtime, has a different scaling profile, and touches credentials. Isolating it means the blast radius of a compromise is one stateless container with no database access.

---

## 4. Data flow — the four that matter

### 4.1 Schedule import

```
Student → PWA: student number, ERS password, birthdate
PWA → Sync Worker (TLS, one-shot POST)
Sync Worker: launch headless browser → authenticate → fetch schedule page
Sync Worker: parse .dbtable → normalise → zero credential buffers → terminate session
Sync Worker → PWA: structured schedule JSON (no credentials echoed)
PWA → Student: review screen, editable
Student confirms → PWA → Supabase: write schedule_blocks (RLS-scoped)
PWA → IndexedDB: cache for offline
```

Credentials exist in three places, all transient: the client form field, the TLS request body, and the worker's process memory. They are never written to disk or database at any point. Full detail in [07-AUTH-ERS.md](07-AUTH-ERS.md).

### 4.2 Announcement intake

```
Student shares text/image → PWA share-target endpoint
PWA → Edge Function: raw content + submitter identity
Edge: hash content → check for existing near-duplicate
Edge → AI Gateway: extract {course, type, date, detail} as strict JSON
Edge: validate extraction against the student's actual enrollments
Edge → Student: proposed announcement for confirmation
Student confirms → Supabase: insert, fan out to section
```

Extraction is proposed, never auto-published. Validation against real enrollments prevents a model hallucinating a course code that does not exist.

### 4.3 Departure plan

```
Trigger: nightly cron, or schedule change, or route change
Edge Function:
  read first class of next class day
  read saved commute route → base duration
  apply peak penalty if departure window intersects a peak band
  apply weather penalty if precipitation probability over threshold
  arrive_by   = class_start − arrive_early_buffer
  leave_at    = arrive_by − adjusted_duration
  wake_at     = leave_at − preparation_time
  build a plain-language explanation of every applied adjustment
Write departure_plans, schedule notifications
```

Entirely deterministic. No model involvement. The explanation is templated from the applied adjustments, not generated.

### 4.4 Assistant query

```
Student question → Edge AI Gateway
Gateway: classify intent → route
  own_data     → SQL over the student's rows → template the answer (no model for the numbers)
  tup_knowledge→ vector search over curated corpus → grounded generation with citations
  commute      → query route DB → render map + template
  general      → generic model call, labelled
Gateway: redact identifiers before any provider call
Gateway: log the run to ai_runs
Response → PWA, visually marked as generated where a model was involved
```

The critical property: **numbers are computed, not generated.** A model never produces a GWA, a cut count, or a fare.

---

## 5. Architecture Decision Records

### ADR-001 — Next.js PWA rather than native or React Native

**Status:** Accepted

**Context.** Target users install almost nothing and have limited device storage. The product must be free to distribute and instant to update. The team is one person.

**Decision.** Build a single Next.js application delivered as an installable PWA.

**Consequences.** No app-store friction, no review delays, one codebase, instant updates. Cost: iOS push requires home-screen installation, which must be handled in onboarding; certain native capabilities are unavailable. Both are acceptable for V1, since no V1 requirement depends on native-only APIs.

**Rejected.** React Native — two build targets and store review for a solo maintainer. Native — cost prohibitive.

---

### ADR-002 — Supabase as backend platform

**Status:** Accepted

**Context.** Needs Postgres, auth, file storage, serverless functions, and a generous free tier, operable by one person.

**Decision.** Supabase for database, auth, storage, and edge functions.

**Consequences.** RLS gives database-enforced authorisation, which is the strongest available guarantee for the privacy constraint. Postgres gives real relational integrity for a genuinely relational domain. Cost: vendor concentration, and free-tier project pausing on inactivity must be monitored.

**Rejected.** Firebase — the data model is relational and Firestore's security rules are harder to audit than RLS. Self-hosted Postgres — operational burden.

---

### ADR-003 — ERS credentials never persisted server-side

**Status:** Accepted · **Non-negotiable**

**Context.** Frictionless import requires the student's ERS credentials. Storing them would create a database of working credentials for a portal holding enrollment and personal records. Even encrypted, the server must decrypt to use them, so the plaintext and the key coexist.

**Decision.** Credentials are accepted transiently, used once in an isolated stateless worker, and discarded. They are never written to any server-side persistent store. Optional convenience: encrypted at rest **on the student's own device only**, using a key derived from their OneTUP password, never transmitted.

**Consequences.** No credential database exists to be breached. Re-sync requires either a stored device-side credential or re-entry — slightly more friction, dramatically less risk. Residual risk remains: credentials transit our infrastructure and exist in worker memory. This is disclosed to the student and mitigated by isolation, no logging, and memory zeroing.

**Rejected.** Server-side encrypted vault — the decryption key sits beside the ciphertext; a compromise yields everything. Session-cookie storage — same exposure, shorter lifetime, no meaningful improvement.

**Preferred future.** A browser extension that reads the page the student is already authenticated on, so credentials never leave the device at all. The import interface is designed so this can be substituted without changes elsewhere.

---

### ADR-004 — Sync Worker as a separate container

**Status:** Accepted

**Context.** ERS scraping requires a headless browser. This cannot run on Vercel functions or Supabase Edge (Deno). It also handles credentials.

**Decision.** Deploy the scraper as an independent containerised service with a single-purpose HTTP interface.

**Consequences.** Correct runtime for browser automation, and isolation of the highest-risk component. The worker holds no database credentials and no persistent storage, so compromising it yields nothing at rest. Cost: an additional deployment target and cold-start latency of several seconds.

---

### ADR-005 — Local-first client with IndexedDB

**Status:** Accepted

**Context.** Campus connectivity is unreliable. NFR-A1 requires read usability at zero connectivity.

**Decision.** IndexedDB is the client's primary read source. Supabase is the sync target. Writes queue locally and reconcile on reconnect.

**Consequences.** Instant reads, genuine offline capability. Cost: conflict handling. Resolution is last-write-wins per field with a server-authoritative timestamp, which is acceptable because nearly all writes are single-device and single-user. Multi-device conflict on the same field is rare enough to accept.

---

### ADR-006 — OpenRouter as AI provider, abstracted behind a gateway

**Status:** Accepted

**Context.** NFR-$1 requires zero marginal cost. Free model availability, identifiers, and rate limits change frequently.

**Decision.** All model calls pass through an internal AI Gateway that owns model selection, prompt assembly, caching, redaction, rate limiting, and logging. Business code requests a *capability* ("extract an announcement"), never a model.

**Consequences.** Swapping model or vendor is a configuration change. Caching and rate limiting are enforced in one place. Redaction is unavoidable because there is no other path to a provider. Cost: one more hop, a few tens of milliseconds.

---

### ADR-007 — Computed answers, not generated ones, for anything numeric

**Status:** Accepted · **Non-negotiable**

**Context.** Models produce fluent, plausible, wrong numbers. A wrong GWA or cut count could cause a student to make a materially bad decision.

**Decision.** Grades, GWA, absence counts, fares, durations, prerequisites, and dates are always computed from data or retrieved from an authoritative store. Models are permitted to *phrase* a computed result and to *interpret* an unstructured input, never to produce the value.

**Consequences.** Numbers are correct or absent, never invented. Cost: more engineering per feature than a naive "ask the model" approach.

---

### ADR-008 — Announcements are human-submitted, machine-structured

**Status:** Accepted

**Context.** Announcements originate in Messenger group chats. No API exists for reading personal group threads, and the unofficial paths require credentials and capture messages from every member of the group, none of whom consented.

**Decision.** Students share individual announcements into OneTUP via the Web Share Target API, an image, or paste. A model structures the shared content. Nothing is ingested that a student did not deliberately share.

**Consequences.** Legally and ethically clean, since only the deliberately-shared message is processed. Structured extraction is more reliable than parsing raw chat logs. A verified-representative model provides trust signal. Cost: not fully automatic; iOS lacks Share Target support, so paste is the fallback there.

**Rejected.** Messenger bridges and headless-browser automation of Facebook — ToS violation, account ban risk, and third-party consent problems that no technical mitigation addresses.

---

### ADR-009 — Row-level security from the first migration

**Status:** Accepted · **Non-negotiable**

**Context.** Grades and attendance are the most sensitive data in the product. Application-layer authorisation fails open when someone forgets a `where` clause.

**Decision.** Every table containing user data has RLS enabled with explicit policies, written in the same migration that creates the table. No table ships without a policy. A CI check fails the build if any table in the public schema lacks RLS.

**Consequences.** Even a fully compromised client cannot read another student's data. Cost: policies must be written and tested carefully; some queries need `security definer` functions.

---

### ADR-010 — Curated commute graph rather than a routing engine

**Status:** Accepted

**Context.** Metro Manila jeepney and UV Express networks are poorly covered by general routing providers, and no provider has fare data or student discounts.

**Decision.** Model commute as a small curated graph. TUP is always one endpoint, which collapses the problem from general routing to hub-and-spoke lookup. Legs are the atomic unit and carry their own fare, duration, and verification date.

**Consequences.** Correct fares including the student discount — something no general provider offers. Small enough to cache entirely offline. Crowdsourcing is tractable because the graph is bounded. Cost: manual seeding, and ongoing verification pressure.

---

### ADR-011 — Fares stored as rules, not as figures

**Status:** Accepted

**Context.** The 20% public-utility-vehicle student discount is statutory. Base fares change by regulatory action.

**Decision.** Store base fare plus a discount rule reference. Compute the displayed student fare at render time.

**Consequences.** A fare change is one edit that propagates everywhere. Both regular and discounted fares can be shown, which also helps a student notice when a discount is being denied. Cost: a small rule evaluator.

---

### ADR-012 — Public campus data, separate from the app

**Status:** Accepted

**Context.** Campus location data is useful to people with no account — incoming freshmen, visitors, parents on enrollment day. It is also non-personal, so it carries no privacy constraint.

**Decision.** Campus data is served from a public, unauthenticated endpoint and rendered on a standalone public page, independent of the authenticated app.

**Amendment, August 2026.** The map and the 360° tour were built as two screens and are now one. A student looking for a room wants to *see* it, and a flat map that then links to a tour is two answers to a single question. `/campus` is the tour; each building opens on the scene that shows it; room search resolves to a building and offers to walk there. The Leaflet layer was removed from the campus module — it remains only in commute, where a route genuinely is a line on a map.

**Consequences.** Serves the highest-anxiety moment (arriving without knowing anything) with zero friction, and doubles as an acquisition surface. Cost: a separate moderation path for public submissions.

---

### ADR-013 — OpenStreetMap via Leaflet for mapping

**Status:** Accepted

**Context.** Mapping is needed for commute and campus. Commercial providers require keys, billing, and impose quotas.

**Decision.** Leaflet with OpenStreetMap-derived raster tiles.

**Consequences.** No API key, no billing, no quota risk, good Philippine coverage. Attribution is displayed as required by the tile terms. Cost: no built-in routing or geocoding, which is acceptable because ADR-010 makes routing our own data anyway.

---

### ADR-014 — TUP Data API as a distinct, public product

**Status:** Accepted

**Context.** Curriculum, prerequisites, catalog, calendar, and campus geometry are non-personal, useful beyond OneTUP, and are the foundation for every advanced feature (enrollment planning, graduation simulation, conflict detection).

**Decision.** Build these as a standalone public read-only API. OneTUP consumes it as an ordinary client, with no privileged access path.

**Consequences.** Other student projects can build on it, which creates dependents and therefore longevity beyond any one maintainer. It is also a far easier institutional conversation than portal automation — a structured public dataset is something a university can endorse. Constraint: OneTUP must not depend on internals, since it uses the same interface as everyone else.

---

## 6. Cross-cutting concerns

### 6.1 Authorisation model

| Actor | Mechanism |
|---|---|
| Anonymous | Public endpoints only: campus data, TUP Data API |
| Student | Supabase JWT; RLS restricts every row to `auth.uid()` |
| Class representative | Student plus a row in `class_reps` with `status = 'approved'`; grants insert on announcements scoped to that section only |
| Moderator | Role claim; access to moderation queues only, never to student academic data |
| Administrator | Role claim; may publish university-wide announcements and manage reference datasets. **No access to any student's grades or attendance under any role.** |

The last point is enforced in the policies themselves, not by convention. There is no administrative override for personal academic data.

### 6.2 Caching

| Layer | Contents | Invalidation |
|---|---|---|
| Service worker | App shell, static assets | On deploy, by version |
| IndexedDB | Schedule, deadlines, attendance, commute routes, campus places, emergency contacts | On successful sync; TTL per entity |
| Edge cache | TUP Data API responses, campus data | 1 hour, or on write |
| AI response cache | Keyed by hash of normalised input plus prompt version | 30 days, or on prompt version bump |

The AI cache matters disproportionately: identical study material or an identical announcement shared by five students produces one model call, not five. This is the main lever keeping the product inside free tiers.

### 6.3 Observability

- Structured JSON logs, correlation ID per request.
- **Never logged:** credentials, credential-shaped fields, raw grades, raw attendance.
- Metrics: import success rate, parser version failures, AI latency and cache-hit ratio, push delivery rate, offline-queue depth.
- Alerts: import success below 90% over one hour; AI error rate above 10%; any RLS policy violation attempt.

### 6.4 Failure modes and degradation

| Failure | Degradation |
|---|---|
| ERS down | Import and re-sync fail with a clear message; everything else unaffected |
| Parser broken by markup change | Import fails, paste fallback offered automatically, maintainer alerted |
| AI provider down or rate-limited | Generative features show an unavailable state; all deterministic features unaffected |
| Supabase down | Client serves cached data read-only; writes queue |
| Map tiles unavailable | Route legs render as a list; the map area shows an explanatory state |
| Push unavailable | In-app catch-up surfaces anything missed |

Each degradation is a designed state with its own copy, not an unhandled error.

### 6.5 Data retention

| Data | Retention |
|---|---|
| Academic records (schedule, grades, attendance, deadlines) | Until student deletion |
| ERS credentials | Never stored server-side; device-side entries cleared on sign-out |
| AI run logs | 90 days, with personal content redacted at write time |
| Announcement submissions | Until student deletion; published announcements persist for the section |
| Audit log of automated actions | 90 days |
