# OneTUP — Build Handover

**Status:** V1, classrooms, and all eight features of
[16-NEXT-EIGHT.md](16-NEXT-EIGHT.md), built and running locally against live
Supabase. Public on GitHub. Not deployed.
**Repository:** <https://github.com/kienserapio/OneTUP> — public, MIT
**Date:** September 2026

This document covers what exists, what does not, what will bite you, and what
is waiting on a decision. The specification set (`00`–`10`) describes what
OneTUP *should* be; this describes what it *is*.

---

## 1. Current state

| | |
|---|---|
| Migrations applied | 38 (`001`–`038`) |
| Tests | 552 passing, 26 files — 457 domain, 35 web, 9 scripts, 51 against the live database |
| TypeScript | `tsc --noEmit` clean across the workspace |
| Lint | `pnpm lint` clean — 0 errors (it had not run at all since the Next 16 upgrade) |
| Production build | Clean, 74 route entries |
| Schema safeguards | 4/4 passing (`pnpm db:check`) |
| Model ladders | 21 rungs across five tiers, all live (`pnpm check:models`) |
| Repository | Public, MIT |
| Deployed | No |

Verified by hand in a browser against the live project, not only compiled:
sign-in, a study pack generated from pasted notes (five cards, each marked
generated and linked to its source chunk), and three reviews through the
offline queue to real rows — including an "Again" answer resetting the streak,
incrementing lapses, dropping the ease factor and scheduling for tomorrow.

That browser pass found the one bug worth knowing about, now fixed: `flush()`
dropped a concurrent call instead of deferring it, so the **second** of two
writes queued back to back waited up to fifteen minutes. A review is exactly
two such writes, and only the history row was reaching the server.

Verified earlier, and still true: sign-up, onboarding,
schedule paste and parse, ERS import, one-tap attendance through the offline
queue to a server row, commute route comparison, campus tour, the whole
classroom flow across two accounts (create, invite, request, approve, post,
mark submitted, leave), and every screen at 414px and 1440px.

---

## 2. What is built

### Domain logic — `packages/core`

Pure functions, no I/O, 457 tests. This is where every number comes from.

| Module | Covers |
|---|---|
| `schedule/parse` | ERS schedule text into blocks. Day codes matched longest-first so `TH` never reads as Tuesday |
| `grades/gwa` | Inverted 1.00–5.00 scale, weighted GWA, `planWhatIf` with verdicts |
| `attendance/arithmetic` | 3 absences allowed, 3 lates to an absence, partial lates never round up |
| `deadlines/urgency` | Urgency bands, recomputed per render, never stored |
| `commute/departure` | Bounded 3-pass wake/leave solver with a templated explanation |
| `commute/fares` | Fares as rules, not stored figures |
| `study/sm2` | Spaced repetition. `scheduleReview` is the single answer to "when does this card come back" — SM-2 step then deadline compression, called by both the write path and the button preview |
| `study/chunk` | Splitting a document into passages. For provenance, not context windows: a card points at the chunk it came from |
| `text/simhash` | Near-duplicate announcement detection |
| `text/grounding` | `unsupportedNumbers` — every figure in a composed assistant answer must appear in what it was composed from |
| `suspensions/advisory` | Which of several notices about one typhoon reaches the screen. Narrowest scope wins |
| `commute/answer` | Which routes an answer mentions, and when it owes the student a staleness warning |
| `grades/parse-grades` | ERS grade rows into subjects, units and marks, per term |
| `sections/parse` | Block-section codes. One section typed four ways canonicalises to one classroom |
| `classroom/tracker` | The classroom projections. Per post, never across posts — the shapes here cannot express a per-member score |

### Web app — `apps/web`

Next.js 16 App Router, React 19, Tailwind v4.

Daily: Today, Commute (+ wake-up plan, directions chat), Schedule (+ day,
import, re-sync), Deadlines (+ detail, new), Announcements (+ share intake),
Classroom (+ create, join by invite, members, post detail with its submission
log).
Academics: Subjects (+ detail, GWA, grade import, term breakdown, catch-up),
Study (+ new pack, pack detail, review session), Faculty evaluations.
More: Ask OneTUP, Campus, Settings.
Public: landing, campus (map and 360° tour, one page), contributors, docs,
report a problem, sign-in/up, reset, privacy, terms, offline.

Every app screen carries the same dashboard density: a figure strip up top, two
columns above 1024px, one below.

Added since the first handover:

