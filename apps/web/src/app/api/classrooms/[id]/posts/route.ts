import { z } from 'zod'
import { contentHash } from '@onetup/core'
import { errors } from '@/lib/api/errors'
import { authenticated, log, parseBody, segments } from '@/lib/api/handler'
import { enforceLimit, recordAttempt } from '@/lib/api/rate-limit'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Publishing to the classroom.
 *
 * A published post reaches every member's tracker, which is exactly why this is
 * the one classroom write that is metered and deduplicated. Fifteen classmates
 * sharing one quiz announcement is one post, and the dedupe index in the
 * database is the authority — the check here only turns the resulting `23505`
 * into a useful answer.
 *
 * `requires_submission` is decided here and nowhere else. It cannot be enabled
 * afterwards (a trigger refuses), because a log turned on later would be a list
 * about people who answered under different terms.
 */

export const runtime = 'nodejs'

const KINDS = ['note', 'task', 'exam', 'quiz', 'suspension', 'room_change'] as const

const NewPost = z.object({
  title: z.string().trim().min(1).max(140),
  detail: z.string().trim().max(2000).optional(),
  kind: z.enum(KINDS).default('note'),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  course_id: z.uuid().nullable().optional(),
  requires_submission: z.boolean().default(false),
  pinned: z.boolean().default(false),
  submission_id: z.uuid().nullable().optional(),
  /** The message this came from, when it came through the share sheet. */
  source_text: z.string().max(8000).optional(),
})

export const POST = authenticated(async (request, { user }) => {
  const parts = segments(request)
  const groupId = parts[parts.indexOf('classrooms') + 1]
  if (!groupId) throw errors.notFound()

  const body = await parseBody(request, NewPost)
  await enforceLimit(user.id, 'class_post')

  const supabase = await supabaseServer()

  /* Hashed from the shared message where there is one, and from the post's own
   * words otherwise — so two people pasting the same announcement collide, and
   * two people typing the same reminder do too. */
  const hash = contentHash(body.source_text?.trim() || `${body.title}\n${body.detail ?? ''}`)

  const { data, error } = await supabase
    .from('class_posts')
    .insert({
      group_id: groupId,
      author_id: user.id,
      submission_id: body.submission_id ?? null,
      course_id: body.course_id ?? null,
      kind: body.kind,
      title: body.title,
      detail: body.detail ?? null,
      due_at: body.due_at ?? null,
      requires_submission: body.requires_submission,
      pinned: body.pinned,
      content_hash: hash,
    })
    .select('id, title, due_at, created_at')
    .single()

  if (error?.code === '23505') {
    const { data: existing } = await supabase
      .from('class_posts')
      .select('id, title, created_at')
      .eq('group_id', groupId)
      .eq('content_hash', hash)
      .maybeSingle()

    return { post: null, duplicate_of: existing?.id ?? null, existing_title: existing?.title ?? null }
  }

  if (error?.code === '42501') {
    throw errors.forbidden('Only the class rep can post in this classroom.')
  }
  if (error) throw errors.internal({ cause: error.message })

  /* The limiter counts what was recorded, not what was attempted — so a post
   * that actually went out is what fills the bucket. A duplicate, a refusal
   * and a validation failure all cost nothing, which is right: none of them
   * reached anybody's tracker. */
  await recordAttempt(user.id, 'class_post', 'ok')

  log('info', 'class_post.published', {
    group_id: groupId,
    post_id: data.id,
    has_due_date: Boolean(data.due_at),
    requires_submission: body.requires_submission,
  })

  return { post: data, duplicate_of: null }
})
