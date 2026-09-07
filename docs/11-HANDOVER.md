# OneTUP — Build Handover

**Status:** V1 plus classrooms, built and running locally against live
Supabase. Public on GitHub. Not deployed.
**Repository:** <https://github.com/kienserapio/OneTUP> — public, MIT
**Date:** August 2026

This document covers what exists, what does not, what will bite you, and what
is waiting on a decision. The specification set (`00`–`10`) describes what
OneTUP *should* be; this describes what it *is*.

---

## 1. Current state

| | |
|---|---|
| Migrations applied | 35 (`001`–`035`) |
| Tests | 435 passing, 18 files — 375 domain, 12 web, 48 against the live database |
| TypeScript | `tsc --noEmit` clean across the workspace |
| Production build | Clean, 69 route entries — 45 pages, 24 API |
| Schema safeguards | 4/4 passing (`pnpm db:check`) |
| Repository | Public, MIT, CI green on `main` |
| Deployed | No |

Verified by hand in a browser, not only compiled: sign-up, onboarding,
schedule paste and parse, ERS import, one-tap attendance through the offline
queue to a server row, commute route comparison, campus tour, the whole
classroom flow across two accounts (create, invite, request, approve, post,
mark submitted, leave), and every screen at 414px and 1440px.

---

## 2. What is built

### Domain logic — `packages/core`

Pure functions, no I/O, 375 tests. This is where every number comes from.

| Module | Covers |
|---|---|
| `schedule/parse` | ERS schedule text into blocks. Day codes matched longest-first so `TH` never reads as Tuesday |
| `grades/gwa` | Inverted 1.00–5.00 scale, weighted GWA, `planWhatIf` with verdicts |
| `attendance/arithmetic` | 3 absences allowed, 3 lates to an absence, partial lates never round up |
| `deadlines/urgency` | Urgency bands, recomputed per render, never stored |
| `commute/departure` | Bounded 3-pass wake/leave solver with a templated explanation |
| `commute/fares` | Fares as rules, not stored figures |
| `study/sm2` | Spaced repetition scheduling |
| `text/simhash` | Near-duplicate announcement detection |
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
Faculty evaluations.
More: Ask OneTUP, Campus, Settings.
Public: landing, campus (map and 360° tour, one page), contributors, docs,
report a problem, sign-in/up, reset, privacy, terms, offline.

All eight app screens carry the same dashboard density: a figure strip up top,
two columns above 1024px, one below.

Added since the first handover:

| Area | What landed |
|---|---|
| Grades | ERS grade import — parser in core, a preview screen, and a commit step that writes only what the student confirms |
| Reports | `/report` and `/api/reports`, backed by `problem_reports` (`029`). A wrong room code has somewhere to go that is not a group chat |
| Commute | Directions chat and a route panel; per-leg colours on the map instead of one undifferentiated line |
| Import | Identity verification (`lib/import/verify-identity.ts`) — a pasted schedule belonging to someone else is caught before it is written |
| Landing | Rebuilt: one hero wordmark, a data bento, reveal primitives, the campus section merged into the tour page, nav and header collapsed into `site-nav` |
| Public pages | `/contributors` and `/docs` |

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
pnpm db:types     # regenerate database.types.ts
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

`023` is the one to read before touching privileges. It is load-bearing for a
published privacy commitment.

---

## 6. What is not built

- **Study packs (M9).** Spaced repetition logic exists in core and is tested;
  nothing surfaces it.
- **Grounded knowledge-base retrieval** for Ask OneTUP.
- **Faculty evaluation submission.** The form is built; there is no open
  evaluation period in ERS to test against.
- **Deployment.** No hosting, no domain, no CI deploy step.
- **Push notifications**, classroom ones included. The whole stack exists —
  service worker, subscriptions, dispatch route — and nothing calls dispatch on
  a schedule. That is a cron entry, not a feature (12-CLASSROOMS-PLAN.md §13).
- **Classroom term rollover.** A classroom can be archived; *Start next term's
  classroom* is not built (Phase 6).
- **Real commute geometry.** No leg has a traced path. The map draws dashed
  lines between real stops and says so. Do not replace those with generated
  paths — a straight line presented as a route is a wrong answer about a real
  city.

---

## 7. Waiting on the owner

Ordered by how much it costs to leave undone.

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
   any push. Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
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
| How data flows offline | `src/lib/offline/sync.ts` |
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
