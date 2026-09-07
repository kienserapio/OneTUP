import { errors } from '@/lib/api/errors'
import { authenticated, log, segments } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * The stranded classroom.
 *
 * An owner who simply stops opening the app holds a section for a semester:
 * nobody can approve a join, nobody can rotate a leaked invite link, and the
 * class quietly goes back to the group chat. After sixty days with no owner
 * activity — a post they wrote, a request they decided, or failing both, the
 * day they created it — any rep may take it over.
 *
 * The old owner becomes a rep rather than being removed. They did not do
 * anything wrong; they stopped opening the app.
 */

export const runtime = 'nodejs'

const MESSAGES: Record<string, string> = {
  'not permitted': 'Only a rep of this classroom can take it over.',
  'you already own this classroom': 'You already own this classroom.',
  'the owner has been active in the last 60 days':
    'The owner has used this classroom in the last 60 days, so it is still theirs.',
  'no owner to claim from': 'This classroom has no owner to take over from.',
}

export const POST = authenticated(async (request) => {
  const parts = segments(request)
  const groupId = parts[parts.indexOf('classrooms') + 1]
  if (!groupId) throw errors.notFound()

  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('claim_classroom_ownership', { target_group: groupId })

  if (error) {
    const known = Object.keys(MESSAGES).find((key) => error.message.includes(key))
    if (known) throw errors.forbidden(MESSAGES[known])
    throw errors.internal({ cause: error.message })
  }

  log('info', 'classroom.ownership_claimed', { group_id: groupId })

  return { claimed: true }
})
