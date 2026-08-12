import { z } from 'zod'
import { ApiError, type ErrorCode } from '@/lib/api/errors'
import { authenticated, log, parseBody } from '@/lib/api/handler'
import { activeImportCount, enforceLimit, recordAttempt } from '@/lib/api/rate-limit'
import { assertRequestedIdentity, assertScrapedIdentity } from '@/lib/import/verify-identity'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * One sign-in, both records.
 *
 * Onboarding used to be able to ask for a schedule and nothing else, so a
 * student who wanted their GWA history had to hand over the same password a
 * second time on a different screen. The portal allows one live session per
 * student, which makes that second login actively harmful rather than merely
 * tedious — it ends the first one. So this asks the worker for both pages
 * behind a single sign-in.
 *
 * Everything /api/ers/import and /api/ers/grades promise holds here unchanged:
 * the body is never logged, `sync_jobs.error_detail` is sanitised on the way in,
 * and nothing is committed. In particular grades are not written from here and
 * cannot be — migration 023 revokes that table from the service role, because
 * ARD §6.1 says a student's academic record has no administrative override. The
 * response is a proposal; the review screen writes it through the student's own
 * session.
 *
 * The two halves fail differently, and deliberately. A schedule that cannot be
 * read fails the request, because it is what the student asked for. Grades that
 * cannot be read come back as `grades: null` with a reason, because a student
 * who lost their GWA history to a moved page still has an onboarding to finish.
 */

/**
 * The worker's error vocabulary, translated into the shared envelope's. Codes it
 * grows that have no counterpart here fall through to `ERS_UNAVAILABLE`, which
 * is both true and retryable. Translated rather than cast: an unknown string
 * widened into this union is a stack trace where a sentence should be.
 */
const WORKER_CODES: Record<string, ErrorCode | undefined> = {
  ERS_AUTH_FAILED: 'ERS_AUTH_FAILED',
  ERS_UNAVAILABLE: 'ERS_UNAVAILABLE',
  // Bounced back to the sign-in page mid-scrape. Ours to retry, not theirs.
  ERS_SESSION_LOST: 'ERS_UNAVAILABLE',
  ERS_TIMEOUT: 'ERS_TIMEOUT',
  SCHEDULE_NOT_FOUND: 'SCHEDULE_NOT_FOUND',
  SCHEDULE_PARSE_FAILED: 'SCHEDULE_PARSE_FAILED',
  GRADES_NOT_FOUND: 'NOT_FOUND',
}

export const runtime = 'nodejs'
export const maxDuration = 70

