import webpush from 'web-push'
import { errors } from '@/lib/api/errors'
import { log, publicRoute } from '@/lib/api/handler'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Sends the notifications that have come due.
 *
 * Designed to be called on a schedule (a cron job hitting this endpoint every
 * minute or two), authenticated by the worker secret rather than by a student
 * session — nobody is signed in at 4:55 AM when a wake alarm has to fire.
 *
 * Quiet hours suppress everything except the wake alarm and a suspension. A
 * suppressed notification is not lost: it is left unsent and surfaces in the
 * in-app catch-up instead.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const ALWAYS_DELIVER = new Set(['wake_alarm', 'suspension'])
const BATCH_SIZE = 200

export const POST = publicRoute(async (request) => {
  const provided = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!process.env.WORKER_SECRET || provided !== process.env.WORKER_SECRET) {
    throw errors.forbidden('Not permitted.')
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:hello@onetup.ph',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    process.env.VAPID_PRIVATE_KEY ?? '',
  )

  const admin = supabaseAdmin()

  const { data: due } = await admin
    .from('scheduled_notifications')
    .select('id, user_id, kind, payload, fire_at')
    .is('sent_at', null)
    .is('cancelled_at', null)
    .lte('fire_at', new Date().toISOString())
    .order('fire_at')
    .limit(BATCH_SIZE)

  if (!due || due.length === 0) return { sent: 0, suppressed: 0, failed: 0 }

  const userIds = [...new Set(due.map((row) => row.user_id))]

  const [{ data: preferences }, { data: subscriptions }] = await Promise.all([
    admin
      .from('user_preferences')
      .select('user_id, quiet_hours_start, quiet_hours_end, notification_settings')
      .in('user_id', userIds),
    admin
      .from('notification_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth_key')
      .in('user_id', userIds),
  ])

  const prefsByUser = new Map((preferences ?? []).map((row) => [row.user_id, row]))
  const subsByUser = new Map<string, typeof subscriptions>()
  for (const subscription of subscriptions ?? []) {
    const list = subsByUser.get(subscription.user_id) ?? []
    list.push(subscription)
    subsByUser.set(subscription.user_id, list)
  }

  let sent = 0
  let suppressed = 0
  let failed = 0
  const delivered: string[] = []
  const staleSubscriptions: string[] = []

  for (const notification of due) {
    const preference = prefsByUser.get(notification.user_id)
    const kind = notification.kind

    if (
      !ALWAYS_DELIVER.has(kind) &&
      preference &&
      inQuietHours(preference.quiet_hours_start, preference.quiet_hours_end)
    ) {
      suppressed += 1
      continue
    }

    const settings = (preference?.notification_settings ?? {}) as Record<string, boolean>
    if (settings[kind] === false && !ALWAYS_DELIVER.has(kind)) {
      suppressed += 1
      continue
    }

    const targets = subsByUser.get(notification.user_id) ?? []
    if (targets.length === 0) {
      // No device registered. Leave it unsent so the catch-up list still shows
      // it, rather than marking it delivered to nobody.
      continue
    }

    const payload = JSON.stringify({ ...(notification.payload as object), kind })

    for (const target of targets) {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth_key },
          },
          payload,
          { TTL: 3600, urgency: kind === 'wake_alarm' ? 'high' : 'normal' },
        )
        sent += 1
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        // 404/410 mean the browser threw the subscription away. Keeping it would
        // make every future dispatch slower and noisier for no benefit.
        if (status === 404 || status === 410) staleSubscriptions.push(target.id)
        else failed += 1
      }
    }

    delivered.push(notification.id)
  }

  if (delivered.length > 0) {
    await admin
      .from('scheduled_notifications')
      .update({ sent_at: new Date().toISOString() })
      .in('id', delivered)
  }

  if (staleSubscriptions.length > 0) {
    await admin.from('notification_subscriptions').delete().in('id', staleSubscriptions)
  }

  log('info', 'notifications.dispatched', { sent, suppressed, failed, due: due.length })
  return { sent, suppressed, failed, considered: due.length }
})

/** Quiet hours legitimately wrap midnight, so the comparison has two shapes. */
function inQuietHours(start: string, end: string): boolean {
  const now = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(11, 16)
  const from = start.slice(0, 5)
  const to = end.slice(0, 5)
  return from <= to ? now >= from && now < to : now >= from || now < to
}
