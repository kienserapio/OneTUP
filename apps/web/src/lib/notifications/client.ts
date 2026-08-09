'use client'

import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * Web Push, from the browser's side.
 *
 * On iOS this only works from a home-screen install — Safari cannot deliver
 * push from a browser tab at all. A student who never installs simply never
 * hears from the app and concludes it is broken, so `pushSupport()` reports
 * that state distinctly rather than folding it into "denied".
 */

export type PushSupport =
  | 'ready'
  | 'needs_permission'
  | 'denied'
  | 'requires_install'
  | 'unsupported'

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'

  const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true

  if (isApple && !standalone) return 'requires_install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'

  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'needs_permission'
  return 'ready'
}

export async function enablePush(): Promise<{ ok: boolean; reason?: PushSupport }> {
  const support = pushSupport()
  if (support === 'unsupported' || support === 'denied' || support === 'requires_install') {
    return { ok: false, reason: support }
  }

  if (support === 'needs_permission') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }
  }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()

  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
      ) as BufferSource,
    }))

  const response = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  })

  return { ok: response.ok }
}

export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await fetch('/api/notifications/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  await subscription.unsubscribe()
}

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalised)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * Schedules the reminders for one deadline, replacing whatever was scheduled
 * before. Server-side rows are what actually fire, because something has to be
 * awake when the student's app is not.
 */
export async function scheduleDeadlineReminders(
  deadlineId: string,
  title: string,
  dueAt: string,
  offsets: readonly number[],
  courseCode?: string | null,
): Promise<void> {
  const supabase = supabaseBrowser()
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return

  await supabase
    .from('scheduled_notifications')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('entity', 'deadline')
    .eq('entity_id', deadlineId)
    .is('sent_at', null)

  const due = new Date(dueAt).getTime()
  const rows = offsets
    .map((offset) => ({ offset, fireAt: new Date(due - offset * 1000) }))
    // A "due in 72 hours" reminder for something due in two is noise that
    // teaches a student to ignore the channel.
    .filter((entry) => entry.fireAt.getTime() > Date.now())
    .map((entry) => ({
      user_id: userId,
      kind: `deadline_${entry.offset}` as const,
      entity: 'deadline',
      entity_id: deadlineId,
      fire_at: entry.fireAt.toISOString(),
      payload: {
        title: labelForOffset(entry.offset),
        body: courseCode ? `${title}, ${courseCode}` : title,
        url: `/deadlines/${deadlineId}`,
        tag: `deadline-${deadlineId}`,
      },
    }))

  if (rows.length > 0) {
    await supabase.from('scheduled_notifications').upsert(rows, {
      onConflict: 'user_id,kind,entity_id,fire_at',
    })
  }
}

export async function cancelDeadlineReminders(deadlineId: string): Promise<void> {
  const supabase = supabaseBrowser()
  await supabase
    .from('scheduled_notifications')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('entity', 'deadline')
    .eq('entity_id', deadlineId)
    .is('sent_at', null)
}

function labelForOffset(seconds: number): string {
  if (seconds >= 259_200) return 'Due in 3 days'
  if (seconds >= 86_400) return 'Due tomorrow'
  if (seconds >= 21_600) return 'Due in 6 hours'
  return 'Due soon'
}
