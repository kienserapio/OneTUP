import 'server-only'

import { NextResponse } from 'next/server'
import { ApiError, errors, isApiError } from './errors'
import { currentUser } from '../supabase/server'
import type { User } from '@supabase/supabase-js'

/**
 * Route handler plumbing: request IDs, structured logs, and one place where an
 * unexpected throw becomes a well-formed envelope.
 *
 * Nothing here ever logs a request body. The import endpoint carries ERS
 * credentials, and the rule is easier to keep when the logger simply has no
 * path to the payload.
 */

export interface RequestContext {
  requestId: string
  user: User
}

type Handler<T> = (request: Request, context: RequestContext) => Promise<T>

const SENSITIVE_KEY = /pass|secret|token|credential|birth|auth/i

/** Strips anything credential-shaped before a value reaches a log line. */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactForLog(entry, depth + 1)
  }
  return out
}

export function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(redactForLog(fields) as Record<string, unknown>),
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

function requestIdOf(request: Request): string {
  return request.headers.get('X-Request-Id') ?? `req_${crypto.randomUUID()}`
}

/**
 * Wraps a handler that requires a signed-in student. The handler receives the
 * verified user, so no route has to remember to check.
 */
export function authenticated<T>(handler: Handler<T>) {
  return async (request: Request): Promise<NextResponse> => {
    const requestId = requestIdOf(request)
    const started = Date.now()

    try {
      const user = await currentUser()
      if (!user) throw errors.unauthenticated()

      const result = await handler(request, { requestId, user })

      log('info', 'request.ok', {
        request_id: requestId,
        path: new URL(request.url).pathname,
        method: request.method,
        duration_ms: Date.now() - started,
      })

      return NextResponse.json(result, { headers: { 'X-Request-Id': requestId } })
    } catch (error) {
      return handleError(error, requestId, request, started)
    }
  }
}

/** Same plumbing, no authentication — for the public campus and data routes. */
export function publicRoute<T>(handler: (request: Request, requestId: string) => Promise<T>) {
  return async (request: Request): Promise<NextResponse> => {
    const requestId = requestIdOf(request)
    const started = Date.now()
    try {
      const result = await handler(request, requestId)
      return NextResponse.json(result, { headers: { 'X-Request-Id': requestId } })
    } catch (error) {
      return handleError(error, requestId, request, started)
    }
  }
}

function handleError(
  error: unknown,
  requestId: string,
  request: Request,
  started: number,
): NextResponse {
  const apiError: ApiError = isApiError(error)
    ? error
    : errors.internal({ cause: error instanceof Error ? error.message : String(error) })

  log(apiError.status >= 500 ? 'error' : 'warn', 'request.failed', {
    request_id: requestId,
    path: new URL(request.url).pathname,
    method: request.method,
    code: apiError.code,
    status: apiError.status,
    duration_ms: Date.now() - started,
    // The detail is for us, not the student — but it is still redacted, because
    // "internal only" is not a promise a log aggregator can keep.
    detail: apiError.detail,
  })

  const headers: Record<string, string> = { 'X-Request-Id': requestId }
  const retryAfter = apiError.detail?.retry_after
  if (typeof retryAfter === 'number') headers['Retry-After'] = String(retryAfter)

  return NextResponse.json(apiError.toEnvelope(requestId), {
    status: apiError.status,
    headers,
  })
}

/** Parses and validates a JSON body, turning a schema failure into a 422. */
export async function parseBody<T>(
  request: Request,
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T; error?: unknown } },
): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw errors.validation('That request body was not valid JSON.')
  }

  const result = schema.safeParse(raw)
  if (!result.success || result.data === undefined) {
    throw errors.validation(undefined, {
      issues: (result.error as { issues?: unknown })?.issues ?? null,
    })
  }
  return result.data
}
