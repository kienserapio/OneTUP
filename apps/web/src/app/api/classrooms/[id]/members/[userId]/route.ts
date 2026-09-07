import { z } from 'zod'
import { errors } from '@/lib/api/errors'
import { authenticated, log, parseBody, segments } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Promote, hand over, remove.
 *
 * Every ability here crosses the `user_id = auth.uid()` line that 012's
 * membership policies draw, so each one is a security-definer function with its
 * own role check rather than a widened policy — a policy that let a rep edit a
 * membership row would also let them edit any of the other thirty.
 *
 * Removing is not a soft state. The trigger on `group_members` takes the
 * departing student's submission marks with them, so a removal is visible in
 * every log at the same moment it happens.
 */

export const runtime = 'nodejs'

const RoleChange = z.object({ role: z.enum(['owner', 'rep', 'member']) })

const MESSAGES: Record<string, string> = {
  'not permitted': "You don't have that in this classroom.",
  'not a member': "They're not in this classroom.",
  'the owner cannot be demoted': 'The owner keeps the classroom until they hand it over.',
  'the owner cannot be removed': 'The owner has to hand the classroom over first.',
  'use leave instead': 'To leave the classroom, use Leave classroom.',
  'unknown role': 'That is not a role.',
}

function idsFrom(request: Request): { groupId: string; userId: string } {
  const parts = segments(request)
  const groupId = parts[parts.indexOf('classrooms') + 1]
  const userId = parts[parts.indexOf('members') + 1]
  if (!groupId || !userId) throw errors.notFound()
  return { groupId, userId }
}

function translate(message: string): never {
  const known = Object.keys(MESSAGES).find((key) => message.includes(key))
  if (known) throw errors.forbidden(MESSAGES[known])
  throw errors.internal({ cause: message })
}

export const PATCH = authenticated(async (request) => {
  const { groupId, userId } = idsFrom(request)
  const { role } = await parseBody(request, RoleChange)

  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('set_member_role', {
    target_group: groupId,
    target_user: userId,
    new_role: role,
  })

  if (error) translate(error.message)

  log('info', 'classroom.role_changed', { group_id: groupId, role })

  return { role }
})

export const DELETE = authenticated(async (request) => {
  const { groupId, userId } = idsFrom(request)

  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('remove_classroom_member', {
    target_group: groupId,
    target_user: userId,
  })

  if (error) translate(error.message)

  log('info', 'classroom.member_removed', { group_id: groupId })

  return { removed: true }
})
