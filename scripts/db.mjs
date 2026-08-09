#!/usr/bin/env node
/**
 * Migration runner and schema-safety checker.
 *
 * Supabase's direct database host (`db.<ref>.supabase.co`) is IPv6-only. Most
 * developer machines and CI runners have no IPv6 route, so everything here goes
 * through the IPv4 session pooler instead. `SUPABASE_POOLER_HOST` overrides the
 * probe if the project ever moves region.
 *
 * Commands:
 *   push    apply pending migrations in filename order, inside a transaction
 *   status  list applied and pending migrations
 *   check   run the schema safeguards from 04-DATA-MODEL.md §17
 *   psql    open an interactive shell against the project
 *   types   regenerate packages/core/src/database.types.ts
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = resolve(root, 'supabase/migrations')

// Regions probed in likelihood order when SUPABASE_POOLER_HOST is unset.
const POOLER_REGIONS = [
  'aws-0-ap-southeast-2',
  'aws-0-ap-southeast-1',
  'aws-1-ap-southeast-1',
  'aws-0-ap-northeast-1',
  'aws-1-ap-southeast-2',
  'aws-0-us-east-1',
  'aws-0-eu-central-1',
]

function loadEnv() {
  const text = readFileSync(resolve(root, '.env'), 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv()

function projectRef() {
  const m = /https?:\/\/([a-z0-9]+)\.supabase\./.exec(env.SUPABASE_URL ?? '')
  if (!m) throw new Error('Could not read the project ref from SUPABASE_URL')
  return m[1]
}

function directPassword() {
  const raw = env.SUPABASE_CONNECTION_STRING
  if (!raw) throw new Error('SUPABASE_CONNECTION_STRING is missing from .env')
  const u = new URL(raw)
  return decodeURIComponent(u.password)
}

function tryConnect(url) {
  const r = spawnSync('psql', [url, '-tAc', 'select 1'], {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: directPassword(), PGCONNECT_TIMEOUT: '8' },
  })
  return r.status === 0
}

let cachedUrl = null
function dbUrl() {
  if (cachedUrl) return cachedUrl
  const ref = projectRef()
  const hosts = env.SUPABASE_POOLER_HOST
    ? [env.SUPABASE_POOLER_HOST]
    : POOLER_REGIONS.map((r) => `${r}.pooler.supabase.com`)

  for (const host of hosts) {
    const url = `postgresql://postgres.${ref}@${host}:5432/postgres?sslmode=require`
    if (tryConnect(url)) {
      cachedUrl = url
      return url
    }
  }
  throw new Error(
    'Could not reach the database on any known pooler host. ' +
      'Set SUPABASE_POOLER_HOST in .env to the correct one.',
  )
}

function psql(args, { input, quiet } = {}) {
  const r = spawnSync('psql', [dbUrl(), '-v', 'ON_ERROR_STOP=1', ...args], {
    encoding: 'utf8',
    input,
    env: { ...process.env, PGPASSWORD: directPassword() },
    stdio: input === undefined && !quiet ? ['inherit', 'pipe', 'pipe'] : 'pipe',
  })
  if (r.status !== 0) {
    process.stderr.write(r.stderr ?? '')
    throw new Error(`psql exited ${r.status}`)
  }
  return (r.stdout ?? '').trim()
}

function query(sql) {
  return psql(['-tAc', sql], { quiet: true })
}

function migrationFiles() {
  if (!existsSync(migrationsDir)) return []
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

function ensureLedger() {
  query(`
    create table if not exists public.schema_migrations (
      version     text primary key,
      applied_at  timestamptz not null default now(),
      checksum    text not null
    );
    alter table public.schema_migrations enable row level security;
    do $$ begin
      if not exists (
        select 1 from pg_policy p
        join pg_class c on c.oid = p.polrelid
        where c.relname = 'schema_migrations'
      ) then
        -- Service role bypasses RLS; nobody else has any business reading this.
        create policy migrations_no_access on public.schema_migrations
          for select using (false);
      end if;
    end $$;
  `)
}

function appliedVersions() {
  ensureLedger()
  const out = query('select version from public.schema_migrations order by version')
  return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : []
}

function checksum(text) {
  return execFileSync('shasum', ['-a', '256'], { input: text, encoding: 'utf8' })
    .split(' ')[0]
    .slice(0, 16)
}

function cmdStatus() {
  const applied = new Set(appliedVersions())
  const files = migrationFiles()
  if (!files.length) {
    console.log('No migrations on disk.')
    return
  }
  for (const f of files) {
    console.log(`${applied.has(basename(f, '.sql')) ? '  applied' : '  PENDING'}  ${f}`)
  }
}

function cmdPush() {
  const applied = new Set(appliedVersions())
  const pending = migrationFiles().filter((f) => !applied.has(basename(f, '.sql')))
  if (!pending.length) {
    console.log('Nothing to apply. Database is up to date.')
    return
  }
  for (const file of pending) {
    const version = basename(file, '.sql')
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8')
    process.stdout.write(`applying ${file} ... `)
    // Each migration is one transaction: it lands whole or not at all.
    const wrapped = [
      'begin;',
      sql,
      `insert into public.schema_migrations (version, checksum)
         values (${literal(version)}, ${literal(checksum(sql))});`,
      'commit;',
    ].join('\n')
    try {
      psql(['-q', '-f', '-'], { input: wrapped })
      console.log('ok')
    } catch (err) {
      console.log('FAILED')
      throw err
    }
  }
  console.log(`\nApplied ${pending.length} migration(s).`)
}

function literal(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

const CHECKS = [
  {
    name: 'RLS enabled on every public table',
    // 04-DATA-MODEL.md §17.1
    sql: `select c.relname from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
  },
  {
    name: 'Every RLS table has at least one policy',
    // §17.2
    sql: `select c.relname from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
            and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
  },
  {
    name: 'Every view runs with security_invoker',
    // §17.3 — a view without it silently bypasses RLS.
    sql: `select c.relname from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'v'
            and coalesce((select option_value from pg_options_to_table(c.reloptions)
                          where option_name = 'security_invoker'), 'false') <> 'true'`,
  },
  {
    name: 'No column looks like a credential store',
    // 07-AUTH-ERS.md §12 — no migration may ever add one.
    sql: `select table_name || '.' || column_name from information_schema.columns
          where table_schema = 'public'
            and (column_name ~* '(^|_)(password|passwd|pwd|secret|credential)s?($|_)'
                 or column_name ~* 'ers_(pass|password|login)')`,
  },
]

function cmdCheck() {
  let failed = 0
  for (const check of CHECKS) {
    const out = query(check.sql)
    if (out) {
      failed++
      console.error(`FAIL  ${check.name}`)
      for (const row of out.split('\n')) console.error(`        ${row}`)
    } else {
      console.log(`ok    ${check.name}`)
    }
  }
  if (failed) {
    console.error(`\n${failed} schema check(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll schema safeguards pass.')
}

function cmdPsql() {
  spawnSync('psql', [dbUrl()], {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: directPassword() },
  })
}

function cmdTypes() {
  const target = resolve(root, 'packages/core/src/database.types.ts')
  const url = dbUrl().replace('postgresql://postgres.', `postgresql://postgres.`)
  const withPassword = url.replace(
    'postgresql://',
    `postgresql://`,
  )
  const r = spawnSync(
    'supabase',
    ['gen', 'types', 'typescript', '--db-url', injectPassword(withPassword)],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  if (r.status !== 0) {
    process.stderr.write(r.stderr ?? '')
    process.exit(1)
  }
  writeFileSync(target, r.stdout)
  console.log(`Wrote ${target}`)
}

function injectPassword(url) {
  const u = new URL(url)
  u.password = encodeURIComponent(directPassword())
  return u.toString()
}

const command = process.argv[2] ?? 'status'
const commands = {
  push: cmdPush,
  status: cmdStatus,
  check: cmdCheck,
  psql: cmdPsql,
  types: cmdTypes,
}

if (!commands[command]) {
  console.error(`Unknown command "${command}". Use: ${Object.keys(commands).join(', ')}`)
  process.exit(1)
}

try {
  commands[command]()
} catch (err) {
  console.error(`\n${err.message}`)
  process.exit(1)
}
