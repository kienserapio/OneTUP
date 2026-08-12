import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  ScrapeError,
  closeBrowser,
  closeSessions,
  openSessionCount,
  scrapeAll,
  scrapeGrades,
  scrapeSchedule,
  type Credentials,
} from './scrape'

/**
 * The sync worker.
 *
 * A deliberately small HTTP service that reads two pages of the portal and
 * keeps nothing from either. Read the constraints in
 * 07-AUTH-ERS.md §4.2 before changing anything here — several of them are
 * enforced by what this file does *not* do:
 *
 *   - No Supabase client, no database URL, no persistence of any kind.
 *   - No request body is ever logged, and no log line carries a field name that
 *     could hold a credential.
 *   - Each job runs under a hard timeout; the browser context is destroyed
 *     whatever happens.
 *   - Credential strings are overwritten before the handler returns.
 */

const PORT = Number(process.env.PORT ?? 8787)
const SECRET = process.env.WORKER_SECRET ?? ''
const MAX_CONCURRENCY = Number(process.env.WORKER_MAX_CONCURRENCY ?? 10)
const JOB_TIMEOUT_MS = Number(process.env.WORKER_JOB_TIMEOUT_MS ?? 60_000)
const MAX_BODY_BYTES = 8 * 1024

if (!SECRET) {
  console.error('WORKER_SECRET is not set. Refusing to start.')
  process.exit(1)
}

let inFlight = 0

