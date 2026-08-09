'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { flush, startSync } from '@/lib/offline/sync'
import { queueDepth } from '@/lib/offline/db'
import { evaluateAlerts } from '@/lib/notifications/thresholds'
import { spring, transition } from '@/design/motion'
import { IconOffline } from '@/components/ui/icon'

/**
 * Starts the sync engine and owns the one piece of chrome that reports
 * connection state.
 *
 * Offline is a first-class state, not an error state: the app keeps working
 * from cache and this strip simply says so, along with how many changes are
 * waiting. It never blocks anything.
 */
export function SyncBoundary({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    setOnline(navigator.onLine)

    const stop = startSync()

    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // The service worker asks for a flush when the browser's background sync
    // fires, which is the only path that works with the app closed.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'flush-queue') void flush()
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)

    const poll = setInterval(async () => setPending(await queueDepth()), 4000)
    void queueDepth().then(setPending)

    // Threshold crossings are evaluated here rather than on a server, because
    // no server-side process is allowed to read a student's grades or
    // attendance. The device already has the data.
    const alerts = setTimeout(() => void evaluateAlerts(), 3000)

    return () => {
      stop()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
      clearInterval(poll)
      clearTimeout(alerts)
    }
  }, [])

  return (
    <>
      <AnimatePresence>
        {!online && (
          <motion.div
            role="status"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={transition(spring.snap)}
            className="material material-large fixed inset-x-0 top-0 z-50 flex justify-center"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <p className="type-footnote flex items-center gap-2 px-4 py-2 text-[var(--label-secondary)]">
              <IconOffline size={16} />
              {pending > 0
                ? `You're offline. ${pending} change${pending === 1 ? '' : 's'} will sync when you're back.`
                : "You're offline. Showing what we saved."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  )
}