| Area | What landed |
|---|---|
| Grades | ERS grade import — parser in core, a preview screen, and a commit step that writes only what the student confirms |
| Reports | `/report` and `/api/reports`, backed by `problem_reports` (`029`). A wrong room code has somewhere to go that is not a group chat |
| Commute | Directions chat and a route panel; per-leg colours on the map instead of one undifferentiated line |
| Import | Identity verification (`lib/import/verify-identity.ts`) — a pasted schedule belonging to someone else is caught before it is written |
| Landing | Rebuilt: one hero wordmark, a data bento, reveal primitives, the campus section merged into the tour page, nav and header collapsed into `site-nav` |
| Public pages | `/contributors` and `/docs` |

Added by the eight features of `16-NEXT-EIGHT.md`:

| Area | What landed |
|---|---|
| AI | All five model ladders rebuilt against the live list. `pnpm check:models` fails CI on a withdrawn rung, which is what turns a silent tier-of-one into a red build |
| Study | The whole feature. Packs, hand-written cards, a review session whose four buttons each state the interval they will set, and generation from pasted notes. Every generated card is marked and linked to its source chunk |
| Today | Suspension advisories. Three actions, none of which the app decides for the student — see `036` and §8 |
| Assistant | Conversation memory (the router reads the last three exchanges), answers that may use one list, per-route confidence floors, commute answers that know the departure hour, and tool use: two lookups composed, with receipts and a grounding check |
| Commute | `geometry_source`, and `scripts/route-walk-legs.mjs` to fill in walk-leg paths from a public Valhalla instance |
| Lint | `next lint` was removed in Next 16 and the script had been failing since the upgrade. Flat-config ESLint replaces it |

### Sync worker — `apps/worker`

Isolated container that logs into ERS and scrapes the schedule. Holds **no**
Supabase credentials, writes nothing to disk, never logs request bodies.
Proven against the live portal: 5 consecutive runs, 6/6 subjects, zero
unparsed rows.

### Database

Postgres 17. RLS on every table from the first migration. See §5 for the
migrations added after the original schema.

---

## 3. Running it

```bash
pnpm install
pnpm dev          # syncs env, then starts the web app
pnpm build        # core, then web
pnpm test         # domain tests
pnpm db:push      # apply pending migrations
pnpm db:check     # schema safeguards
pnpm db:types     # regenerate database.types.ts (needs Docker and Supabase CLI >= 2.116)
pnpm check:models # diff the AI ladders against OpenRouter's live model list
pnpm route:walk   # fill in walk-leg geometry; --probe and --dry-run first
```

The worker runs separately (`apps/worker`, see its README). **ERS import
returns a clear "worker unreachable" error when it is not running** — that is
a designed state, not a bug.

`.env` at the repo root is the only env file you edit. `scripts/sync-env.mjs`
derives `apps/web/.env.local` and `apps/worker/.env` from it, and deliberately
gives the worker no Supabase credentials.

---

## 4. Things that will bite you

Each of these cost real time to find. They are not obvious from the code.

**`pnpm env` is a pnpm builtin.** A script named `env` is shadowed and never
runs — `pnpm dev` printed pnpm's usage and exited. The script is `env:sync`.
Do not rename it back.

**ERS rejects programmatically filled logins.** `page.fill()` sets `value`
without firing the key events the page listens for, and the failure is
indistinguishable from a wrong password. `scrape.ts` uses `page.type()` with a
delay. Do not "simplify" it.

**Never use a fixed wait to detect ERS auth failure.** It produced false
`ERS_AUTH_FAILED` on correct passwords — which tells a student their password
is wrong *and* burns one of three attempts before lockout. The scraper races
form-detach against the error text appearing.

**RLS is not privileges.** Correct policies with no `GRANT` still yield
"permission denied". Migrations `022`/`023` exist because of this.

**Plain CSS outranks every Tailwind utility.** Rules in `materials.css` are
unlayered; Tailwind utilities live in `@layer utilities`. A `pb-*` class will
lose to `.safe-bottom` silently. Use an inline style when overriding one.

**Scroll snapping overrides any `scrollLeft` you set.** The snap engine pulls
it straight back. Put `scroll-margin` on the snap targets instead.

**A ref cannot wake an effect.** The route map gated its draw on
`map.current`, which Leaflet fills in asynchronously — legs always arrive
first, so it never drew anything. The ready map is state now.

**Return effect cleanups from the effect, not the async IIFE inside it.**
React never receives the latter, and layers accumulate.

