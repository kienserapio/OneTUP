import { z } from 'zod'
import { ApiError } from '@/lib/api/errors'
import { authenticated, log, parseBody } from '@/lib/api/handler'
import { activeImportCount, enforceLimit, recordAttempt } from '@/lib/api/rate-limit'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { assertRequestedIdentity, assertScrapedIdentity } from '@/lib/import/verify-identity'

/**
 * Past grades, read from the ERS grades page.
 *
 * Everything the schedule import promises holds here too — the body is never
 * logged, nothing is committed, and `sync_jobs.error_detail` is sanitised on
 * the way in — with one addition that matters more on this endpoint than on
 * that one.
 *
 * Grades are the data migration 023 deliberately withholds from the service
 * role, so this route touches them not at all. It returns a proposal, and the
 * review screen writes it through the student's own session where row-level
 * security applies. There is no path from here to the `grades` table, and that
 * is the point rather than an oversight.
 */

export const runtime = 'nodejs'
export const maxDuration = 70

const GradesRequest = z.object({
  student_number: z.string().min(3).max(32),
  password: z.string().min(1).max(128),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
})

/** Anything credential-shaped is stripped before a value is written or logged. */
function sanitiseDetail(detail: unknown): string | null {
  if (!detail) return null
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return text
    .replace(/(password|passwd|pwd|birthdate|token|secret)["'\s:=]+[^,}\s"']+/gi, '$1=[redacted]')
    .slice(0, 500)
}

/**
 * The worker speaks its own error vocabulary. `GRADES_NOT_FOUND` has no
 * counterpart in the shared envelope, so it is translated here rather than
 * widening that list for one endpoint.
 */
const WORKER_CODES = {
  ERS_AUTH_FAILED: 'ERS_AUTH_FAILED',
  ERS_UNAVAILABLE: 'ERS_UNAVAILABLE',
  // Bounced back to the sign-in page mid-scrape. Ours to retry, not theirs.
  ERS_SESSION_LOST: 'ERS_UNAVAILABLE',
  ERS_TIMEOUT: 'ERS_TIMEOUT',
  GRADES_NOT_FOUND: 'NOT_FOUND',
} as const

export const POST = authenticated(async (request, { user, requestId }) => {
  const body = await parseBody(request, GradesRequest)

  await enforceLimit(user.id, 'ers_import')

  /* Before anything is sent anywhere: the number typed here has to be the
   * number on this account. Checking first means a wrong one costs no ERS
   * login and spends none of the three attempts before the portal locks out. */
  const onAccount = await assertRequestedIdentity(user.id, body.student_number)

  // Same cap as the schedule import, and for the same reason: a burst of
  // simultaneous logins from one source is what looks like an attack to
  // whoever monitors ERS (auth doc §6).
  const concurrencyCap = Number(process.env.WORKER_MAX_CONCURRENCY ?? 10)
  if ((await activeImportCount()) >= concurrencyCap) {
    throw new ApiError(
      'ERS_UNAVAILABLE',
      'A lot of imports are running right now. Try again in a minute.',
    )
  }

  const admin = supabaseAdmin()
  const { data: job } = await admin
    .from('sync_jobs')
    .insert({
      user_id: user.id,
      kind: 'grades_import',
      status: 'running',
      importer: 'ers_worker',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  const jobId = job?.id ?? null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 65_000)

  try {
    const response = await fetch(`${process.env.WORKER_URL}/scrape/grades`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WORKER_SECRET}`,
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({
        student_number: body.student_number,
        password: body.password,
        birthdate: body.birthdate,
      }),
      signal: controller.signal,
    })

    const payload = (await response.json()) as {
      code?: string
      message?: string
      parser_version?: string
      courses?: unknown[]
      unparsed?: unknown[]
      warnings?: unknown[]
      terms?: unknown[]
      debug?: { selector?: string; rows?: string[][]; page?: unknown }
      identity?: { studentNumber?: string | null }
    }

    if (!response.ok) {
      const workerCode = (payload.code ?? 'ERS_UNAVAILABLE') as keyof typeof WORKER_CODES
      const code = WORKER_CODES[workerCode] ?? 'ERS_UNAVAILABLE'

      await finishJob(jobId, 'failed', {
        error_code: workerCode,
        error_detail: sanitiseDetail(payload.message),
      })

      // Only an authentication failure counts toward the lockout. A portal
      // outage is not the student's fault and must not lock them out.
      await recordAttempt(user.id, 'ers_import', workerCode === 'ERS_AUTH_FAILED' ? 'failure' : 'ok')

      throw new ApiError(code, payload.message)
    }

    /* And now the check that counts: whoever the portal actually let in. The
     * form said one thing; this is what ERS says about the session it opened. */
    assertScrapedIdentity(onAccount, payload.identity?.studentNumber)

    const courses = payload.courses ?? []
    const unparsed = payload.unparsed ?? []

    await finishJob(jobId, 'succeeded', {
      parser_version: payload.parser_version ?? null,
      rows_parsed: courses.length,
      rows_failed: unparsed.length,
    })
    await recordAttempt(user.id, 'ers_import', 'ok')

    // Counts only. The rows themselves are the student's academic record and
    // never reach a log line.
    log('info', 'ers.grades.succeeded', {
      request_id: requestId,
      job_id: jobId,
      parser_version: payload.parser_version,
      rows_parsed: courses.length,
      rows_failed: unparsed.length,
      terms_found: payload.terms?.length ?? 0,
    })

    return {
      job_id: jobId,
      status: 'succeeded' as const,
      parser_version: payload.parser_version,
      rows_parsed: courses.length,
      rows_failed: unparsed.length,
      courses,
      unparsed,
      warnings: payload.warnings ?? [],
      terms: payload.terms ?? [],
      // Passed straight through to the review screen. Nobody has seen this
      // page's markup yet, so the student running the first import is the only
      // person who can tell us what it actually looks like.
      debug: payload.debug ?? null,
    }
  } catch (error) {
    if (error instanceof ApiError) throw error

    const aborted = error instanceof Error && error.name === 'AbortError'
    const unreachable = !aborted && isConnectionFailure(error)
    const code = aborted ? 'ERS_TIMEOUT' : 'ERS_UNAVAILABLE'

    await finishJob(jobId, 'failed', {
      error_code: unreachable ? 'WORKER_UNREACHABLE' : code,
      error_detail: sanitiseDetail(error instanceof Error ? error.message : null),
    })
    await recordAttempt(user.id, 'ers_import', 'ok')

    /*
     * A connection refused here means *our* worker is down, not the portal.
     * Reporting that as "ERS isn't responding" sends whoever is on call to
     * debug a system that is working fine.
     */
    if (unreachable) {
      log('error', 'ers.grades.worker_unreachable', {
        request_id: requestId,
        worker_url: process.env.WORKER_URL ?? '(unset)',
      })
      throw new ApiError(
        'ERS_UNAVAILABLE',
        "OneTUP's import service isn't running right now — ERS itself is fine. Try again shortly, or enter past grades by hand.",
      )
    }

    throw new ApiError(code)
  } finally {
    clearTimeout(timeout)
  }
})

async function finishJob(
  jobId: string | null,
  status: 'succeeded' | 'failed',
  fields: Record<string, unknown>,
): Promise<void> {
  if (!jobId) return
  await supabaseAdmin()
    .from('sync_jobs')
    .update({ status, finished_at: new Date().toISOString(), ...fields })
    .eq('id', jobId)
}

/**
 * `fetch` reports a refused or unresolvable connection as a bare
 * "fetch failed" TypeError, with the real reason on `cause`.
 */
function isConnectionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const cause = (error as { cause?: { code?: string } }).cause
  const code = cause?.code ?? ''
  return (
    ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'UND_ERR_SOCKET'].includes(code) ||
    /fetch failed/i.test(error.message)
  )
}