const ImportAllRequest = z.object({
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

interface WorkerIdentity {
  fullName: string | null
  studentNumber: string | null
  programName: string | null
  termLabel: string | null
}

interface WorkerPayload {
  code?: string
  message?: string
  parser_version?: string
  courses?: unknown[]
  unparsed?: unknown[]
  warnings?: unknown[]
  identity?: WorkerIdentity | null
  grades?: {
    parser_version?: string
    courses?: unknown[]
    unparsed?: unknown[]
    warnings?: unknown[]
    terms?: unknown[]
    identity?: WorkerIdentity | null
    debug?: { selector?: string; rows?: string[][]; page?: unknown }
  } | null
  grades_error?: { code: string; message: string } | null
}

export const POST = authenticated(async (request, { user, requestId }) => {
  const body = await parseBody(request, ImportAllRequest)

  await enforceLimit(user.id, 'ers_import')

  /* Before anything is sent anywhere: the number typed here has to be the
   * number on this account. Checking first means a wrong one costs no ERS login
   * and spends none of the three attempts before the portal locks out. */
  const onAccount = await assertRequestedIdentity(user.id, body.student_number)

  // Staying quiet on infrastructure we do not own: a burst of simultaneous
  // logins from one source is what looks like an attack to whoever monitors ERS
  // (auth doc §6).
  const concurrencyCap = Number(process.env.WORKER_MAX_CONCURRENCY ?? 10)
  if ((await activeImportCount()) >= concurrencyCap) {
    throw new ApiError(
      'ERS_UNAVAILABLE',
      'A lot of imports are running right now. Try again in a minute, or paste your schedule instead.',
    )
  }

  const startedAt = new Date().toISOString()

  /* Only the schedule job is opened here, and that is not an oversight. One
   * sign-in is one thing in flight, and `activeImportCount` counts running jobs
   * to decide whether ERS is being leaned on too hard — a second open row would
   * make every combined import look like two students. The grades half is
   * written down afterwards, already finished, so the job log still tells the
   * two reads apart (migration 028). */
  const admin = supabaseAdmin()
  const { data: job } = await admin
    .from('sync_jobs')
    .insert({
      user_id: user.id,
      kind: 'schedule_import',
      status: 'running',
      importer: 'ers_worker',
      started_at: startedAt,
    })
    .select('id')
    .single()

  const jobId = job?.id ?? null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 65_000)

  try {
    const response = await fetch(`${process.env.WORKER_URL}/scrape/all`, {
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

    const payload = (await response.json()) as WorkerPayload

    if (!response.ok) {
      const workerCode = payload.code ?? 'ERS_UNAVAILABLE'
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
     * form said one thing; this is what ERS says about the session it opened.
     * Both reads are checked, because both are about to be shown to somebody as
     * their own record. */
    assertScrapedIdentity(onAccount, payload.identity?.studentNumber)
    assertScrapedIdentity(onAccount, payload.grades?.identity?.studentNumber)

    const courses = payload.courses ?? []
    const unparsed = payload.unparsed ?? []

    await finishJob(jobId, 'succeeded', {
      parser_version: payload.parser_version ?? null,
      rows_parsed: courses.length,
      rows_failed: unparsed.length,
    })
    await recordAttempt(user.id, 'ers_import', 'ok')

    const gradeCourses = payload.grades?.courses ?? []
    const gradeUnparsed = payload.grades?.unparsed ?? []

    const gradesJobId = payload.grades
      ? await recordGradesJob(user.id, startedAt, {
          status: 'succeeded',
          parser_version: payload.grades.parser_version ?? null,
          rows_parsed: gradeCourses.length,
          rows_failed: gradeUnparsed.length,
        })
      : await recordGradesJob(user.id, startedAt, {
          status: 'failed',
          error_code: payload.grades_error?.code ?? 'GRADES_NOT_FOUND',
          error_detail: sanitiseDetail(payload.grades_error?.message),
        })

    // Counts only. The rows themselves are the student's schedule and academic
    // record, and never reach a log line.
    log('info', 'ers.import_all.succeeded', {
      request_id: requestId,
      job_id: jobId,
      grades_job_id: gradesJobId,
      parser_version: payload.parser_version,
      rows_parsed: courses.length,
      rows_failed: unparsed.length,
      grades_rows_parsed: gradeCourses.length,
      grades_terms_found: payload.grades?.terms?.length ?? 0,
      grades_error_code: payload.grades_error?.code ?? null,
    })

    return {
      job_id: jobId,
      status: 'succeeded' as const,
      schedule: {
        job_id: jobId,
        status: 'succeeded' as const,
        parser_version: payload.parser_version,
        rows_parsed: courses.length,
        rows_failed: unparsed.length,
        courses,
        unparsed,
        warnings: payload.warnings ?? [],
        // The student's own name and program, as ERS holds them. Returned to
        // the review screen so they can see what will be saved before it is.
        identity: payload.identity ?? null,
      },
      grades: payload.grades
        ? {
            job_id: gradesJobId,
            status: 'succeeded' as const,
            parser_version: payload.grades.parser_version,
            rows_parsed: gradeCourses.length,
            rows_failed: gradeUnparsed.length,
            courses: gradeCourses,
            unparsed: gradeUnparsed,
            warnings: payload.grades.warnings ?? [],
            terms: payload.grades.terms ?? [],
            // Passed straight through to the review screen. Nobody has seen
            // this page's markup yet, so the student running the import is the
            // only person who can tell us what it actually looks like.
            debug: payload.grades.debug ?? null,
          }
        : null,
      /* Present instead of `grades` when that half came back empty-handed. It is
       * a note for the student, not an error for the caller: the schedule above
       * is real either way, and onboarding carries on. */
      grades_error: payload.grades ? null : (payload.grades_error ?? null),
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
     * Reporting that as "ERS isn't responding" sends whoever is on call to debug
     * a system that is working fine, so the two are separated: the student sees
     * an honest "our end" message, and the log says which.
     */
    if (unreachable) {
      log('error', 'ers.import_all.worker_unreachable', {
        request_id: requestId,
        worker_url: process.env.WORKER_URL ?? '(unset)',
      })
      throw new ApiError(
        'ERS_UNAVAILABLE',
        "OneTUP's import service isn't running right now — ERS itself is fine. Paste your schedule instead; it works the same.",
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
 * The grades half, recorded after the fact.
 *
 * Written already-terminal rather than opened alongside the schedule job, for
 * the reason given at the insert above: this is one sign-in, and the concurrency
 * cap counts running jobs. `started_at` is the moment the login began, because
 * that is when this read genuinely started — the two share a session.
 */
async function recordGradesJob(
  userId: string,
  startedAt: string,
  fields: Record<string, unknown>,
): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from('sync_jobs')
    .insert({
      user_id: userId,
      kind: 'grades_import',
      importer: 'ers_worker',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      ...fields,
    })
    .select('id')
    .single()

  return data?.id ?? null
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
