import { z } from 'zod'
import { errors } from '@/lib/api/errors'
import { authenticated, log, parseBody, segments } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Approving or declining someone.
 *
 * All of it happens inside `decide_join_request`, which is where it has to be:
 * admitting a member is an insert *for another user*, and the membership row
 * and the decision must land in the same transaction or a classroom ends up
 * holding a decided request with nobody admitted.
 *
 * The function raises sentences rather than codes, and they are re-thrown here
 * as the student-facing message — `not permitted`, `already decided`, and the
 * one that matters most, `already in a classroom this term`, which is the rep
 * finding out that the person they recognised joined another section while the
 * request was sitting in the queue.
 */

export const runtime = 'nodejs'

const Decision = z.object({ approve: z.boolean() })

const MESSAGES: Record<string, string> = {
  'not permitted': 'Only the class rep can decide who joins.',
  'already decided': 'Someone has already answered this request.',
  'join request not found': "That request isn't there any more.",
  'already in a classroom this term':
    'They joined another classroom while this was waiting. They will need to leave it first.',
}

export const PATCH = authenticated(async (request) => {
  const parts = segments(request)
  const requestId = parts[parts.indexOf('requests') + 1]
  if (!requestId) throw errors.notFound()

  const { approve } = await parseBody(request, Decision)

  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('decide_join_request', {
    request: requestId,
    approve,
  })

  if (error) {
    const known = Object.keys(MESSAGES).find((key) => error.message.includes(key))
    if (known) throw errors.forbidden(MESSAGES[known])
    throw errors.internal({ cause: error.message })
  }

  log('info', 'classroom.join_decided', { approved: approve })

  return { decided: approve ? 'approved' : 'rejected' }
})
