/**
 * Classrooms — the shared tracker, end to end against the real database.
 *
 * Where `classrooms.rls.test.ts` asks whether the wrong person is refused, this
 * asks whether the right one is served: a post published by one member reaches
 * a second member's tracker, a dismissal takes it off that student's list and
 * nobody else's, and the shared row is not touched by either.
 *
 * The tracker query itself is pure and lives in `@onetup/core`, so it is run
 * here over rows the database actually returned. That is the whole point of the
 * split: the projection is unit-tested, and this proves the rows it is given
 * are the rows a member really receives.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectTrackerItems } from '../../packages/core/src/index'
import type { ClassPost, ClassPostState } from '../../packages/core/src/index'

import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  configured,
  requireReachableProject,
} from './env'

/* The rate limiter runs on the service role and reads the same two variables
 * the app does, under the names the app uses. */
if (configured) {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= SUPABASE_SERVICE_ROLE_KEY
}

describe.skipIf(!configured)('Classrooms: the shared tracker', () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const password = `Int-${stamp}-Pw!`
  const sectionCode = `BSCS-2A-M-${stamp}`.slice(0, 40)

  let admin: SupabaseClient
  let ana: SupabaseClient
  let ben: SupabaseClient

  let anaId = ''
  let benId = ''
  let groupId = ''
  let termId = ''
  let postId = ''

  beforeAll(async () => {
    /* Say what is wrong in one line, rather than in a GoTrue stack trace. */
    await requireReachableProject()

    const { createClient } = await import('@supabase/supabase-js')
    const clientOptions = {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }

    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, clientOptions)

    for (const person of [
      { label: 'ana', name: 'Ana Reyes' },
      { label: 'ben', name: 'Ben Cruz' },
    ] as const) {
      const email = `int-${person.label}-${stamp}@example.com`
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: person.name },
      })
      if (error) throw error

      const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, clientOptions)
      const signIn = await client.auth.signInWithPassword({ email, password })
      if (signIn.error) throw signIn.error

      if (person.label === 'ana') {
        anaId = data.user!.id
        ana = client
      } else {
        benId = data.user!.id
        ben = client
      }
    }

    const term = await admin
      .from('terms')
      .select('id')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle()
    if (term.error) throw term.error
    termId = term.data!.id

    const group = await ana
      .from('groups')
      .insert({
        name: sectionCode,
        kind: 'classroom',
        term_id: termId,
        section_code: sectionCode,
        program_code: 'BSCS',
        year_level: 2,
        campus: 'M',
        created_by: anaId,
      })
      .select('id')
      .single()
    if (group.error) throw group.error
    groupId = group.data.id

    await ana.from('group_members').insert({ group_id: groupId, user_id: anaId, role: 'owner' })

    const request = await ben
      .from('group_join_requests')
      .insert({ group_id: groupId, user_id: benId, claimed_full_name: 'Ben Cruz' })
      .select('id')
      .single()
    if (request.error) throw request.error

    const decided = await ana.rpc('decide_join_request', {
      request: request.data.id,
      approve: true,
    })
    if (decided.error) throw decided.error
  })

  afterAll(async () => {
    for (const id of [anaId, benId]) {
      if (!id) continue
      try {
        await admin.auth.admin.deleteUser(id)
      } catch {
        // Reported by the next run as a stray account rather than failing here.
      }
    }
  })

  /** The tracker as a member's own client would assemble it. */
  async function trackerFor(client: SupabaseClient, userId: string) {
    const [{ data: posts }, { data: states }] = await Promise.all([
      client.from('class_posts').select('*'),
      client.from('class_post_states').select('*'),
    ])

    return selectTrackerItems({
      posts: (posts ?? []) as ClassPost[],
      states: (states ?? []) as ClassPostState[],
      sectionByGroup: new Map([[groupId, sectionCode]]),
      courseCodeById: new Map(),
      userId,
    })
  }

  it('puts a published post with a due date into a second member’s tracker', async () => {
    const published = await ana
      .from('class_posts')
      .insert({
        group_id: groupId,
        author_id: anaId,
        kind: 'task',
        title: 'Case Study 2',
        due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        content_hash: `hash-${stamp}`,
      })
      .select('id, updated_at')
      .single()
    expect(published.error).toBeNull()
    postId = published.data!.id

    const bens = await trackerFor(ben, benId)
    expect(bens.map((item) => item.id)).toContain(postId)
    expect(bens.find((item) => item.id === postId)?.sectionCode).toBe(sectionCode)
    expect(bens.find((item) => item.id === postId)?.status).toBe('open')
  })

  it('takes it off the tracker of whoever dismissed it, and leaves the post alone', async () => {
    const before = await admin
      .from('class_posts')
      .select('title, due_at, status, updated_at')
      .eq('id', postId)
      .single()

    const dismissed = await ben
      .from('class_post_states')
      .insert({ post_id: postId, user_id: benId, status: 'dismissed' })
    expect(dismissed.error).toBeNull()

    expect((await trackerFor(ben, benId)).map((item) => item.id)).not.toContain(postId)
    // Ana never touched it, so hers is unchanged.
    expect((await trackerFor(ana, anaId)).map((item) => item.id)).toContain(postId)

    const after = await admin
      .from('class_posts')
      .select('title, due_at, status, updated_at')
      .eq('id', postId)
      .single()
    expect(after.data).toEqual(before.data)
  })

  it('puts it back when the student undoes the dismissal', async () => {
    const restored = await ben
      .from('class_post_states')
      .update({ status: 'open' })
      .eq('post_id', postId)
      .eq('user_id', benId)
    expect(restored.error).toBeNull()

    expect((await trackerFor(ben, benId)).map((item) => item.id)).toContain(postId)
  })

  it('takes a hidden post out of everyone’s tracker without deleting it', async () => {
    const hidden = await ana
      .from('class_posts')
      .update({ status: 'hidden', hidden_by: anaId })
      .eq('id', postId)
      .select('id')
    expect(hidden.error).toBeNull()
    expect(hidden.data).toHaveLength(1)

    expect((await trackerFor(ben, benId)).map((item) => item.id)).not.toContain(postId)

    const restored = await ana
      .from('class_posts')
      .update({ status: 'published', hidden_by: null })
      .eq('id', postId)
    expect(restored.error).toBeNull()
    expect((await trackerFor(ben, benId)).map((item) => item.id)).toContain(postId)
  })

  it('treats the same message shared twice as one post', async () => {
    const duplicate = await ben.from('class_posts').insert({
      group_id: groupId,
      author_id: benId,
      kind: 'task',
      title: 'Case Study 2 (shared again)',
      content_hash: `hash-${stamp}`,
    })
    expect(duplicate.error?.code).toBe('23505')
  })

  it('refuses a member’s post once the classroom is rep-only', async () => {
    const locked = await ana
      .from('groups')
      .update({ who_can_post: 'rep' })
      .eq('id', groupId)
      .select('id')
    expect(locked.error).toBeNull()

    const refused = await ben.from('class_posts').insert({
      group_id: groupId,
      author_id: benId,
      title: 'Members cannot post here now',
    })
    expect(refused.error).not.toBeNull()

    // The rep still can, which is what "rep-only" means.
    const allowed = await ana
      .from('class_posts')
      .insert({ group_id: groupId, author_id: anaId, title: 'Rep can still post' })
      .select('id')
      .single()
    expect(allowed.error).toBeNull()

    await ana.from('class_posts').delete().eq('id', allowed.data!.id)
    await ana.from('groups').update({ who_can_post: 'anyone' }).eq('id', groupId)
  })

  it('stops new posts once the classroom is archived', async () => {
    const archived = await ana
      .from('groups')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', groupId)
      .select('id')
    expect(archived.error).toBeNull()

    const refused = await ben.from('class_posts').insert({
      group_id: groupId,
      author_id: benId,
      title: 'Posted after the term ended',
    })
    expect(refused.error).not.toBeNull()

    // Everything already posted is still readable, which is the point of
    // archiving rather than deleting.
    expect((await trackerFor(ben, benId)).map((item) => item.id)).toContain(postId)

    await ana.from('groups').update({ archived_at: null }).eq('id', groupId)
  })

  it('refuses the eleventh post in an hour', async () => {
    const { enforceLimit, recordAttempt } = await import('../../apps/web/src/lib/api/rate-limit')

    for (let attempt = 1; attempt <= 10; attempt++) {
      await expect(enforceLimit(benId, 'class_post')).resolves.toMatchObject({
        remaining: 11 - attempt,
      })
      await recordAttempt(benId, 'class_post', 'ok')
    }

    await expect(enforceLimit(benId, 'class_post')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })

    // A different bucket is a different budget: being noisy in one classroom
    // must not stop the same student asking to join another.
    await expect(enforceLimit(benId, 'class_join')).resolves.toMatchObject({ remaining: 10 })
  })
})
