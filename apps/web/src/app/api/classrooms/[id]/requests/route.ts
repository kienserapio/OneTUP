import { z } from 'zod'
import { errors } from '@/lib/api/errors'
import { authenticated, log, parseBody, segments } from '@/lib/api/handler'
import { enforceLimit, recordAttempt } from '@/lib/api/rate-limit'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Asking to join.
 *
 * The claim is frozen here — name, student number, section label as they read
 * at this moment — because a profile edited afterwards must not change what the
 * rep was looking at when they decided.
 *
 * One classroom per student per term is a database index, and it fires at
 * *approval* rather than at request time. Catching it here means the student
 * finds out now, while they can still leave the other one, rather than the rep
 * finding out later in the form of an error on a name they recognised.
 */

export const runtime = 'nodejs'

const JoinRequest = z.object({
  message: z.string().trim().max(200).optional(),
})

export const POST = authenticated(async (request, { user }) => {
  const parts = segments(request)
  const groupId = parts[parts.indexOf('classrooms') + 1]
  if (!groupId) throw errors.notFound()

  const body = await parseBody(request, JoinRequest)
  await enforceLimit(user.id, 'class_join')

  const supabase = await supabaseServer()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, student_number, section_label')
    .eq('id', user.id)
    .maybeSingle()

  const { data: existing } = await supabase
    .from('group_members')
    .select('group_id, term_id')
    .eq('user_id', user.id)
    .not('term_id', 'is', null)

  const already = (existing ?? []).find((row) => row.group_id === groupId)
  if (already) throw errors.validation('You are already in this classroom.')

  if ((existing ?? []).length > 0) {
    throw errors.validation(
      'You are in another classroom this term. Leave that one first, then ask to join this one.',
      { group_id: existing![0].group_id },
    )
  }

  const { data, error } = await supabase
    .from('group_join_requests')
    .insert({
      group_id: groupId,
      user_id: user.id,
      status: 'pending',
      claimed_full_name: profile?.full_name ?? null,
      claimed_student_number: profile?.student_number ?? null,
      claimed_section_code: profile?.section_label ?? null,
      message: body.message ?? null,
    })
    .select('id, status, created_at')
    .single()

  /* One request per person per classroom, and a decided one is not replaced.
   * A rep who declined somebody should not have that decision quietly undone
   * by the same person tapping again; they talk, and the rep re-decides from
   * the members screen. The student is told which of the two states they are
   * in rather than seeing a constraint name. */
  if (error?.code === '23505') {
    const { data: current } = await supabase
      .from('group_join_requests')
      .select('id, status, created_at')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    return { request: current, already: true }
  }

  if (error) throw errors.internal({ cause: error.message })

  await recordAttempt(user.id, 'class_join', 'ok')

  log('info', 'classroom.join_requested', { group_id: groupId })

  return { request: data, already: false }
})
