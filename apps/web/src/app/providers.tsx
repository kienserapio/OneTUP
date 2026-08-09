'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * React Query sits *behind* IndexedDB, not in front of it. Local reads render
 * first; these settings only govern how eagerly we revalidate against the
 * server afterwards.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        retry: (failureCount, error) => {
          // A 4xx will not become a 2xx by asking again.
          const status = (error as { status?: number })?.status
          if (status && status >= 400 && status < 500) return false
          return failureCount < 3
        },
        refetchOnWindowFocus: true,
        // Retrying while offline just burns battery; the sync engine picks it
        // up on the reconnect event instead.
        networkMode: 'offlineFirst',
      },
      mutations: { networkMode: 'offlineFirst' },
    },
  })
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Not in development. The worker caches `/_next/static/` cache-first, which
    // is right in production where chunk names are content-hashed and wrong in
    // dev, where it serves yesterday's code back over a hot reload.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => void r.unregister()))
      return
    }

    // Registered after hydration so it never competes with first paint.
    const timer = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration costs offline support, not the app.
      })
    }, 1200)
    return () => clearTimeout(timer)
  }, [])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
