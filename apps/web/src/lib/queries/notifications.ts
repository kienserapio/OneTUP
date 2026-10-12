'use client'

import type { Announcement, SuspensionAdvisory } from '@onetup/core'
import { readAll, type StoredRecord } from '@/lib/offline/db'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { Tone } from '@/components/ui/icon-tile'
import { loadToday } from './today'

/**
 * The notifications feed.
 *
 * Not a new store of anything. Every item here is a fact the app already
 * holds — Today's due and overdue lists, its cut warnings and advisory, the
 * synced announcements and departure plans — gathered into one list so a
 * student can see in one place what the app would have nudged them about.
 * The only rows read from the server are the threshold alerts the device has
 * already sent itself, which is the one kind Today does not compute live.
 *
 * Each item carries a `key` that is stable for as long as the thing it reports
 * is unchanged, which is what "read" is tracked against.
 */

export type NotificationKind =
  'overdue' | 'due' | 'cuts' | 'advisory' | 'announcement' | 'departure' | 'alert'

export interface NotificationItem {
  key: string
  kind: NotificationKind
  tone: Tone
  title: string
  detail: string
  /** When it happened, or — for something upcoming — when it will. ISO. */
  at: string
  /** Shown instead of a relative time, for a state that has no moment. */
  when?: string
  href: string
}

const WEEK_MS = 7 * 86_400_000

export async function loadNotifications(now = new Date()): Promise<NotificationItem[]> {
  const [today, announcements, plans, alerts] = await Promise.all([
    loadToday(now),
    readAll<Announcement & { id: string }>('announcements'),
    readAll<DeparturePlan & StoredRecord>('departure_plans'),
    loadSentAlerts(now),
  ])

  const items: NotificationItem[] = []

  for (const item of today.overdue) {
    items.push({
      key: `overdue:${item.id}`,
      kind: 'overdue',
      tone: 'crimson',
      title: 'Overdue',
      detail: item.title,
      at: item.dueAt,
      href: item.href,
    })
  }

  for (const item of today.dueSoon) {
    items.push({
      key: `due:${item.id}:${item.dueAt}`,
      kind: 'due',
      tone: 'crimson',
      title: 'Due soon',
      detail: item.title,
      at: item.dueAt,
      href: item.href,
    })
  }

  // A warning has no timestamp of its own; it is true as of today.
  const startOfToday = `${today.date}T00:00:00+08:00`
  for (const warning of today.attendanceWarnings) {
    items.push({
      key: `cuts:${warning.code}:${warning.state}:${warning.remaining}`,
      kind: 'cuts',
      tone: warning.remaining === 0 ? 'crimson' : 'green',
      title: warning.remaining === 0 ? `At the limit in ${warning.code}` : `Watch your cuts`,
      detail:
        warning.remaining === 0
          ? 'One more absence affects your grade'
          : `${warning.remaining} absence${warning.remaining === 1 ? '' : 's'} left in ${warning.code}`,
      at: startOfToday,
      when: 'today',
      href: '/subjects',
    })
  }

  if (today.advisory) {
    const advisory: SuspensionAdvisory = today.advisory
    items.push({
      key: `advisory:${advisory.id}`,
      kind: 'advisory',
      tone: 'gray',
      title: 'Class advisory',
      detail: advisory.headline,
      at: advisory.created_at,
      href: '/today',
    })
  }

  for (const announcement of announcements) {
    const created = Date.parse(announcement.created_at ?? '')
    if (!(created >= now.getTime() - WEEK_MS)) continue
    items.push({
      key: `announcement:${announcement.id}`,
      kind: 'announcement',
      tone: 'blue',
      title: 'Announcement',
      detail: announcement.summary,
      at: announcement.created_at,
      href: '/announcements',
    })
  }

  const plan = plans.find((row) => row.plan_date === today.date)
  if (plan && Date.parse(plan.leave_at) > now.getTime()) {
    items.push({
      key: `departure:${plan.id}:${plan.leave_at}`,
      kind: 'departure',
      tone: 'blue',
      title: `Leave by ${clock(plan.leave_at)}`,
      detail: `For your ${clock(plan.class_start)} class`,
      at: plan.leave_at,
      href: '/commute/plan',
    })
  }

  items.push(...alerts)

  return items.sort(
    (a, b) =>
      Math.abs(Date.parse(a.at) - now.getTime()) - Math.abs(Date.parse(b.at) - now.getTime()),
  )
}

interface DeparturePlan {
  plan_date: string
  class_start: string
  leave_at: string
}

/**
 * GWA and cut alerts the device has already fired at itself. Deadline
 * reminders are left out: the live due and overdue items above say the same
 * thing, and say it with today's numbers rather than the ones at send time.
 */
async function loadSentAlerts(now: Date): Promise<NotificationItem[]> {
  try {
    const { data } = await supabaseBrowser()
      .from('scheduled_notifications')
      .select('id, entity, entity_id, sent_at, payload')
      .eq('kind', 'threshold_breach')
      .eq('entity', 'threshold')
      .not('sent_at', 'is', null)
      .gte('sent_at', new Date(now.getTime() - WEEK_MS).toISOString())
      .order('sent_at', { ascending: false })
      .limit(10)

    return (data ?? []).map((row) => {
      const payload = (row.payload ?? {}) as { title?: string; body?: string; url?: string }
      return {
        key: `alert:${row.id}`,
        kind: 'alert' as const,
        tone: 'gray' as const,
        title: payload.title ?? 'Grade alert',
        detail: payload.body ?? '',
        at: row.sent_at as string,
        href: payload.url ?? '/subjects/gwa',
      }
    })
  } catch {
    // Offline, or signed out mid-request. The rest of the feed is local.
    return []
  }
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

/* --- Read state ------------------------------------------------------------
 * There is no server-side read state for any of these sources, and adding a
 * table for it would be the wrong trade: a key list in this browser is enough
 * for a badge. Bounded, so it cannot grow forever. */

const SEEN_KEY = 'onetup:notifications-seen'
const SEEN_LIMIT = 300

export function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function markSeen(keys: string[]): Set<string> {
  const seen = readSeen()
  for (const key of keys) seen.add(key)
  const list = [...seen].slice(-SEEN_LIMIT)
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(list))
  } catch {
    // Private mode or storage blocked: the badge simply comes back next load.
  }
  return new Set(list)
}

/** "in 2h", "5m ago", "yesterday" — short, because it sits beside a title. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Date.parse(iso) - now
  const abs = Math.abs(diff)
  const minutes = Math.round(abs / 60_000)
  const hours = Math.round(abs / 3_600_000)
  const days = Math.round(abs / 86_400_000)

  const span =
    minutes < 1 ? null : minutes < 60 ? `${minutes}m` : hours < 24 ? `${hours}h` : `${days}d`
  if (!span) return 'now'
  if (diff < 0 && days === 1 && hours >= 24) return 'yesterday'
  return diff > 0 ? `in ${span}` : `${span} ago`
}
