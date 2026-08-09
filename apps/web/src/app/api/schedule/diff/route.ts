import { z } from 'zod'
import {
  diffSchedule,
  type CommittedCourse,
  type DiffCourse,
  type ScheduleChange,
  type Weekday,
} from '@onetup/core'
import { authenticated, parseBody } from '@/lib/api/handler'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Compares a fresh import against what is already committed.
 *
 * Changes the student previously rejected are filtered out, so a re-sync does
 * not re-propose the same edit every week. A rejection is keyed on the change
 * itself, so if ERS changes that value *again* the new version is proposed
 * afresh rather than staying silently suppressed.
 */

const DiffRequest = z.object({
  term_code: z.string().min(4).max(24),
  courses: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      faculty: z.string().nullable().optional(),
      meetings: z.array(
        z.object({
          day: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          room: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
})

export const POST = authenticated(async (request, { user }) => {
  const body = await parseBody(request, DiffRequest)
  const supabase = await supabaseServer()

  const { data: term } = await supabase
    .from('terms')
    .select('id')
    .eq('code', body.term_code)
    .maybeSingle()

  if (!term) return { changes: [] }

  const { data: rows } = await supabase
    .from('enrollments')
    .select(
      'id, faculty_name, courses(code, title), schedule_blocks(id, day, start_time, end_time, room, source)',
    )
    .eq('term_id', term.id)

  const committed: CommittedCourse[] = (rows ?? []).map((row) => {
    const course = row.courses as unknown as { code: string; title: string } | null
    const blocks = (row.schedule_blocks ?? []) as unknown as {
      id: string
      day: string
      start_time: string
      end_time: string
      room: string | null
      source: string
    }[]

    return {
      code: course?.code ?? '',
      title: course?.title ?? '',
      faculty: row.faculty_name,
      blockIds: blocks.map((block) => block.id),
      // Manual blocks are the student's own and are never part of a diff.
      meetings: blocks
        .filter((block) => block.source !== 'manual')
        .map((block) => ({
          day: block.day as Weekday,
          startTime: block.start_time.slice(0, 5),
          endTime: block.end_time.slice(0, 5),
          room: block.room ?? 'TBA',
        })),
    }
  })

  const incoming: DiffCourse[] = body.courses.map((course) => ({
    code: course.code,
    title: course.title,
    faculty: course.faculty ?? null,
    meetings: course.meetings.map((meeting) => ({
      day: meeting.day as Weekday,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      room: meeting.room ?? 'TBA',
    })),
  }))

  const changes = diffSchedule(committed, incoming)

  const { data: rejections } = await supabase
    .from('schedule_rejections')
    .select('change_hash')
    .eq('term_id', term.id)

  const rejected = new Set((rejections ?? []).map((r) => r.change_hash))

  const withHashes = await Promise.all(
    changes.map(async (change) => ({ ...change, hash: await hashChange(change) })),
  )

  return {
    term_id: term.id,
    changes: withHashes.filter((change) => !rejected.has(change.hash)),
    user_id: user.id,
  }
})

/** A stable fingerprint of one proposed change, so a rejection can be remembered. */
async function hashChange(change: ScheduleChange): Promise<string> {
  const canonical = `${change.kind}|${change.courseCode}|${change.from ?? ''}|${change.to ?? ''}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
