import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * What the database suites need before they can run, and one honest sentence
 * when they cannot.
 *
 * Three suites had a copy of this each. The copies were fine; what was missing
 * was the case in the middle — credentials that are present and *point at
 * nothing*. A paused project, a deleted one, a project ref left over from
 * before a migration between accounts: all three produce
 * `AuthRetryableFetchError: fetch failed` at the line that creates a test user,
 * thirty lines into a stack trace about `GoTrueAdminApi`, and none of them are
 * a bug in the suite.
 *
 * So there are three states, not two: no credentials (skip, silently — a fork
 * has never seen a `.env`), credentials that work (run), and credentials that
 * point somewhere unreachable (fail, and say so in one line).
 */

function readEnvFile(path: string): Record<string, string> {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return {}
  }

  const values: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

const fileEnv = readEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))

export const readEnv = (key: string): string => process.env[key] ?? fileEnv[key] ?? ''

export const SUPABASE_URL = readEnv('SUPABASE_URL')
export const SUPABASE_PUBLISHABLE_KEY = readEnv('SUPABASE_PUBLISHABLE_KEY')
export const SUPABASE_SERVICE_ROLE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY')

/* CI writes a `.env` full of placeholders so the web app can typecheck and
 * build without touching a real project. Those placeholders are enough to make
 * the three keys look present, so a suite would try to create accounts against
 * a host that does not exist. The workflow marks them for what they are, and
 * these suites treat a marked environment as no environment at all. */
const PLACEHOLDER = readEnv('SUPABASE_PLACEHOLDER') === 'true'

export const configured =
  !PLACEHOLDER && Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SERVICE_ROLE_KEY)

/**
 * Checks the project is actually there, before a suite spends its hook timeout
 * discovering otherwise.
 *
 * Throws with the URL and the likely cause. It does not skip: credentials that
 * name a project mean somebody expects that project to exist, and quietly
 * passing a run whose database has vanished is how a dead production database
 * stays undiscovered.
 */
export async function requireReachableProject(): Promise<void> {
  if (!configured) return

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status >= 500) {
      throw new Error(`the project answered ${response.status}`)
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new Error(
      [
        `Cannot reach ${SUPABASE_URL} (${detail}).`,
        '',
        'SUPABASE_URL in .env names a project that is not answering. Usually one of:',
        '  · the project is paused — open it in the Supabase dashboard to resume it',
        '  · the project was deleted, and .env still has its ref',
        '  · this machine has no network route to it',
        '',
        'Nothing is wrong with the test suite. Fix .env, or unset the Supabase keys',
        'to skip the database suites entirely.',
      ].join('\n'),
    )
  }
}
