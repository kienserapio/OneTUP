/**
 * The single error envelope.
 *
 * `message` is user-facing and must be safe to display verbatim — it says what
 * went wrong and what to do about it, never what the stack trace was. `detail`
 * is for the client and is never shown to a student.
 */

export const ERROR_CODES = {
  UNAUTHENTICATED: { status: 401, retryable: false },
  FORBIDDEN: { status: 403, retryable: false },
  NOT_FOUND: { status: 404, retryable: false },
  VALIDATION_FAILED: { status: 422, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  ERS_UNAVAILABLE: { status: 503, retryable: true },
  ERS_AUTH_FAILED: { status: 401, retryable: false },
  ERS_TIMEOUT: { status: 504, retryable: true },
  SCHEDULE_NOT_FOUND: { status: 404, retryable: false },
  SCHEDULE_PARSE_FAILED: { status: 422, retryable: true },
  AI_UNAVAILABLE: { status: 503, retryable: true },
  AI_INVALID_OUTPUT: { status: 502, retryable: true },
  AI_QUOTA_EXCEEDED: { status: 429, retryable: true },
  INTERNAL: { status: 500, retryable: true },
} as const

export type ErrorCode = keyof typeof ERROR_CODES

/** Copy a student actually sees. Plain, specific, and always with a next step. */
const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'You need to sign in first.',
  FORBIDDEN: "You don't have access to that.",
  NOT_FOUND: "We couldn't find that.",
  VALIDATION_FAILED: 'Some of that information looks wrong. Check it and try again.',
  RATE_LIMITED: "You've done that a few too many times. Give it a minute.",
  ERS_UNAVAILABLE:
    "ERS isn't responding right now. Try again in a bit, or paste your schedule instead.",
  ERS_AUTH_FAILED:
    "Those details didn't work on ERS. Check your password and birthdate — the birthdate has to match your record exactly.",
  ERS_TIMEOUT: 'That took too long. Try again, or paste your schedule.',
  SCHEDULE_NOT_FOUND:
    "We got in, but couldn't find a schedule. You may not be enrolled yet this term.",
  SCHEDULE_PARSE_FAILED: 'We read most of your schedule. A few rows need checking.',
  AI_UNAVAILABLE: "That's unavailable right now. Everything else still works.",
  AI_INVALID_OUTPUT: "That didn't come back in a usable shape. Try again, or enter it yourself.",
  AI_QUOTA_EXCEEDED: "We've hit today's limit on that. It'll come back — everything else works.",
  INTERNAL: 'Something went wrong on our end. It has been logged.',
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode
    message: string
    detail?: Record<string, unknown>
    retryable: boolean
    request_id: string
  }
}

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly detail?: Record<string, unknown>

  constructor(code: ErrorCode, message?: string, detail?: Record<string, unknown>) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'ApiError'
    this.code = code
    this.detail = detail
  }

  get status(): number {
    return ERROR_CODES[this.code].status
  }

  get retryable(): boolean {
    return ERROR_CODES[this.code].retryable
  }

  toEnvelope(requestId: string): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        detail: this.detail,
        retryable: this.retryable,
        request_id: requestId,
      },
    }
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

/** Convenience constructors for the codes that come up on every route. */
export const errors = {
  unauthenticated: (message?: string) => new ApiError('UNAUTHENTICATED', message),
  forbidden: (message?: string) => new ApiError('FORBIDDEN', message),
  notFound: (message?: string) => new ApiError('NOT_FOUND', message),
  validation: (message?: string, detail?: Record<string, unknown>) =>
    new ApiError('VALIDATION_FAILED', message, detail),
  rateLimited: (retryAfterSeconds: number, message?: string) =>
    new ApiError('RATE_LIMITED', message, { retry_after: retryAfterSeconds }),
  internal: (detail?: Record<string, unknown>) => new ApiError('INTERNAL', undefined, detail),
}