**IndexedDB stores are not all keyed on `id`.** `user_preferences` is keyed on
`user_id`. Both the local store (`ALTERNATE_KEY`) and the sync engine
(`primaryKeyOf`) know this; new tables with a natural key must be added to
both.

**Never await a read inside an IndexedDB readwrite transaction.** It
auto-commits before your writes land.

**The dev server can serve stale CSS.** Tailwind output predating new files
made every `lg:` layout collapse to one column and looked exactly like a code
bug. If a responsive layout is inexplicably single-column, restart `next dev`
before debugging the component.

**A spacing token that does not exist collapses to nothing.** `var(--space-14)`
is not defined in `tokens.css`, so four section gaps on the contributors page
computed to `0` and read as a layout bug. The scale is 1–6, 8, 10, 12, 16.
Compose with `calc()` rather than inventing a step.

**`pnpm/action-setup` refuses two version sources.** Declaring `version:` in the
workflow while `packageManager` exists in `package.json` fails the job before
anything installs. `packageManager` is the source of truth; the workflow states
nothing.

**CI's placeholder `.env` looked real to the RLS suite.** The three keys it
checks were all present, so it tried to create accounts against
`ci.supabase.co`. The workflow now writes `SUPABASE_PLACEHOLDER=true` and the
suite treats a marked environment as no environment.

**A flush that drops a concurrent call loses the second of two writes.** The
sync engine reads its mutation queue once per run, so anything enqueued after
that read is invisible to it. A boolean guard that made a concurrent `flush()`
return immediately therefore did not mean "already handled" — it meant "your
write waits up to fifteen minutes". Recording one flashcard review is two
queued writes back to back; only the history row reached the server, and the
student saw it save because locally it had. `single-flight.ts` defers instead
of dropping. Any new pair of back-to-back writes depends on this.

**A paused Supabase project returns NXDOMAIN, not a timeout.** It also
disappears from the management API's project list. Both together read exactly
like a deleted project, and the tests that hit it failed with
`AuthRetryableFetchError: fetch failed` thirty lines into a GoTrue stack trace.
`supabase/tests/env.ts` now names the URL and the likely cause in one line.
Before concluding a project is gone, open the dashboard and look.

**`pnpm db:types` needs Supabase CLI 2.116 or newer.** 2.84 segfaults its
pg-meta container (`exit 139`) with no useful message. The newer CLI also
stopped emitting the `graphql_public` schema — nothing referenced it — and
began typing RPC *arguments* as non-nullable, which broke `commit_schedule`:
`021` declares `p_job_id uuid` and branches on `is not null`, because a paste
import has no job. The generated types cannot express that; the database is
right.

**Storage buckets do not exist until a migration creates them.**
`announcement-images` had been referenced by the share target since it shipped,
and every upload was failing — silently, because that route treats an upload
error as "no image" and carries on. `038` creates both buckets. Their access
rule is a *path prefix*, not a column, so nothing about a bucket looks like RLS
until you read the migration.

**The free model ladder's first rung is often rate-limited.** Free capacity is
shared, and a 429 from the first rung is routine — the ladder exists for it. Any
throwaway script that calls OpenRouter directly must walk the ladder too, or a
healthy app will look broken while you debug the script.

**"JSON-capable" means `response_format`, not `structured_outputs`.** The
provider asks for `{ type: 'json_object' }`. Only three free models advertise
`structured_outputs` — the stricter `json_schema` mode nothing here uses — and
reading that field instead makes a perfectly healthy ladder look one rung deep.

**A zod `.default([])` does not fire on an explicit `null`.** A small free model
that answers correctly and writes `need: null` took a route down until
`.catch([])` was added beside it. The same applies to any field the prompt does
not explicitly ask for: `commute_intent` required a `confidence` its own prompt
never mentioned, so every real call failed validation and burned the gateway's
one repair attempt before anyone noticed.

**GitHub reads the whole `LICENSE` file.** One appended paragraph about
university marks made the repository show "Other" instead of "MIT" — the one
field a visitor checks before forking. `LICENSE` is the unmodified MIT text;
everything else lives in `NOTICE.md`.

---

## 5. Migrations added after the original schema

