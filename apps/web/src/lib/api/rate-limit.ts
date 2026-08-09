import 'server-only'

import { supabaseAdmin } from '../supabase/admin'
import { errors } from './errors'

/**
 * Rate limiting, in the database rather than in memory, so it survives a
 * serverless cold start.
 *
 * The import limits are not about protecting our own capacity. Three
 * consecutive failures locking the endpoint for fifteen minutes is what stops
 * OneTUP being usable as a credential-testing oracle against a portal we do not
 * own, and the concurrency cap keeps our traffic from looking like an attack to
 * whoever watches ERS (auth doc §6).
 */

export interface LimitPolicy {
  /** Requests allowed inside the window. */
  limit: number
  windowSeconds: number
  /** Consecutive failures that trigger a lockout, if any. */
  failureLockout?: { after: number; seconds: number }
}

export const POLICIES = {
  ers_import: {
    limit: 5,
    windowSeconds: 3600,
    failureLockout: { after: 3, seconds: 900 },
  },
  ai: { limit: 30, windowSeconds: 3600 },
  assistant: { limit: 40, windowSeconds: 3600 },
  announcement_ingest: { limit: 20, windowSeconds: 3600 },
  deadline_extract: { limit: 15, windowSeconds: 3600 },
  study_pack: { limit: 3, windowSeconds: 86_400 },
} as const satisfies Record<string, LimitPolicy>

export type Bucket = keyof typeof POLICIES

export interface LimitResult {
  remaining: number
  resetSeconds: number
}

/**
 * Checks a bucket and throws RATE_LIMITED if it is exhausted or locked out.
 * Call before doing the work, and record the outcome afterwards.
 */
export async function enforceLimit(userId: string, bucket: Bucket): Promise<LimitResult> {
  const policy = POLICIES[bucket] as LimitPolicy
  const admin = supabaseAdmin()
  const since = new Date(Date.now() - policy.windowSeconds * 1000).toISOString()

  const { data, error } = await admin
    .from('rate_limit_events')
    .select('outcome, created_at')
    .eq('user_id', userId)
    .eq('bucket', bucket)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) {
    // A limiter that fails closed would lock every student out of import the
    // moment the table has a hiccup. Fail open, and say so in the logs.
    console.warn(JSON.stringify({ level: 'warn', message: 'rate_limit.unavailable', bucket }))
    return { remaining: policy.limit, resetSeconds: 0 }
  }

  const events = data ?? []

  if (policy.failureLockout) {
    let consecutive = 0
    for (const event of events) {
      if (event.outcome !== 'failure') break
      consecutive += 1
    }
    if (consecutive >= policy.failureLockout.after) {
      const latest = new Date(events[0].created_at).getTime()
      const unlocksAt = latest + policy.failureLockout.seconds * 1000
      const waitSeconds = Math.ceil((unlocksAt - Date.now()) / 1000)
      if (waitSeconds > 0) {
        throw errors.rateLimited(
          waitSeconds,
          `Too many failed attempts. Try again in ${Math.ceil(waitSeconds / 60)} minutes, or paste your schedule instead.`,
        )
      }
    }
  }

  if (events.length >= policy.limit) {
    const oldest = new Date(events[events.length - 1].created_at).getTime()
    const resetSeconds = Math.max(
      1,
      Math.ceil((oldest + policy.windowSeconds * 1000 - Date.now()) / 1000),
    )
    throw errors.rateLimited(resetSeconds)
  }

  return {
    remaining: policy.limit - events.length,
    resetSeconds: policy.windowSeconds,
  }
}

export async function recordAttempt(
  userId: string,
  bucket: Bucket,
  outcome: 'ok' | 'failure',
): Promise<void> {
  const admin = supabaseAdmin()
  await admin.from('rate_limit_events').insert({ user_id: userId, bucket, outcome })
}

/**
 * Global concurrency cap for ERS scraping. A burst of simultaneous logins from
 * one source is exactly the traffic shape that looks like an attack — staying
 * quiet is part of being a good citizen on infrastructure we do not own.
 */
export async function activeImportCount(): Promise<number> {
  const admin = supabaseAdmin()
  const since = new Date(Date.now() - 90_000).toISOString()
  const { count } = await admin
    .from('sync_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'running')
    .gte('started_at', since)
  return count ?? 0
}
