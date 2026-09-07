import { z } from 'zod'
import { errors } from '@/lib/api/errors'
import { authenticated, parseBody } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Commits a schedule the student has already reviewed.
 *
 * The atomicity lives in a Postgres function (migration 021) rather than in
 * three sequential requests, because a half-applied import — enrollments with
 * no blocks — is worse than a failed one.
 */

const Meeting = z.object({
  day: z.enum([
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().max(64).nullable().optional(),
  parseStatus: z.enum(['ok', 'partial', 'failed']).optional(),
})

const CommitRequest = z.object({
  term_code: z.string().min(4).max(24),
  source: z.enum(['ers_import', 'manual', 'paste']),
  job_id: z.string().uuid().nullable().optional(),
  courses: z
    .array(
      z.object({
        code: z.string().min(1).max(32),
        title: z.string().min(1).max(160),
        lecUnits: z.number().min(0).max(20).default(0),
        labUnits: z.number().min(0).max(20).default(0),
        units: z.number().min(0).max(20),
        faculty: z.string().max(120).nullable().optional(),
        rawSchedule: z.string().max(500).optional(),
        meetings: z.array(Meeting).min(1),
      }),
    )
    .min(1)
    .max(40),
})

export const POST = authenticated(async (request) => {
  const body = await parseBody(request, CommitRequest)

  for (const course of body.courses) {
    for (const meeting of course.meetings) {
      if (meeting.endTime <= meeting.startTime) {
        throw errors.validation(
          `${course.code} has a class that ends before it starts. Fix the times and try again.`,
          { course: course.code },
        )
      }
    }
  }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.rpc('commit_schedule', {
    p_term_code: body.term_code,
    p_source: body.source,
    /* `021` declares `p_job_id uuid` and branches on `is not null` — a paste
     * import has no job to attach to, and that is the supported case. The
     * generated types cannot express a nullable *function argument*, so they
     * report it as `string`; the database disagrees, and the database is
     * right. */
    p_job_id: (body.job_id ?? null) as unknown as string,
    p_courses: body.courses,
  })

  if (error) {
    if (error.message.includes('unknown term')) {
      throw errors.validation("We don't have that term on file yet.")
    }
    throw errors.internal({ pg: error.code })
  }

  return data
})