| # | What and why |
|---|---|
| `020` | Rail fare matrix seed |
| `021` | `commit_schedule` RPC — transactional, `security invoker` |
| `022` | Table privileges. RLS was right but no `GRANT`s existed |
| `023` | **Withholds** grades, attendance and their views from `service_role`, and revokes `v_today`. "No administrative override for academic data" is a database privilege, not a convention |
| `024` | Absence limit 5 → 3 (3 absences is UD) |
| `025` | 11 new campus places, 22 places mapped to tour scenes |
| `026` | Origin hubs for two legs that started from a district with no hub |
| `027` | Deduplicates campus places, unique index on `tour_scene_url` |
| `028` | Seeds past terms so an imported grade history has terms to attach to |
| `029` | `problem_reports` — the table behind `/report`, RLS and policies in the same file |
| `030` | `cancelled` attendance status — a class that did not happen is not an absence and not an excuse |
| `031` | Classrooms. `groups` gains a block-section identity, `group_join_requests`, `is_group_rep`, `decide_join_request` |
| `032` | `class_posts` and `class_post_states`. The submission log, and the trigger that stops it being enabled after publishing |
| `033` | Leaving takes a student's submission marks with it; promote, remove and hand-over as definer functions; the 60-day claim path for a classroom whose owner went quiet |
| `034` | A student can read back their own `group_members` row. `insert … returning` re-checks the select policies, and `is_group_member` is `stable`, so creating a classroom failed for its own owner |
| `035` | `classroom_by_invite` compared an invite code against `terms.code` — a SQL-function parameter shadowed by a column of the same name, silently |
| `036` | Suspension advisories, and `delivery_mode` on `attendance_records`. Read-only reference: everyone selects, only `service_role` writes. Also widens `recorded_via` to allow `suspension` |
| `037` | `geometry_source` on `commute_legs` — a path a router computed and a path a student traced are different kinds of claim, and were indistinguishable |
| `038` | The two storage buckets, neither of which existed. `announcement-images` had been referenced by the share target since it shipped, and every upload through it was failing silently. Both private, both scoped by path prefix to their owner |

`023` is the one to read before touching privileges. It is load-bearing for a
published privacy commitment.

---

## 6. What is not built

- **Grounded knowledge-base retrieval** for Ask OneTUP. `015` built the tables
  and the match function in full and nothing has ever called them. The decision
  (16-NEXT-EIGHT.md §2) is that the assistant grounds on the student's own
  records instead, which is what assistant tool use now does.
- **Faculty evaluation submission.** The form is built; there is no open
  evaluation period in ERS to test against.
- **Deployment.** No hosting, no domain, no CI deploy step.
- **Push notifications**, classroom ones included. The whole stack exists —
  service worker, subscriptions, dispatch route — and nothing calls dispatch on
  a schedule. That is a cron entry, not a feature (12-CLASSROOMS-PLAN.md §13).
- **Classroom term rollover.** A classroom can be archived; *Start next term's
  classroom* is not built (Phase 6).
- **Suspension advisories, Phases 2 and 3.** Phase 1 is built. Phase 2 needs an
  external PAGASA poller; Phase 3 needs push.
- **Commute Phases 2–4.** Transit corridors, the rest of the corridors, and
  fares. Mostly data gathering and per-leg verification with real riders.
- **PDF text extraction** for study pack generation. The bucket accepts a PDF
  and stores it, because storing the original is what makes a card checkable,
  but the text layer is not read — a student is asked to paste instead. Reading
  it badly would produce cards from binary noise.
- **Real commute geometry, mostly.** `scripts/route-walk-legs.mjs` will fill in
  the walk legs, and has not been run against real data yet. Transit corridors
  stay dashed on purpose: a jeepney route is a social fact, not a shortest path,
  and a straight line presented as a route is a wrong answer about a real
  city.

---

## 7. Waiting on the owner

Ordered by how much it costs to leave undone.

0. **Merge `feat/next-eight`.** Everything in this document beyond commit
   `af9ee4c` lives on that branch — the classrooms feature and all eight
   features of `16-NEXT-EIGHT.md`, thirteen commits. `main` does not have them.
   A green build on an unmerged branch is not a shipped project.
1. **TUPniverse permission — now overdue.** `github.com/smnthegr/TUPniverse`
   has no licence and the campus page embeds their tour. The repository is
   already public, so this is no longer a pre-launch item. `NOTICE.md` states
   the panoramas are theirs, carry no licence, and are not covered by MIT;
   attribution is in the UI. Get it in writing anyway.
2. **Consent for the names on `/contributors`.** Five students' full names,
   sections and `tup.edu.ph` addresses are now in a public repository and on a
   public page. The addresses are written out rather than linked, which stops a
   one-click mail client but not a scraper. Confirm all five agreed, and remove
   anyone who did not.
