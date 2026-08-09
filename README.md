# OneTUP

One app for a TUP Manila student's academic life: schedule, attendance, grades,
deadlines, announcements and the commute. Free, offline-capable, and installable
as a PWA.

The full specification lives in [`docs/`](docs/00-INDEX.md). This file covers
how to run and deploy what is in the repository.

## Layout

```
apps/web        Next.js 16 App Router PWA — the product
apps/worker     Playwright container that reads a schedule from ERS, once
packages/core   Pure domain logic: parsers, GWA, attendance, fares, departure
supabase/       Migrations (RLS in the same file as every table) and RLS tests
scripts/        Migration runner, schema safeguards, env derivation
```

`packages/core` has no dependencies and no side effects. Every number a student
acts on is computed there and tested there, which is what makes ADR-007 —
*models interpret, they do not compute* — a checkable claim rather than a
promise.

## Running it

Day to day, once the repo is set up, this is the whole thing:

```sh
pnpm dev
```

That derives the per-app env files from the root `.env` and starts the web app
on http://localhost:3000 — or the next free port, which Next prints on startup.

First time on a machine:

```sh
pnpm install
cp .env.example .env      # fill in Supabase and OpenRouter
pnpm db:push              # applies every migration in order
pnpm db:check             # RLS coverage, policies, view safety
pnpm dev
```

Then open the app, create an account at `/sign-up`, and paste a schedule — the
paste importer needs no credentials and no worker.

The sync worker is separate, and only needed to import from ERS directly:

```sh
pnpm worker:dev           # a second terminal, port 8787
```

Signing up sends a verification email. Until the Supabase project has SMTP
configured, confirm the address from the Supabase dashboard under
**Authentication → Users**, or create the account there with *Auto Confirm*.

`pnpm test` runs the suite. `pnpm db:status` shows which migrations have been
applied.

### Database access

Supabase's direct host (`db.<ref>.supabase.co`) is IPv6-only. Most machines and
CI runners have no IPv6 route, so `scripts/db.mjs` connects through the IPv4
session pooler and probes for the right region. Pin it in `.env` if the probe is
slow:

```
SUPABASE_POOLER_HOST=aws-0-ap-southeast-1.pooler.supabase.com
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the web app |
| `pnpm build` | Production build |
| `pnpm test` | Unit tests; the RLS suite skips itself without credentials |
| `pnpm typecheck` | Every workspace |
| `pnpm db:push` | Applies pending migrations, each in one transaction |
| `pnpm db:status` | Applied vs pending |
| `pnpm db:check` | The schema safeguards from the data model doc §17 |
| `pnpm db:types` | Regenerates `packages/core/src/database.types.ts` (needs Docker) |
| `pnpm db:psql` | An interactive shell against the project |

## The constraints worth knowing before you change anything

These are not style preferences. Each one is load-bearing, and the reasoning is
in the docs.

**ERS credentials are never persisted server-side.** No migration may add a
column that could hold one — `pnpm db:check` fails the build if one appears. The
worker holds no database credentials and writes nothing to disk. See
[07-AUTH-ERS.md](docs/07-AUTH-ERS.md).

**RLS is the authorisation model.** Not application code. Every user-owned table
has policies written in the same migration that creates it, every view carries
`security_invoker = true`, and there is no administrative override for a
student's grades or attendance. See [04-DATA-MODEL.md §17](docs/04-DATA-MODEL.md).

**Numbers are computed, never generated.** A model may phrase a GWA and may
interpret an unstructured announcement. It may not produce a grade, a cut count,
a fare or a date. See [ADR-007](docs/02-ARD.md).

**Attendance and grades are visible only to the owning student.** No aggregates,
no comparisons, no faculty visibility — not as a setting, but as an absence of
any query path that could return them.

**Offline is a first-class state.** IndexedDB is the primary read source;
Supabase is the sync target. Writes queue and reconcile. A student in a corridor
with no signal still sees their next class.

**The paste importer must never be removed.** It is the floor beneath ERS
import: no credentials, no portal dependency, always available.

## Design system

`apps/web/src/design/` holds the tokens, type scale, materials and motion
primitives. Nothing outside it should hardcode a colour, radius, shadow, font
size or duration.

**Light only, and white.** There is no dark theme and no `prefers-color-scheme`
rule anywhere; `color-scheme: light` keeps a device set to dark from darkening
form controls anyway. Every surface is `#FFFFFF`, which removes the tonal step a
grouped background normally uses to separate a card from the page — so cards
carry a hairline border instead. A shadow alone is not separation on white, and
it disappears entirely in high-contrast mode.

**One saturated colour.** TUP crimson `#A51C30`, used for the active
destination, the primary action, and the assistant. It measures about 7.4:1 on
white, so it is safe as a foreground and not only as a fill. Status uses the
Apple system palette — green, yellow, orange, red — because those already mean
those things on a student's phone.

**One typeface, numbers included.** SF Pro is referenced through
`-apple-system` and `local()` rather than shipped: Apple licenses it for
interfaces on Apple platforms, not as a self-hosted webfont. Apple devices get
the real thing; everything else falls back to Inter, which is metric-compatible
enough that the layout does not shift. Data that is scanned — times, rooms,
course codes, fares, grades — uses tabular figures rather than a monospace face,
so columns still align without a second typeface in the interface.

**Motion uses springs, not CSS transitions**, for anything a finger touches: a
transition cannot be grabbed and reversed mid-flight. `transition()` in
`design/motion.ts` resolves a spring against the student's reduced-motion
preference, and the animated grid behind the landing hero does not render at all
when that preference is set.

### The shell

A 244px sidebar above 900px, a floating bar below — the same navigation rendered
two ways rather than two navigations. Both read from `components/app/nav-items`,
so they cannot disagree about what exists or what is selected. Below the
breakpoint only five destinations reach the bar; everything else is one tap
deeper from Today, because a bar with nine destinations is a menu.

## Deploying

**Web app** — Vercel. Set the same variables `pnpm run env:sync` derives into
`apps/web/.env.local`. `NEXT_PUBLIC_*` reach the browser; nothing else may.

**Worker** — any container host:

```sh
docker build -f apps/worker/Dockerfile -t onetup-worker .
```

It needs `WORKER_SECRET` and nothing else. Rotate that secret quarterly.

**Notification dispatch** — `POST /api/notifications/dispatch` with
`Authorization: Bearer $WORKER_SECRET`, on a schedule of a minute or two. This
is what actually fires a wake alarm, because nobody is signed in at 4:55 AM.

## Status

V1 modules — schedule, attendance, grades, deadlines, announcements, commute —
are implemented. Faculty evaluation (M8) and study packs (M9) are specified in
the docs and not yet built. See
[09-IMPLEMENTATION-PLAN.md](docs/09-IMPLEMENTATION-PLAN.md) for the sequencing
and the exit criteria each phase has to meet.

OneTUP is a student project, not an official TUP service.
