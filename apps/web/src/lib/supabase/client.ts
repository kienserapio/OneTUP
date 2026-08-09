'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@onetup/core'

/**
 * The browser client. Carries the publishable key only — every authorisation
 * decision is made by row-level security in Postgres, so a fully compromised
 * client still cannot read another student's rows.
 */
let cached: ReturnType<typeof createBrowserClient<Database>> | null = null

export function supabaseBrowser() {
  cached ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
  return cached
}
