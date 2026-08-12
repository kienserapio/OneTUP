# Operations

Runbooks for the things that are done rarely and have to be done right.

## Moving the project to another region

The database lives in whichever region the Supabase project was created in, and
that cannot be changed in place. Moving means creating a new project and
replaying the migrations — which is cheap now and painful once real students
have rows.

**Latency matters here.** From Manila, Singapore (`ap-southeast-1`) is roughly
half the round trip of Sydney (`ap-southeast-2`), and every screen in this app
does at least one query.

1. In the Supabase dashboard, create a new project in **Southeast Asia
   (Singapore)**. Note the project ref, the publishable key, the service-role
   key and the database password.
2. Replace those four values in the repo-root `.env`. Delete
   `SUPABASE_POOLER_HOST` so the runner re-probes for the new region.
3. Replay everything:

   ```sh
   pnpm db:push      # applies all migrations in order
   pnpm db:check     # RLS coverage, policies, view safety, no credential columns
   pnpm db:types     # regenerates packages/core/src/database.types.ts
   pnpm run env:sync          # rewrites apps/web/.env.local
   ```

4. Re-run the RLS suite against the new project: `pnpm test`.

Nothing else changes. The migrations are the whole schema, including the seed,
so the new project comes up identical.

## Setting up the GitHub repository

Done once, and worth doing in this order.

1. **Secrets.** Settings → Secrets and variables → Actions. Add
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_CONNECTION_STRING`, and optionally `SUPABASE_POOLER_HOST`.
   **Until these exist the `schema` job skips itself**, which means the RLS and
   credential-column safeguards are not running on any push.
2. **Branch ruleset.** Settings → Rules → New branch ruleset, targeting the
   default branch, with **Repository admin** in the bypass list.

   | Rule | Setting |
   |---|---|
   | Restrict deletions, block force pushes, require linear history | on |
   | Require a pull request | 0 approvals, dismiss stale approvals, require conversation resolution, squash only |
   | Require status checks | `check` only, branches up to date before merging |

   Do not require `schema`. It skips on fork pull requests by design, and a
   required check that never reports blocks the merge button permanently.
3. **Tag ruleset.** Same place, targeting `v*`: restrict deletions and updates.
   A published version tag must not move.
4. **Code security.** Enable Dependabot alerts, secret scanning, and **push
   protection** — free on a public repository, and push protection is what
   stops a service-role key being committed.
5. **Pull requests.** Allow squash only; tick "Automatically delete head
   branches".

## Rotating the worker secret

Quarterly, and immediately if a worker compromise is suspected.

1. `openssl rand -hex 32`
2. Replace `WORKER_SECRET` in `.env`, run `pnpm run env:sync`.
3. Redeploy the worker, then the web app. In that order — the worker rejecting
   an old secret for a few seconds is a failed import; the reverse is an outage.

## Dispatching notifications

`POST /api/notifications/dispatch` with `Authorization: Bearer $WORKER_SECRET`,
every minute or two. Nothing fires without it: nobody is signed in at 4:55 AM
when a wake alarm is due.

## When imports start failing

Check in this order.

1. **The login form's field names.** They are in `SCRAPER_CONFIG.selectors` in
   `apps/worker/src/scrape.ts`. `username`, not `studno` — that one has already
   caught us once.
2. **The birthdate format.** The field is a jQuery UI datepicker declared with
   no `dateFormat`, so it uses that library's default, `mm/dd/yy`. An ISO date
   is rejected with the same message a wrong password gives.
3. **The schedule page path and the table selector.** `SCHEDULE_PARSE_FAILED`
   with a successful login means the page moved or `table.dbtable` changed.
4. **Bump `parser_version`** whenever you change any of it. The version is
   recorded on every import, so a regression can be traced to the parser that
   produced it.

Throughout: the paste importer keeps working regardless. It is the floor beneath
all of this and must never be removed.
