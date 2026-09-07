/**
 * Classrooms — the access boundary, tested from outside.
 *
 * 12-CLASSROOMS-PLAN.md §9 makes one promise that is easy to state and easy to
 * erode: a classmate sees when you marked a piece of work submitted, on a post
 * whose author asked for that, and nothing else — not your attendance, not your
 * grades, not your state on any other post. Every case below is written as *the
 * wrong person gets nothing*, because a policy that is merely never called by
 * the client is not a boundary.
 *
 * Three accounts: Ana owns the classroom, Ben is a member, Cy is outside it.
 *
 * The suite skips itself cleanly when the Supabase environment is absent, so
 * `pnpm test` works on a machine that has never seen a `.env`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  configured,
  requireReachableProject,
} from './env'

describe.skipIf(!configured)('RLS: classrooms', () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const password = `Cls-${stamp}-Pw!`

  /* Unique per run: the classroom index is one live row per section per term,
   * and a leftover from a failed run would otherwise fail every later one. */
  const sectionCode = `BSCS-4B-M-${stamp}`.slice(0, 40)
  const rivalCode = `BSIT-3A-T-${stamp}`.slice(0, 40)

  let admin: SupabaseClient
  let anon: SupabaseClient
  let ana: SupabaseClient
  let ben: SupabaseClient
  let cy: SupabaseClient

  let anaId = ''
  let benId = ''
  let cyId = ''

  let termId = ''
  let groupId = ''
  let inviteCode = ''
  let rivalGroupId = ''

  /** A post whose author asked for a log, and one who did not. */
  let loggedPostId = ''
  let quietPostId = ''

  beforeAll(async () => {
    /* Say what is wrong in one line, rather than in a GoTrue stack trace. */
    await requireReachableProject()

    const { createClient } = await import('@supabase/supabase-js')
    const clientOptions = {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }

    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, clientOptions)
    anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, clientOptions)

    const people = [
      { label: 'ana', name: 'Ana Reyes' },
      { label: 'ben', name: 'Ben Cruz' },
      { label: 'cy', name: 'Cy dela Peña' },
    ] as const

    for (const person of people) {
      const email = `cls-${person.label}-${stamp}@example.com`
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: person.name },
      })
      if (error) throw error
      const id = data.user?.id ?? ''

      const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, clientOptions)
      const signIn = await client.auth.signInWithPassword({ email, password })
      if (signIn.error) throw signIn.error

      if (person.label === 'ana') {
        anaId = id
        ana = client
      } else if (person.label === 'ben') {
        benId = id
        ben = client
      } else {
        cyId = id
        cy = client
      }
    }

    const term = await admin
      .from('terms')
      .select('id')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle()
    if (term.error) throw term.error
    if (!term.data) throw new Error('No current term is seeded; run the migrations first.')
    termId = term.data.id

    // --- Ana creates the classroom and admits Ben -------------------------

    const group = await ana
      .from('groups')
      .insert({
        name: sectionCode,
        kind: 'classroom',
        term_id: termId,
        section_code: sectionCode,
        program_code: 'BSCS',
        year_level: 4,
        campus: 'M',
        created_by: anaId,
      })
      .select('id, invite_code')
      .single()
    if (group.error) throw group.error
    groupId = group.data.id
    inviteCode = group.data.invite_code

    const owner = await ana
      .from('group_members')
      .insert({ group_id: groupId, user_id: anaId, role: 'owner' })
      .select('term_id, display_name')
      .single()
    if (owner.error) throw owner.error

    const request = await ben
      .from('group_join_requests')
      .insert({
        group_id: groupId,
        user_id: benId,
        claimed_full_name: 'Ben Cruz',
        claimed_section_code: sectionCode,
      })
      .select('id')
      .single()
    if (request.error) throw request.error

    const decided = await ana.rpc('decide_join_request', {
      request: request.data.id,
      approve: true,
    })
    if (decided.error) throw decided.error

    // --- Two posts, one of which asked for a log --------------------------

    const logged = await ana
      .from('class_posts')
      .insert({
        group_id: groupId,
        author_id: anaId,
        kind: 'task',
        title: 'Case Study 2',
        requires_submission: true,
        due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (logged.error) throw logged.error
    loggedPostId = logged.data.id

    const quiet = await ana
      .from('class_posts')
      .insert({
        group_id: groupId,
        author_id: anaId,
        kind: 'note',
        title: 'Bring a calculator on Thursday',
      })
      .select('id')
      .single()
    if (quiet.error) throw quiet.error
    quietPostId = quiet.data.id

    for (const postId of [loggedPostId, quietPostId]) {
      const state = await ana
        .from('class_post_states')
        .insert({ post_id: postId, user_id: anaId, status: 'submitted' })
      if (state.error) throw state.error
    }
  })

  afterAll(async () => {
    for (const id of [anaId, benId, cyId]) {
      if (!id) continue
      try {
        await admin.auth.admin.deleteUser(id)
      } catch {
        // Reported by the next run as a stray account rather than failing here.
      }
    }
  })

  // --- The fixture is real -------------------------------------------------

  it('admitted Ben, so the zero-row assertions below mean something', async () => {
    const { data, error } = await ben.from('class_posts').select('id').eq('group_id', groupId)
    expect(error).toBeNull()
    expect(data?.map((row) => row.id).sort()).toEqual([loggedPostId, quietPostId].sort())
  })

  it('filled term_id and display_name from the database, not from the client', async () => {
    const { data, error } = await ana
      .from('group_members')
      .select('user_id, term_id, display_name, role')
      .eq('group_id', groupId)
      .order('role')
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
    for (const row of data ?? []) {
      expect(row.term_id).toBe(termId)
      expect(row.display_name).toBeTruthy()
    }
    expect(data?.find((row) => row.user_id === benId)?.display_name).toBe('Ben Cruz')
  })

  // --- Posts ---------------------------------------------------------------

  it('returns zero class_posts to someone outside the classroom', async () => {
    const { data, error } = await cy.from('class_posts').select('id').eq('group_id', groupId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('refuses a post written into a classroom the author is not in', async () => {
    const { error } = await cy.from('class_posts').insert({
      group_id: groupId,
      author_id: cyId,
      title: 'Not my class',
    })
    expect(error).not.toBeNull()
  })

  it('refuses a post attributed to someone else', async () => {
    const { error } = await ben.from('class_posts').insert({
      group_id: groupId,
      author_id: anaId,
      title: 'Posted as the rep',
    })
    expect(error).not.toBeNull()
  })

  it('affects zero rows when a member edits another member’s post', async () => {
    const { data, error } = await ben
      .from('class_posts')
      .update({ title: 'Rewritten by Ben' })
      .eq('id', quietPostId)
      .select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  // --- The submission log --------------------------------------------------

  it('shows a classmate’s state only on a post that asked for a log', async () => {
    const visible = await ben
      .from('class_post_states')
      .select('user_id, status, submitted_at')
      .eq('post_id', loggedPostId)
    expect(visible.error).toBeNull()
    expect(visible.data).toHaveLength(1)
    expect(visible.data?.[0].user_id).toBe(anaId)
    expect(visible.data?.[0].status).toBe('submitted')
  })

  it('returns zero rows for the same classmate on a post that did not', async () => {
    const { data, error } = await ben
      .from('class_post_states')
      .select('user_id')
      .eq('post_id', quietPostId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('returns zero states to someone outside the classroom, log or no log', async () => {
    const { data, error } = await cy
      .from('class_post_states')
      .select('user_id')
      .in('post_id', [loggedPostId, quietPostId])
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('refuses a state row written for another student', async () => {
    const { error } = await ben
      .from('class_post_states')
      .insert({ post_id: loggedPostId, user_id: anaId, status: 'submitted' })
    expect(error).not.toBeNull()
  })

  it('stamps submitted_at itself, so a client cannot backdate a submission', async () => {
    const backdated = '2020-01-01T00:00:00.000Z'
    const { data, error } = await ben
      .from('class_post_states')
      .insert({
        post_id: loggedPostId,
        user_id: benId,
        status: 'submitted',
        submitted_at: backdated,
      })
      .select('submitted_at')
      .single()
    expect(error).toBeNull()
    expect(data?.submitted_at).not.toBe(backdated)
    expect(Date.parse(data?.submitted_at ?? '')).toBeGreaterThan(Date.now() - 5 * 60_000)
  })

  it('clears submitted_at when a student takes the mark back', async () => {
    const { data, error } = await ben
      .from('class_post_states')
      .update({ status: 'open' })
      .eq('post_id', loggedPostId)
      .eq('user_id', benId)
      .select('submitted_at')
      .single()
    expect(error).toBeNull()
    expect(data?.submitted_at).toBeNull()
  })

  it('refuses to enable requires_submission after publishing', async () => {
    const { error } = await ana
      .from('class_posts')
      .update({ requires_submission: true })
      .eq('id', quietPostId)
    expect(error).not.toBeNull()
    expect(error?.message).toContain('requires_submission cannot be enabled after publishing')
  })

  it('allows turning a log off, which hides it', async () => {
    const off = await ana
      .from('class_posts')
      .update({ requires_submission: false })
      .eq('id', loggedPostId)
      .select('id')
    expect(off.error).toBeNull()
    expect(off.data).toHaveLength(1)

    const hidden = await ben
      .from('class_post_states')
      .select('user_id')
      .eq('post_id', loggedPostId)
      .neq('user_id', benId)
    expect(hidden.error).toBeNull()
    expect(hidden.data).toEqual([])

    const back = await ana
      .from('class_posts')
      .update({ requires_submission: true })
      .eq('id', loggedPostId)
    // And it cannot be turned back on, which is the point of the freeze.
    expect(back.error).not.toBeNull()
  })

  // --- Membership and roles ------------------------------------------------

  it('affects zero rows when a member edits another member’s membership', async () => {
    const { data, error } = await ben
      .from('group_members')
      .update({ role: 'rep' })
      .eq('group_id', groupId)
      .eq('user_id', anaId)
      .select('user_id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('raises when a member who is not a rep decides a join request', async () => {
    const request = await cy
      .from('group_join_requests')
      .insert({ group_id: groupId, user_id: cyId, claimed_full_name: 'Cy dela Peña' })
      .select('id')
      .single()
    expect(request.error).toBeNull()

    const decided = await ben.rpc('decide_join_request', {
      request: request.data!.id,
      approve: true,
    })
    expect(decided.error).not.toBeNull()
    expect(decided.error?.message).toContain('not permitted')

    // And Cy is still outside it.
    const members = await cy.from('group_members').select('user_id').eq('group_id', groupId)
    expect(members.data ?? []).toEqual([])
  })

  it('refuses to run decide_join_request or is_group_rep for an anonymous caller', async () => {
    const decide = await anon.rpc('decide_join_request', {
      request: '00000000-0000-0000-0000-000000000000',
      approve: true,
    })
    expect(decide.error).not.toBeNull()

    const rep = await anon.rpc('is_group_rep', { target_group: groupId })
    expect(rep.error).not.toBeNull()
  })

  it('shows a code holder the section and the count, and nothing else', async () => {
    const { data, error } = await cy.rpc('classroom_by_invite', { invite: inviteCode })
    expect(error).toBeNull()
    const preview = (data ?? [])[0]
    expect(preview?.section_code).toBe(sectionCode)
    expect(Number(preview?.member_count)).toBe(2)
    expect(preview?.rep_name).toBe('Ana Reyes')
    expect(Object.keys(preview ?? {}).sort()).toEqual(
      ['archived', 'campus', 'id', 'member_count', 'rep_name', 'section_code', 'term_id', 'term_label'].sort(),
    )
  })

  it('returns nothing for an invite code that does not exist', async () => {
    const { data, error } = await cy.rpc('classroom_by_invite', { invite: 'not-a-real-code' })
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })

  // --- The two uniqueness rules the feature stands on ----------------------

  it('raises 23505 on a second live classroom for the same section and term', async () => {
    const { error } = await cy.from('groups').insert({
      name: sectionCode,
      kind: 'classroom',
      term_id: termId,
      section_code: sectionCode,
      program_code: 'BSCS',
      year_level: 4,
      campus: 'M',
      created_by: cyId,
    })
    expect(error?.code).toBe('23505')
  })

  it('raises 23505 on a second classroom membership in one term', async () => {
    const rival = await cy
      .from('groups')
      .insert({
        name: rivalCode,
        kind: 'classroom',
        term_id: termId,
        section_code: rivalCode,
        program_code: 'BSIT',
        year_level: 3,
        campus: 'T',
        created_by: cyId,
      })
      .select('id')
      .single()
    expect(rival.error).toBeNull()
    rivalGroupId = rival.data!.id

    const owner = await cy
      .from('group_members')
      .insert({ group_id: rivalGroupId, user_id: cyId, role: 'owner' })
    expect(owner.error).toBeNull()

    const second = await ben
      .from('group_members')
      .insert({ group_id: rivalGroupId, user_id: benId, role: 'member' })
    expect(second.error?.code).toBe('23505')
  })

  it('rejects a classroom with no section identity', async () => {
    const { error } = await cy.from('groups').insert({
      name: 'Shapeless',
      kind: 'classroom',
      created_by: cyId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('groups_classroom_shape')
  })

  // --- Name drift ----------------------------------------------------------

  it('follows a student’s name into every membership row they hold', async () => {
    const renamed = await ben.from('profiles').update({ full_name: 'Ben M. Cruz' }).eq('id', benId)
    expect(renamed.error).toBeNull()

    const { data, error } = await ana
      .from('group_members')
      .select('display_name')
      .eq('group_id', groupId)
      .eq('user_id', benId)
      .single()
    expect(error).toBeNull()
    expect(data?.display_name).toBe('Ben M. Cruz')
  })

  // --- Leaving -------------------------------------------------------------

  it('takes a leaver’s submission marks out of the log at the same moment', async () => {
    const marked = await ben
      .from('class_post_states')
      .upsert({ post_id: quietPostId, user_id: benId, status: 'submitted' })
    expect(marked.error).toBeNull()

    const left = await ben.from('group_members').delete().eq('group_id', groupId).eq('user_id', benId)
    expect(left.error).toBeNull()

    const remaining = await admin
      .from('class_post_states')
      .select('user_id')
      .eq('post_id', quietPostId)
      .eq('user_id', benId)
    expect(remaining.data ?? []).toEqual([])
  })
})
