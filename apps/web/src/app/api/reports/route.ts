import { createHash } from 'node:crypto'
import { z } from 'zod'
import { publicRoute } from '@/lib/api/handler'
import { errors } from '@/lib/api/errors'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { currentUser } from '@/lib/supabase/server'

/**
 * The problem report endpoint.
 *
 * Open to signed-out visitors, which is the whole reason it is written the way
 * it is. `problem_reports` grants no insert to `anon` or `authenticated` and has
 * no insert policy, so this handler — running on the service role — is the only
 * path a row can arrive by, and therefore the only place the limits have to be
 * enforced. There is no second door to keep locked.
 *
 * Three cheap defences, in the order they cost the least:
 *
 *   1. A honeypot field. A form filler that populates every input trips it and
 *      gets the same 200 a real submission gets, because telling a bot it was
 *      caught is how it learns to stop tripping.
 *   2. A minimum time on the form. A submission that arrives a second after the
 *      page rendered was not typed by a person.
 *   3. Five reports an hour from one source, counted against a salted hash of
 *      the address. The salt lives in the environment, so the column is useless
 *      to anyone who reads the table.
 */

const KINDS = ['help', 'feedback', 'suggestion', 'issue', 'inquiry', 'other'] as const

const Report = z.object({
  kind: z.enum(KINDS),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(20).max(4000),
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(254).optional().or(z.literal('')),
  studentNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{4,20}$/)
    .optional()
    .or(z.literal('')),
  section: z.string().trim().max(40).optional().or(z.literal('')),
  college: z.string().trim().max(120).optional().or(z.literal('')),
  /* Must arrive empty. Deliberately permissive here: rejecting a filled
   * honeypot in the schema returns a 422 that tells a bot exactly which field
   * gave it away. It is accepted, then silently dropped below. */
  website: z.string().max(200).optional(),
  /* Milliseconds the form was on screen before submit. */
  elapsedMs: z.number().int().nonnegative().optional(),
})

const WINDOW_SECONDS = 3600
const MAX_PER_WINDOW = 5
const MIN_FILL_MS = 3000

/** Empty string is what an untouched optional input posts; the column wants null. */
function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * A salted digest of the client address. Salted with the service-role key,
 * which is already the most closely held secret in the deployment and never
 * leaves the server, so the hash cannot be reversed by rainbow table.
 */
function hashClient(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  const address = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')
  if (!address) return null

  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createHash('sha256').update(`${salt}:${address}`).digest('hex')
}

export const POST = publicRoute(async (request) => {
  const raw = await request.json().catch(() => null)
  const parsed = Report.safeParse(raw)
  if (!parsed.success) {
    throw errors.validation('Some of those answers need another look.', {
      issues: parsed.error.issues,
    })
  }
  const body = parsed.data

  /* Silent accepts. Both of these mean "not a person", and both return the
   * shape a success returns so nothing is learned from the difference. */
  if (body.website) return { ok: true }
  if (body.elapsedMs !== undefined && body.elapsedMs < MIN_FILL_MS) return { ok: true }

  const admin = supabaseAdmin()
  const ipHash = hashClient(request)

  if (ipHash) {
    const since = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString()
    const { count, error } = await admin
      .from('problem_reports')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', since)

    if (error) throw new Error(error.message)
    if ((count ?? 0) >= MAX_PER_WINDOW) {
      throw errors.rateLimited(
        WINDOW_SECONDS,
        'That is five reports in an hour from here. Give it a little while.',
      )
    }
  }

  /* Attached when the visitor happens to be signed in, so they can see their
   * own reports later. It is never required, and it is never asked for. */
  const user = await currentUser()

  const { data, error } = await admin
    .from('problem_reports')
    .insert({
      user_id: user?.id ?? null,
      kind: body.kind,
      subject: body.subject,
      message: body.message,
      full_name: body.fullName,
      email: orNull(body.email) ?? user?.email ?? null,
      student_number: orNull(body.studentNumber),
      section: orNull(body.section),
      college: orNull(body.college),
      ip_hash: ipHash,
      user_agent: request.headers.get('user-agent')?.slice(0, 200) ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { ok: true, id: data.id }
})
