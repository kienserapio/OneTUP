import { z } from 'zod'
import { ApiError } from '@/lib/api/errors'
import { authenticated, log, parseBody } from '@/lib/api/handler'
import { activeImportCount, enforceLimit, recordAttempt } from '@/lib/api/rate-limit'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Schedule import.
 *
 * The security posture of this endpoint is the whole point of ADR-003, so three
 * things are true here and must stay true:
 *
 *   1. The request body is never logged, in whole or in part, on any path.
 *   2. Nothing is committed. The response is a proposal the student reviews.
 *   3. `sync_jobs.error_detail` is sanitised on the way in, so a credential
 *      cannot reach the database even by accident.
 */

export const runtime = 'nodejs'
export const maxDuration = 70

const ImportRequest = z.object({
  student_number: z.string().min(3).max(32),
  password: z.string().min(1).max(128),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  term_code: z.string().min(4).max(24),
})

/** Anything credential-shaped is stripped before a value is written or logged. */
function sanitiseDetail(detail: unknown): string | null {
  if (!detail) return null
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return text
    .replace(/(password|passwd|pwd|birthdate|token|secret)["'\s:=]+[^,}\s"']+/gi, '$1=[redacted]')
    .slice(0, 500)
}

export const POST = authenticated(async (request, { user, requestId }) => {
  const body = await parseBody(request, ImportRequest)

  await enforceLimit(user.id, 'ers_import')

  // Staying quiet on infrastructure we do not own: a burst of simultaneous
  // logins from one source is exactly what looks like an attack to whoever
  // monitors ERS (auth doc §6).
  const concurrencyCap = Number(process.env.WORKER_MAX_CONCURRENCY ?? 10)
  if ((await activeImportCount()) >= concurrencyCap) {
    throw new ApiError(
      'ERS_UNAVAILABLE',
      'A lot of imports are running right now. Try again in a minute, or paste your schedule instead.',
    )
  }

  const admin = supabaseAdmin()
  const { data: job } = await admin
    .from('sync_jobs')
    .insert({
      user_id: user.id,
      kind: 'schedule_import',
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
    const response = await fetch(`${process.env.WORKER_URL}/scrape/schedule`, {
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
    }

    if (!response.ok) {
      const code = (payload.code ?? 'ERS_UNAVAILABLE') as
        | 'ERS_AUTH_FAILED'
        | 'ERS_UNAVAILABLE'
        | 'ERS_TIMEOUT'
        | 'SCHEDULE_NOT_FOUND'
        | 'SCHEDULE_PARSE_FAILED'

      await finishJob(jobId, 'failed', {
        error_code: code,
        error_detail: sanitiseDetail(payload.message),
      })

      // Only an authentication failure counts toward the lockout. A portal
      // outage is not the student's fault and must not lock them out.
      await recordAttempt(user.id, 'ers_import', code === 'ERS_AUTH_FAILED' ? 'failure' : 'ok')

      throw new ApiError(code, payload.message)
    }

    const courses = payload.courses ?? []
    const unparsed = payload.unparsed ?? []

    await finishJob(jobId, 'succeeded', {
      parser_version: payload.parser_version ?? null,
      rows_parsed: courses.length,
      rows_failed: unparsed.length,
    })
    await recordAttempt(user.id, 'ers_import', 'ok')

    log('info', 'ers.import.succeeded', {
      request_id: requestId,
      job_id: jobId,
      parser_version: payload.parser_version,
      rows_parsed: courses.length,
      rows_failed: unparsed.length,
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
    }
  } catch (error) {
    if (error instanceof ApiError) throw error

    const aborted = error instanceof Error && error.name === 'AbortError'
    const code = aborted ? 'ERS_TIMEOUT' : 'ERS_UNAVAILABLE'

    await finishJob(jobId, 'failed', {
      error_code: code,
      error_detail: sanitiseDetail(error instanceof Error ? error.message : null),
    })
    await recordAttempt(user.id, 'ers_import', 'ok')

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
