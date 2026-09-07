import { z } from 'zod'
import { CAMPUSES, parseSectionCode } from '@onetup/core'
import { errors } from '@/lib/api/errors'
import { authenticated, log, parseBody } from '@/lib/api/handler'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Creating a classroom.
 *
 * The section code is parsed rather than trusted: `bscs 4b m` and `BSCS-4B-M`
 * are the same cohort, and a classroom stored under the spelling one student
 * happened to use is a classroom the other twenty-nine cannot find.
 *
 * The interesting case is the second person to create it. Two students both
 * setting up `BSCS-4B-M` on the first day of term is not an edge case, it is
 * Tuesday — so the unique index fires, the route catches `23505`, and the
 * answer is the classroom that already exists rather than a constraint
 * violation rendered on a screen.
 */

export const runtime = 'nodejs'

const CreateRequest = z.object({
  /** Either a whole code, or the four parts from the form. */
  code: z.string().trim().max(60).optional(),
  program: z.string().trim().max(10).optional(),
  year: z.number().int().min(1).max(6).optional(),
  block: z.string().trim().max(2).optional(),
  campus: z.enum(CAMPUSES).optional(),
})

export const POST = authenticated(async (request, { user }) => {
  const body = await parseBody(request, CreateRequest)

  const raw =
    body.code ??
    (body.program && body.year && body.block && body.campus
      ? `${body.program}-${body.year}${body.block}-${body.campus}`
      : '')

  const section = parseSectionCode(raw)
  if (!section) {
    throw errors.validation(
      "That doesn't look like a section code. It should read like BSCS-4B-M — program, year and block, then the campus letter.",
    )
  }

  const supabase = await supabaseServer()

  const { data: term } = await supabase
    .from('terms')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle()
  if (!term) {
    throw errors.validation('There is no current term set up yet, so a classroom has nowhere to live.')
  }

  const { data: existingMembership } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('term_id', term.id)
    .maybeSingle()

  if (existingMembership) {
    throw errors.validation(
      'You are already in a classroom this term. Leave that one first — one classroom per term is how the tracker stays yours.',
      { group_id: existingMembership.group_id },
    )
  }

  const created = await supabase
    .from('groups')
    .insert({
      name: section.canonical,
      kind: 'classroom',
      term_id: term.id,
      section_code: section.canonical,
      program_code: section.program,
      year_level: section.year,
      campus: section.campus,
      created_by: user.id,
    })
    .select('id, invite_code, section_code')
    .single()

  if (created.error) {
    if (created.error.code === '23505') return await offerToJoin(section.canonical, term.id)
    throw errors.internal({ cause: created.error.message })
  }

  const owner = await supabase
    .from('group_members')
    .insert({ group_id: created.data.id, user_id: user.id, role: 'owner' })
    .select('term_id')
    .single()

  if (owner.error) {
    // A classroom with no owner is unreachable — nobody can approve into it —
    // so it is removed rather than left behind as a section nobody can claim.
    await supabase.from('groups').delete().eq('id', created.data.id)
    throw errors.internal({ cause: owner.error.message })
  }

  log('info', 'classroom.created', { group_id: created.data.id, term_id: term.id })

  return {
    classroom: {
      id: created.data.id,
      section_code: created.data.section_code,
      invite_code: created.data.invite_code,
      term_label: term.label,
    },
  }
})

/**
 * What the second creator gets.
 *
 * Read on the service role, because the point of this response is that the
 * caller is *not* in the classroom yet and `groups_read` correctly hides it
 * from them. Only what the join screen already shows a code holder comes back —
 * no member list, and deliberately **not** the invite code: a section code is
 * guessable, and handing its invite link to anyone who guesses it would undo
 * the one thing protecting a class, which is that the link circulates in the
 * group chat the class already trusts. A request against the group id still
 * has to be approved by the rep.
 */
async function offerToJoin(sectionCode: string, termId: string) {
  const admin = supabaseAdmin()

  const { data: group } = await admin
    .from('groups')
    .select('id, section_code')
    .eq('term_id', termId)
    .eq('section_code', sectionCode)
    .eq('kind', 'classroom')
    .is('archived_at', null)
    .maybeSingle()

  if (!group) throw errors.internal({ cause: 'unique violation without a matching classroom' })

  const { count } = await admin
    .from('group_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('group_id', group.id)

  const { data: owner } = await admin
    .from('group_members')
    .select('display_name')
    .eq('group_id', group.id)
    .eq('role', 'owner')
    .maybeSingle()

  return {
    classroom: null,
    existing: {
      id: group.id,
      section_code: group.section_code,
      member_count: count ?? 0,
      rep_name: owner?.display_name ?? null,
    },
  }
}
