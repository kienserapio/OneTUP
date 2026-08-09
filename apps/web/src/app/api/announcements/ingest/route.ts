import { contentHash, findDuplicate, manilaDate } from '@onetup/core'
import { errors } from '@/lib/api/errors'
import { authenticated } from '@/lib/api/handler'
import { enforceLimit } from '@/lib/api/rate-limit'
import { supabaseServer } from '@/lib/supabase/server'
import { runCapability } from '@/lib/ai/gateway'

/**
 * Announcement intake.
 *
 * Nothing here publishes. It normalises what a student deliberately shared,
 * checks whether it is the same announcement someone else already shared, asks
 * the gateway to structure it, validates the result against the submitter's
 * *actual* enrollments, and hands back a proposal for review (ADR-008).
 *
 * The enrollment check is the load-bearing one: without it a hallucinated
 * course code would publish into a section the submitter is not even in.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

export const POST = authenticated(async (request, { user }) => {
  await enforceLimit(user.id, 'announcement_ingest')

  const { text, imageDataUrl, source } = await readSubmission(request)
  if (!text.trim() && !imageDataUrl) {
    throw errors.validation('There was nothing to read in that.')
  }

  const supabase = await supabaseServer()

  const [{ data: term }, { data: enrollments }] = await Promise.all([
    supabase.from('terms').select('id, code, ends_on').eq('is_current', true).maybeSingle(),
    supabase.from('enrollments').select('id, course_id, courses(code, title)'),
  ])

  const enrolled = (enrollments ?? []).map((enrollment) => {
    const course = enrollment.courses as unknown as { code: string; title: string } | null
    return { code: course?.code ?? '', title: course?.title ?? '', id: enrollment.id, courseId: enrollment.course_id }
  })

  const hash = contentHash(text)

  // Fifteen classmates sharing one quiz announcement should produce one record
  // with fifteen confirmations, not fifteen entries in everyone's feed.
  const { data: recent } = await supabase
    .from('announcements')
    .select('id, content_hash, created_at, summary')
    .gte('created_at', new Date(Date.now() - 48 * 3_600_000).toISOString())

  const duplicate = findDuplicate(
    hash,
    (recent ?? []).map((row) => ({
      id: row.id,
      contentHash: row.content_hash,
      createdAt: row.created_at,
    })),
  )

  if (duplicate) {
    const existing = (recent ?? []).find((row) => row.id === duplicate.id)
    return {
      duplicate_of: duplicate.id,
      existing_summary: existing?.summary ?? null,
      proposal: null,
      warnings: ['duplicate'],
    }
  }

  const today = manilaDate(new Date())
  const termEnd = term?.ends_on ?? addMonths(today, 5)

  const result = await runCapability(
    'announcement_extract',
    {
      content: text,
      enrolled_courses: enrolled.map(({ code, title }) => ({ code, title })),
      today,
      term_end: termEnd,
    },
    { userId: user.id },
  )

  const proposal = result.output as {
    course_code: string | null
    type: string
    event_date: string | null
    event_time: string | null
    summary: string
    detail: string
    creates_deadline: boolean
    confidence: number
  }

  const matched = proposal.course_code
    ? enrolled.find((entry) => entry.code === proposal.course_code)
    : undefined

  const { data: submission } = await supabase
    .from('announcement_submissions')
    .insert({
      user_id: user.id,
      raw_content: text.slice(0, 8000),
      source,
      content_hash: hash,
      extraction: proposal as never,
      status: 'proposed',
    })
    .select('id')
    .single()

  return {
    submission_id: submission?.id ?? null,
    duplicate_of: null,
    proposal: {
      ...proposal,
      // Below 0.5 the client presents everything blank-but-suggested rather
      // than pre-filling something the student then has to notice is wrong.
      low_confidence: proposal.confidence < 0.5,
      course_id: matched?.courseId ?? null,
      enrollment_id: matched?.id ?? null,
      term_id: term?.id ?? null,
    },
    warnings: result.meta.warnings,
    meta: result.meta,
  }
})

async function readSubmission(request: Request): Promise<{
  text: string
  imageDataUrl: string | null
  source: 'share_target' | 'paste' | 'image'
}> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const parts = [form.get('title'), form.get('text'), form.get('url')]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join('\n')

    const image = form.get('image')
    if (image instanceof File && image.size > 0) {
      const buffer = Buffer.from(await image.arrayBuffer())
      return {
        text: parts,
        imageDataUrl: `data:${image.type};base64,${buffer.toString('base64')}`,
        source: 'share_target',
      }
    }
    return { text: parts, imageDataUrl: null, source: 'share_target' }
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string
    image?: string
    source?: string
  }

  return {
    text: body.text ?? '',
    imageDataUrl: body.image ?? null,
    source: body.source === 'image' ? 'image' : 'paste',
  }
}

function addMonths(date: string, months: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCMonth(parsed.getUTCMonth() + months)
  return parsed.toISOString().slice(0, 10)
}
