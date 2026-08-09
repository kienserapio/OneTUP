import { z } from 'zod'
import { authenticated, parseBody } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'

const Subscription = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

export const POST = authenticated(async (request, { user }) => {
  const body = await parseBody(request, Subscription)
  const supabase = await supabaseServer()

  const { data, error } = await supabase
    .from('notification_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth_key: body.keys.auth,
        user_agent: request.headers.get('user-agent')?.slice(0, 200) ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    )
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: data.id }
})

const Unsubscribe = z.object({ endpoint: z.string().url() })

export const DELETE = authenticated(async (request) => {
  const body = await parseBody(request, Unsubscribe)
  const supabase = await supabaseServer()
  await supabase.from('notification_subscriptions').delete().eq('endpoint', body.endpoint)
  return { ok: true }
})
