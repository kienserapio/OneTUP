'use client'

import { useEffect, useState } from 'react'

/**
 * A clock that ticks only as often as the caller needs.
 *
 * Urgency, "in 15 minutes", and the current-class highlight are all recomputed
 * on render rather than stored, so something has to move the clock — but a
 * per-second tick across a whole list is wasted work on a mid-range phone.
 *
 * This file used to also hold `useLocal`, `useLocalMany` and `useOnline`. None
 * of the three had a caller: every screen reads the local store through a
 * `lib/queries` loader instead, which can join across entities in one pass, and
 * `useOnline` lives beside the one composer that needs it. They are gone rather
 * than kept as an alternative nobody chose.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])

  return now
}