/** Structured logs, and never anything from the request body. */
function log(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

function send(response: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Overwrites a string's backing storage as far as JavaScript allows.
 *
 * JS strings are immutable, so this cannot truly zero them — what it does is
 * drop every reference this process holds so the value is collectable, and make
 * that intent explicit at the call site. The real protection is that the
 * process is short-lived and holds nothing else.
 */
function discard(credentials: Record<string, string>): void {
  for (const key of Object.keys(credentials)) {
    credentials[key] = ''
  }
}

function timeBoxed<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ScrapeError('ERS_TIMEOUT', 'That took too long. Try again, or paste your schedule.')),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Everything this worker will do, keyed by path.
 *
 * Both jobs sign in the same way and differ only in which page they read, so
 * the endpoint list is data rather than a second copy of the handler. A path
 * that is not in here 404s before a body is read, let alone a browser started.
 */
interface JobResult {
  parser_version: string
  courses: unknown[]
  unparsed: unknown[]
  warnings: unknown[]
  [field: string]: unknown
}

interface Job {
  name: string
  run(credentials: Credentials): Promise<JobResult>
}

const JOBS: Record<string, Job | undefined> = {
  '/scrape/schedule': {
    name: 'schedule',
    async run(credentials) {
      const result = await scrapeSchedule(credentials)
      return {
        parser_version: result.parserVersion,
        courses: result.courses,
        unparsed: result.unparsed,
        warnings: result.warnings,
        // The student's own name and program, read from the page header.
        identity: result.identity,
      }
    },
  },
  '/scrape/grades': {
    name: 'grades',
    async run(credentials) {
      const result = await scrapeGrades(credentials)
      return {
        parser_version: result.parserVersion,
        courses: result.courses,
        unparsed: result.unparsed,
        warnings: result.warnings,
        terms: result.terms,
        // Whose record this actually is. The web app compares it against the
        // signed-in student and refuses a mismatch.
        identity: result.identity,
        // Raw rows, for the reason set out on `GradeScrapeResult`: this page's
        // markup has never been seen, and the first real import is the only way
        // to learn what it looks like.
        debug: {
          selector: result.debugSelector,
          rows: result.debugRows,
          // Only present when nothing was found. This is the evidence that
          // separates "no grades posted" from "our reader missed them".
          page: result.diagnostic,
        },
      }
    },
  },
  /**
   * Both pages, one sign-in. What onboarding asks for.
   *
   * Shaped as the schedule payload with the grades hanging off it rather than as
   * two equal halves, because the two halves are not equal: the schedule is the
   * only one whose failure ends the request, and the shared log line below counts
   * `courses` and `unparsed`. Those counts mean something only if they belong to
   * the read that could have failed.
   */
  '/scrape/all': {
    name: 'all',
    async run(credentials) {
      const result = await scrapeAll(credentials)
      return {
        parser_version: result.schedule.parserVersion,
        courses: result.schedule.courses,
        unparsed: result.schedule.unparsed,
        warnings: result.schedule.warnings,
        identity: result.schedule.identity,
        // Null when the grades page would not come. Never fatal: a student who
        // came for a schedule keeps the schedule.
        grades: result.grades
          ? {
              parser_version: result.grades.parserVersion,
              courses: result.grades.courses,
              unparsed: result.grades.unparsed,
              warnings: result.grades.warnings,
              terms: result.grades.terms,
              identity: result.grades.identity,
              debug: {
                selector: result.grades.debugSelector,
                rows: result.grades.debugRows,
                page: result.grades.diagnostic,
              },
            }
          : null,
        grades_error: result.gradesError,
      }
    },
  },
}

const server = createServer((request, response) => {
  void handle(request, response).catch((error) => {
    log('error', 'unhandled', { error: error instanceof Error ? error.message : 'unknown' })
    if (!response.headersSent) send(response, 500, { code: 'INTERNAL', message: 'Something went wrong.' })
  })
})

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`)

  if (request.method === 'GET' && url.pathname === '/health') {
    // `sessions` is a count and nothing more — no student is identifiable from
    // it, and it is the one number that says whether reuse is working.
    send(response, 200, { status: 'ok', in_flight: inFlight, sessions: openSessionCount() })
    return
  }

  const job = request.method === 'POST' ? JOBS[url.pathname] : undefined
  if (!job) {
    send(response, 404, { code: 'NOT_FOUND', message: 'No such endpoint.' })
    return
  }

  // Constant-time-ish comparison so the secret cannot be probed byte by byte.
  const provided = (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!timingSafeEqual(provided, SECRET)) {
    log('warn', 'auth.rejected', { path: url.pathname })
    send(response, 401, { code: 'UNAUTHENTICATED', message: 'Not permitted.' })
    return
  }

  if (inFlight >= MAX_CONCURRENCY) {
    send(response, 503, {
      code: 'ERS_UNAVAILABLE',
      // Both jobs land here, so the advice cannot name one of them.
      message: 'Busy right now. Try again in a minute.',
    })
    return
  }

  const requestId = String(request.headers['x-request-id'] ?? '')
  const started = Date.now()

  const credentials = { studentNumber: '', password: '', birthdate: '' }

  try {
    const raw = await readBody(request)
    const parsed = JSON.parse(raw) as Record<string, unknown>

    credentials.studentNumber = String(parsed.student_number ?? '')
    credentials.password = String(parsed.password ?? '')
    credentials.birthdate = String(parsed.birthdate ?? '')

    if (!credentials.studentNumber || !credentials.password || !credentials.birthdate) {
      send(response, 422, {
        code: 'VALIDATION_FAILED',
        message: 'Student number, password and birthdate are all needed.',
      })
      return
    }

    inFlight += 1
    const result = await timeBoxed(job.run({ ...credentials }), JOB_TIMEOUT_MS)

    log('info', 'scrape.succeeded', {
      request_id: requestId,
      job: job.name,
      parser_version: result.parser_version,
      rows_parsed: result.courses.length,
      rows_failed: result.unparsed.length,
      duration_ms: Date.now() - started,
    })

    // Counts above, contents here. Nothing in this payload is logged: it is the
    // student's own record on its way back to the student's own browser.
    send(response, 200, result)
  } catch (error) {
    if (error instanceof ScrapeError) {
      log('warn', 'scrape.failed', {
        request_id: requestId,
        code: error.code,
        duration_ms: Date.now() - started,
      })
      send(response, statusFor(error.code), { code: error.code, message: error.message })
      return
    }

    log('error', 'scrape.error', {
      request_id: requestId,
      duration_ms: Date.now() - started,
      // The message, not the body, and only when it is ours.
      error: error instanceof Error ? error.name : 'unknown',
    })
    send(response, 503, {
      code: 'ERS_UNAVAILABLE',
      message: "ERS isn't responding right now. Try again in a bit, or paste your schedule.",
    })
  } finally {
    discard(credentials)
    inFlight = Math.max(0, inFlight - 1)
  }
}

function statusFor(code: string): number {
  switch (code) {
    case 'ERS_AUTH_FAILED':
      return 401
    case 'ERS_SESSION_LOST':
      return 503
    case 'SCHEDULE_NOT_FOUND':
    case 'GRADES_NOT_FOUND':
      return 404
    case 'SCHEDULE_PARSE_FAILED':
      return 422
    case 'ERS_TIMEOUT':
      return 504
    default:
      return 503
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

server.listen(PORT, () => log('info', 'worker.listening', { port: PORT }))

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log('info', 'worker.stopping', { signal })
    server.close(() => {
      // Sessions first: closing the browser out from under a live context
      // leaves somebody signed in on the portal's side for the idle timeout.
      void closeSessions()
        .then(() => closeBrowser())
        .finally(() => process.exit(0))
    })
  })
}
