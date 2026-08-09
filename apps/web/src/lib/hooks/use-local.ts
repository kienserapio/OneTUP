'use client'

import { useCallback, useEffect, useState } from 'react'
import { type EntityName, type StoredRecord, readAll } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'

/**
 * Reads an entity from the local store.
 *
 * This is the read path for every module: render from IndexedDB immediately,
 * revalidate in the background. `loading` is true only on the very first read
 * before the store has answered — which on a warm app is a few milliseconds,
 * and is the difference between the Today view appearing and the Today view
 * spinning.
 */
export function useLocal<T extends StoredRecord>(
  entity: EntityName,
  options: { revalidate?: boolean } = {},
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await readAll<T>(entity))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)))
    } finally {
      setLoading(false)
    }
  }, [entity])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (options.revalidate === false) return
    let cancelled = false
    void syncNow().then(() => {
      if (!cancelled) void reload()
    })
    return () => {
      cancelled = true
    }
  }, [options.revalidate, reload])

  return { data, loading, error, reload }
}

/** Reads several entities at once, for screens that join across them. */
export function useLocalMany<T extends Record<string, StoredRecord[]>>(
  entities: readonly EntityName[],
) {
  const [data, setData] = useState<Record<string, StoredRecord[]>>({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const entries = await Promise.all(
      entities.map(async (entity) => [entity, await readAll(entity)] as const),
    )
    setData(Object.fromEntries(entries))
    setLoading(false)
  }, [entities.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void reload()
  }, [reload])

  return { data: data as T, loading, reload }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return online
}

/**
 * A clock that ticks only as often as the caller needs.
 *
 * Urgency, "in 15 minutes", and the current-class highlight are all recomputed
 * on render rather than stored, so something has to move the clock — but a
 * per-second tick across a whole list is wasted work on a mid-range phone.
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
