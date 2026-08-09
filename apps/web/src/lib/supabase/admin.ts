import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@onetup/core'

/**
 * Service-role client. Bypasses RLS entirely, so it is reserved for the few
 * operations that genuinely cannot run as a student:
 *
 *   - writing to `ai_cache` and `rate_limit_events`, which no client may read
 *   - dispatching scheduled Web Push notifications
 *   - publishing university-wide announcements
 *   - moderation
 *
 * It must never be reachable from a client component, and no path here may
 * read a student's grades or attendance — there is no administrative override
 * for personal academic data, by design (ARD §6.1).
 */
let cached: ReturnType<typeof createClient<Database>> | null = null

export function supabaseAdmin() {
  cached ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  return cached
}
