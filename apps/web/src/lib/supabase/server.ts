import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@onetup/core'

/**
 * Request-scoped client for server components and route handlers. Runs as the
 * signed-in student, so RLS applies exactly as it does in the browser.
 */
export async function supabaseServer() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server components cannot set cookies. The middleware refreshes
            // the session on every request, so this path is safe to ignore.
          }
        },
      },
    },
  )
}

/**
 * The signed-in user, or null.
 *
 * Always `getUser()`, never `getSession()`, for anything that gates access:
 * `getSession` reads the cookie without verifying it, which is fine for
 * rendering and wrong for authorisation.
 */
export async function currentUser() {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}
