'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { clearLocalData } from '@/lib/offline/db'

/**
 * Sign-out is a client page rather than a route handler for one reason: the
 * local store has to be wiped, and only the browser can do that.
 *
 * That includes any device-side ERS credential entry. A student handing their
 * phone to someone else after signing out must not be handing over a way into
 * their portal (auth doc §5.2).
 */
export default function SignOutPage() {
  const router = useRouter()

  useEffect(() => {
    void (async () => {
      await clearLocalData()
      await supabaseBrowser().auth.signOut()
      router.replace('/')
      router.refresh()
    })()
  }, [router])

  return (
    <main className="app-container flex min-h-dvh items-center justify-center">
      <p className="type-body text-[var(--label-secondary)]" role="status">
        Signing you out…
      </p>
    </main>
  )
}
