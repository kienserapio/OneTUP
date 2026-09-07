import { z } from 'zod'
import { errors } from '@/lib/api/errors'
import { authenticated, log, parseBody, segments } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Editing a post, and hiding one.
 *
 * Two different people are served by the same route, and RLS keeps them apart:
 * `class_posts_edit` lets an author change their own post and a rep hide
 * anyone's. Neither can do the other's half by accident, because the policy is
 * the check.
 *
 * A change to the words sets `edited_at`, and the row then says *edited*. There
 * is no edit history — this is a section tracker, not a wiki.
 */

export const runtime = 'nodejs'

const Edit = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    detail: z.string().trim().max(2000).nullable().optional(),
    due_at: z.string().datetime({ offset: true }).nullable().optional(),
    pinned: z.boolean().optional(),
    status: z.enum(['published', 'hidden']).optional(),
    /** Turning a log off is allowed. Turning it on is not, and a trigger says so. */
    requires_submission: z.literal(false).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change.' })

export const PATCH = authenticated(async (request, { user }) => {
  const parts = segments(request)
  const postId = parts[parts.indexOf('posts') + 1]
  if (!postId) throw errors.notFound()

  const body = await parseBody(request, Edit)
  const supabase = await supabaseServer()

  const changesContent =
    body.title !== undefined || body.detail !== undefined || body.due_at !== undefined

  const patch = {
    ...body,
    ...(changesContent ? { edited_at: new Date().toISOString() } : {}),
    ...(body.status === 'hidden' ? { hidden_by: user.id } : {}),
    ...(body.status === 'published' ? { hidden_by: null } : {}),
  }

  const { data, error } = await supabase
    .from('class_posts')
    .update(patch)
    .eq('id', postId)
    .select('id, title, status, edited_at, requires_submission')

  if (error?.message.includes('requires_submission cannot be enabled')) {
    throw errors.forbidden(
      'A submission list can be turned off, but not turned on after the post went out.',
    )
  }
  if (error) throw errors.internal({ cause: error.message })
  if (!data || data.length === 0) {
    throw errors.forbidden('Only the person who posted this, or the class rep, can change it.')
  }

  if (body.status) log('info', body.status === 'hidden' ? 'class_post.hidden' : 'class_post.unhidden', { post_id: postId })

  return { post: data[0] }
})
