# Contributing to OneTUP

Thanks for being here. OneTUP is built by TUP students around a full load of
subjects, which means two things: every contribution genuinely matters, and
nobody expects you to already know how any of this works.

This guide is long because it is meant to be complete, not because the process
is heavy. **If you have never contributed to an open-source project before,
read [First contribution](#first-contribution) and skip the rest until you need
it.**

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [First contribution](#first-contribution)
- [Ways to contribute](#ways-to-contribute)
- [Setting up your machine](#setting-up-your-machine)
- [The development loop](#the-development-loop)
- [Repository layout](#repository-layout)
- [Branches and commits](#branches-and-commits)
- [Opening a pull request](#opening-a-pull-request)
- [Coding standards](#coding-standards)
- [Non-negotiable constraints](#non-negotiable-constraints)
- [Working with the database](#working-with-the-database)
- [Design system rules](#design-system-rules)
- [Testing](#testing)
- [Getting help](#getting-help)

---

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Short
version: this is a project by students, for students. Be decent, assume good
faith, and take disagreements to the technical merits.

---

## First contribution

Four steps. That is the whole thing.

### 1. Find something that annoys you

The best first contribution is a thing you personally hit — a wrong room code,
a route that takes you the long way, a button that lies about what it does,
a sentence that reads badly. Issues labelled
[`good first issue`](https://github.com/kienserapio/OneTUP/labels/good%20first%20issue)
are scoped so that they can be finished in an evening.

### 2. Open an issue before you open a pull request

Say what you want to change and why. It takes five minutes and it saves you
writing something that was already being written by someone else. For a typo or
a one-line copy fix, skip straight to the pull request.

### 3. Fork it, branch it, break it locally

```sh
gh repo fork kienserapio/OneTUP --clone   # or fork in the UI, then git clone
cd OneTUP
pnpm install
cp .env.example .env
git switch -c fix/room-code-on-today
```

Nothing you do locally can affect anyone else. Break things freely.

### 4. Send the pull request

Small and finished beats large and nearly. Describe what changed and what you
checked. Your name lands on the
[contributors page](https://github.com/kienserapio/OneTUP/blob/main/apps/web/src/app/contributors/page.tsx)
when it merges.

---

## Ways to contribute

You do not have to write TypeScript to be useful here.

| Contribution | What it looks like | Where to start |
| --- | --- | --- |
| **Bug reports** | A clear reproduction, your device and browser, what you expected | [New issue](https://github.com/kienserapio/OneTUP/issues/new/choose) |
| **Campus data** | Correct room codes, building names, a jeepney fare that changed | `packages/core` fixtures and the campus scenes |
| **Copy and translation** | Clearer English, Filipino strings, plainer error messages | `docs/08-LANDING-CONTENT.md`, component copy |
| **Design** | Screens that feel wrong, accessibility problems, motion that jars | `apps/web/src/design/` |
| **Documentation** | Anything in this guide that confused you | `docs/`, this file |
| **Code** | Features, fixes, tests, performance | See below |

---

## Setting up your machine

### Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| **Node.js** | 22 or newer | `node --version` |
| **pnpm** | 11 or newer | `corepack enable && corepack prepare pnpm@11 --activate` |
| **Git** | any recent | |
| **Docker** | optional | Only for `pnpm db:types` |
| **A Supabase project** | optional | Only if you touch data; the UI runs without one |

### Install

```sh
git clone https://github.com/<your-username>/OneTUP.git
cd OneTUP
pnpm install
cp .env.example .env
```

Open `.env` and fill in what you have. Every value is documented inline in
`.env.example`. `pnpm dev` derives `apps/web/.env.local` and `apps/worker/.env`
from it — never edit those two by hand, they are overwritten on every run.

### Database (only if you need one)

Create a free project at [supabase.com](https://supabase.com), copy the URL and
keys into `.env`, then:

```sh
pnpm db:push      # applies every migration in order
pnpm db:check     # RLS coverage, policies, view safety
```

`pnpm db:check` is the same gate CI runs. If it fails on your branch, the
migration is wrong — see [Working with the database](#working-with-the-database).

---

## The development loop

```sh
pnpm dev          # web app on http://localhost:3000
pnpm worker:dev   # optional, second terminal, port 8787 — only for ERS import
```

Then create an account at `/sign-up` and paste a schedule. The **paste
importer needs no credentials and no worker**, which makes it the fastest way
to get real data on screen.

Before you push:

```sh
pnpm typecheck    # every workspace
pnpm test         # 335 unit tests, ~17s
pnpm lint
```

All three run in CI on every pull request. Running them locally first saves a
round trip.

---

## Repository layout

```
apps/web          Next.js 16 App Router PWA — the product
  src/app         Routes. (app) is the authenticated shell, the rest is public
  src/components  Feature components, grouped by module
  src/design      Tokens, type scale, materials, motion — the design system
  src/lib         Queries, offline layer, AI provider, import pipeline
apps/worker       Playwright container that reads a schedule from ERS, once
packages/core     Pure domain logic: parsers, GWA, attendance, fares, departure
packages/shared   Types and helpers shared across apps
supabase/         Migrations (RLS in the same file as every table) and RLS tests
scripts/          Migration runner, schema safeguards, env derivation
docs/             The full specification — start at docs/00-INDEX.md
```

`packages/core` has **no dependencies and no side effects**. Every number a
student acts on is computed there and tested there. If you are adding a
calculation — a fare, a cut count, a weighted average, a departure time — it
belongs in `packages/core`, not in a component.

---

## Branches and commits

### Branch names

Name the branch for the thing it does:

```
feat/grades-import-preview
fix/tab-bar-safe-area
docs/contributing-guide
chore/bump-next
```

### Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/). The
subject line is imperative, lowercase, and under 72 characters.

```
feat(commute): show fare breakdown per leg
fix(today): keep attendance prompt after a late import
docs: explain the paste importer in the readme
test(core): cover the 1.0 GWA boundary
refactor(web): fold the two nav components into one source
chore(deps): bump next to 16.3.0
```

Types in use: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

Write the body when the *why* is not obvious from the subject. Explain the
reasoning, not the diff — the diff is already in the commit.

---

## Opening a pull request

1. Push your branch to your fork.
2. Open the PR against `main`.
3. Fill in the template. It asks what changed, why, and what you checked.
4. Link the issue it closes: `Closes #42`.
5. Wait for CI. Green means typecheck, tests, build, and the schema safeguards
   all passed.

**What makes a pull request easy to merge**

- One concern per PR. A fix and a refactor in the same branch is two reviews.
- Tests for anything in `packages/core`. A number without a test is a guess.
- Screenshots or a screen recording for anything visual, on both a phone width
  and a desktop width.
- No unrelated formatting churn. If your editor reformats a file you did not
  touch, revert that file.
- No new dependency without a sentence explaining why the platform cannot do it.

Review is friendly but direct. Comments are about the code. If a review
comment does not make sense, say so — half the time the reviewer was wrong and
the other half the code needed a comment explaining itself.

---

## Coding standards

**TypeScript, strict.** No `any` that could have been a type. `unknown` plus a
narrow is fine; a cast that silences the compiler is not.

**Comments explain why.** The code already says what it does. A comment earns
its place by recording a decision, a constraint, or a trap — the reasoning that
would otherwise be lost.

**Server Components by default.** Add `'use client'` only when the component
needs state, an effect, or an event handler. A page that renders on the server
is a page that works on a bad connection.

**Errors are handled where they can be answered.** A caught exception that logs
and continues is only correct if continuing is correct.

**No dead code, no commented-out blocks.** Git remembers.

**Format with Prettier.** `npx prettier --write` on what you touched.

---

## Non-negotiable constraints

These are not style preferences. Each one is load-bearing, and each has a
document behind it. A pull request that breaks one will be turned down no
matter how good the rest of it is.

**ERS credentials are never persisted server-side.** No migration may add a
column that could hold one — `pnpm db:check` fails the build if one appears.
The worker holds no database credentials and writes nothing to disk.
→ [docs/07-AUTH-ERS.md](docs/07-AUTH-ERS.md)

**RLS is the authorisation model.** Not application code. Every user-owned
table has policies written in the same migration that creates it, every view
carries `security_invoker = true`, and there is no administrative override for
a student's grades or attendance.
→ [docs/04-DATA-MODEL.md §17](docs/04-DATA-MODEL.md)

**Numbers are computed, never generated.** A model may phrase a GWA and may
interpret an unstructured announcement. It may not produce a grade, a cut
count, a fare, or a date.
→ [ADR-007 in docs/02-ARD.md](docs/02-ARD.md)

**Attendance and grades are visible only to the owning student.** No
aggregates, no comparisons, no faculty visibility — not as a setting, but as an
absence of any query path that could return them.

**Offline is a first-class state.** IndexedDB is the primary read source;
Supabase is the sync target. Writes queue and reconcile. A student in a
corridor with no signal still sees their next class.

**The paste importer must never be removed.** It is the floor beneath ERS
import: no credentials, no portal dependency, always available.

---

## Working with the database

Migrations live in `supabase/migrations/`, numbered and applied in order. They
are append-only — never edit a migration that has been pushed; write a new one.

```sh
pnpm db:status    # applied vs pending
pnpm db:push      # applies pending migrations, each in one transaction
pnpm db:check     # the schema safeguards from the data model doc §17
pnpm db:types     # regenerates packages/core/src/database.types.ts (needs Docker)
pnpm db:psql      # an interactive shell against the project
```

Every new table needs, **in the same migration file**:

1. The table.
2. `alter table … enable row level security;`
3. Policies for every operation the app performs.
4. An index for every column the app filters on.

`pnpm db:check` fails if a table has RLS but no policy, a view is missing
`security_invoker`, or a column name looks like a credential store. That check
is a build gate, not a linter.

---

## Design system rules

`apps/web/src/design/` holds the tokens, type scale, materials, and motion
primitives. **Nothing outside it hardcodes a colour, radius, shadow, font size,
or duration.**

- **Light only, and white.** No dark theme, no `prefers-color-scheme` rules.
  Cards separate with a hairline border, not a tonal step.
- **One saturated colour.** TUP crimson `#A51C30` — the active destination, the
  primary action, the assistant. Status uses the Apple system palette.
- **One typeface.** SF Pro via `-apple-system` and `local()`, falling back to
  Inter. Scanned data uses tabular figures, not a monospace face.
- **Springs, not CSS transitions,** for anything a finger touches — a
  transition cannot be grabbed and reversed mid-flight. Use `transition()` from
  `design/motion.ts`, which resolves against the reduced-motion preference.
- **Every interactive target is at least 44px.** `var(--target-min)`.
- **Respect `prefers-reduced-motion`.** The reveal keeps its fade and drops its
  travel; decorative animation does not render at all.

---

## Testing

```sh
pnpm test          # everything
pnpm test:watch    # while you work
```

- **`packages/core` is the tested layer.** Pure functions, no mocks needed. Any
  new calculation ships with tests for the boundary cases — the 1.00, the
  zero-unit subject, the term with a dropped course.
- **The RLS suite** in `supabase/tests/` skips itself without credentials, so
  the suite stays green on a fresh clone.
- **Fixtures over invention.** If you are parsing an ERS page or a pasted
  schedule, add the real (anonymised) sample to the fixtures.

Never commit a real student's data, name, ID number, or grades as a fixture.
Anonymise it first.

---

## Getting help

- **Something is broken** → [open an issue](https://github.com/kienserapio/OneTUP/issues/new/choose)
- **Something is unclear** → open a discussion, or ask in the issue you are working on
- **You found a security problem** → do **not** open an issue; read [SECURITY.md](SECURITY.md)
- **You want to understand the system** → [docs/00-INDEX.md](docs/00-INDEX.md) has a
  reading order for builders, evaluators, designers, and auditors

Questions are not an imposition. A question that leads to a better README is
itself a contribution.
