import { authenticated, log } from '@/lib/api/handler'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { errors } from '@/lib/api/errors'

/**
 * Account deletion.
 *
 * Deleting the auth user cascades through every user-owned table, because every
 * one of them declares `references auth.users(id) on delete cascade`. Soft
 * deletion is not used anywhere in this schema: a student who deletes their data
 * has actually deleted it, which is the whole point of the commitment.
 *
 * The service role is required — a student cannot delete their own auth record
 * through the anon key — so the request must carry the exact confirmation word
 * the interface asked for.
 */
export const POST = authenticated(async (request, { user, requestId }) => {
  const body = (await request.json().catch(() => ({}))) as { confirm?: string }

  if (body.confirm !== 'DELETE') {
    throw errors.validation('Type DELETE to confirm.')
  }

  const admin = supabaseAdmin()
  const { error } = await admin.auth.admin.deleteUser(user.id)

  if (error) {
    throw errors.internal({ reason: error.message })
  }

  // The user id is already gone; this line records that it happened, and
  // carries nothing about what was in the account.
  log('info', 'account.deleted', { request_id: requestId })

  return { deleted: true }
})
