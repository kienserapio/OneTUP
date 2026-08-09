import { errors } from '@/lib/api/errors'
import { authenticated } from '@/lib/api/handler'
import { enforceLimit } from '@/lib/api/rate-limit'
import { supabaseServer } from '@/lib/supabase/server'
import { CAPABILITIES, type CapabilityName } from '@/lib/ai/capabilities'
import { runCapability } from '@/lib/ai/gateway'

/**
 * The single entry point to the AI gateway.
 *
 * `meta.labelled` is always true here, because a model produced part of the
 * output by definition. Computed answers do not come through this route at all
 * — that is the distinction the interface renders (AI spec §8.3).
 */
export const runtime = 'nodejs'
export const maxDuration = 60

export const POST = authenticated(async (request, { user }) => {
  const url = new URL(request.url)
  const name = url.pathname.split('/').pop() as CapabilityName

  if (!name || !(name in CAPABILITIES)) {
    throw errors.notFound('No such capability.')
  }

  await enforceLimit(user.id, 'ai')

  const body = (await request.json().catch(() => null)) as { input?: unknown } | null
  if (!body || body.input === undefined) {
    throw errors.validation('Send an object with an `input` field.')
  }

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('student_number, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const result = await runCapability(name, body.input, {
    userId: user.id,
    redaction: {
      studentNumber: profile?.student_number ?? null,
      fullName: profile?.full_name ?? null,
      email: user.email ?? null,
    },
  })

  return {
    capability: name,
    output: result.output,
    meta: result.meta,
  }
})
