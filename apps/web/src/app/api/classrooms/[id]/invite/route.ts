import { randomBytes } from 'node:crypto'
import { errors } from '@/lib/api/errors'
import { authenticated, log, segments } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Rotating the invite code.
 *
 * A code pasted into the wrong group chat is a thing that will happen, and the
 * only remedy that works is a new one. The old link stops working the moment
 * this returns — there is no grace period, because the whole reason to rotate
 * is that the old code is somewhere it should not be.
 *
 * `groups_update_rep` decides who may do this. A member's update matches zero
 * rows, which is reported as a refusal rather than as a silent success.
 */

export const runtime = 'nodejs'

export const POST = authenticated(async (request) => {
  const parts = segments(request)
  const groupId = parts[parts.indexOf('classrooms') + 1]
  if (!groupId) throw errors.notFound()

  const supabase = await supabaseServer()

  const { data, error } = await supabase
    .from('groups')
    .update({ invite_code: randomBytes(6).toString('hex') })
    .eq('id', groupId)
    .eq('kind', 'classroom')
    .select('invite_code')

  if (error) throw errors.internal({ cause: error.message })
  if (!data || data.length === 0) {
    throw errors.forbidden('Only the class rep can change the invite link.')
  }

  log('info', 'classroom.invite_rotated', { group_id: groupId })

  return { invite_code: data[0].invite_code }
})