3. **Repository secrets.** The `schema` CI job skips itself without them, so
   the safeguards from `04-DATA-MODEL.md §17` are currently **not** running on
   any push — they pass locally (`pnpm db:check`, 4/4) and nowhere else. Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_CONNECTION_STRING` (and optionally
   `SUPABASE_POOLER_HOST`) under Settings → Secrets → Actions.
4. **Branch ruleset on `main`.** See §10.
5. **Rotate the ERS development password** — see §8.
6. **Supabase region.** If the project is still outside Singapore, the runbook
   is in `OPERATIONS.md`; it is cheap now and painful once real students have
   rows.

Resolved since the first handover: the `workflow` OAuth scope — `ci.yml` pushes
fine, and CI is green on `main`.

---

## 8. Security constraints that must not regress

These are commitments, not preferences. Several are enforced mechanically.

- **ERS credentials are never persisted server-side.** `pnpm db:check` fails
  the build if any column looks like a credential store.
- **The worker holds no Supabase credentials.** `sync-env.mjs` enforces this.
- **`service_role` cannot read grades or attendance** (migration `023`).
- **`sync_jobs.error_detail` is sanitised** before write.
- **Client credential state lives only in component-local `useState`** and is
  cleared on both success and failure paths.
- **Numbers are computed, never generated** (ADR-007). Anything a model
  produces carries a generated marker; anything derived from the student's own
  records says so instead.

**Action item:** the ERS password used during development was shared in plain
text in a working transcript. It is not in the repository — history was
checked — but it should still be rotated.

---

## 9. Where to look first

| Question | File |
|---|---|
| How a screen should look | `src/components/today/today-view.tsx` — the reference for density |
| How data flows offline | `src/lib/offline/sync.ts`, and `single-flight.ts` for why a flush defers rather than drops |
| Why the assistant may never state a number it made up | `packages/core/src/text/grounding.ts` and `src/lib/assistant/compose.ts` |
| What a model is allowed to do, and where the prompts live | `src/lib/ai/capabilities.ts` — one file, every capability |
| How ERS is scraped | `apps/worker/src/scrape.ts` |
| Why the schema is shaped this way | `docs/04-DATA-MODEL.md`, `docs/02-ARD.md` |
| What the numbers mean | `packages/core/src/**` and its tests |
| How to contribute, and what a PR is measured against | `CONTRIBUTING.md` |
| What the licence does not cover | `NOTICE.md` |

---

## 10. The repository as a public project

Public since August 2026 at <https://github.com/kienserapio/OneTUP>, MIT.

### Files a visitor is read through

| File | Purpose |
|---|---|
| `README.md` | What OneTUP is, screenshots, quickstart, architecture, the constraint list |
| `LICENSE` | MIT, unmodified — see §4 on why nothing may be appended to it |
| `NOTICE.md` | What MIT does not cover: TUP marks, TUPniverse panoramas, SF Pro, student data |
| `CONTRIBUTING.md` | First-contribution path, setup, commit convention, standards, the non-negotiable constraints |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1, reported to `kienleriss.serapio@tup.edu.ph` |
| `SECURITY.md` | Private reporting, response targets, scope, safe harbour, and the four security claims a break of which is by definition valid |
| `.github/ISSUE_TEMPLATE/` | Bug and feature forms, each with a constraint checklist |
| `.github/PULL_REQUEST_TEMPLATE.md` | The checklist a PR is reviewed against |
| `.github/dependabot.yml` | Grouped weekly npm, monthly actions and Docker |

### CI

Two jobs in `.github/workflows/ci.yml`, on every push to `main` and every pull
request.

- **`check`** — `pnpm install --frozen-lockfile`, then `typecheck`, `test`,
  `build`, against a placeholder `.env` written by the workflow. Never talks to
  a real project.
- **`schema`** — `node scripts/db.mjs check` against the real project. Skips
  itself with a notice when the Supabase secrets are absent, which is the
  current state on this repository and the permanent state on forks.

### Branch ruleset

Not yet configured. Recommended, on the default branch, with **Repository
admin** in the bypass list so a solo maintainer is not forced through a PR for
a typo:

- Restrict deletions, block force pushes, require linear history
- Require a pull request: **0** approvals, dismiss stale approvals, require
  conversation resolution, squash as the only merge method
- Require status checks: **`check`** only, branches up to date before merging

Do **not** require `schema`. It skips itself on fork pull requests by design,
and a required check that never reports blocks the merge permanently.

### Dependabot

Opened five pull requests within a minute of the first push. Two are majors —
`typescript` 5.9 → 7.0 and `@types/node` 24 → 26 — and need reading, not
merging on green.
