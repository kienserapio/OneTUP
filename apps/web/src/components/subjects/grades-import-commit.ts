'use client'

import type { NonNumericMark } from '@onetup/core'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * Writing an approved grades import.
 *
 * This runs in the browser, under the student's own session, and that is not an
 * implementation convenience. Migration 023 revokes `grades` from the service
 * role because ARD §6.1 says there is no administrative override for a
 * student's academic record — so the only key that can write these rows is the
 * student's own, and every statement below goes through row-level security.
 * Moving any of it to a server route with the admin client would fail, loudly,
 * and it should.
 *
 * The order matters. A grade hangs off an enrollment, an enrollment off a
 * course and a term, and a past semester has none of them: a student who
 * imports four years of history has never enrolled in most of those subjects
 * inside OneTUP. Each layer is therefore found first and created only when it
 * is genuinely absent, so re-running an import updates grades rather than
 * duplicating a degree.
 */

export interface GradeToCommit {
  /** Stable key from the review screen, echoed back in `skipped`. */
  key: string
  code: string
  title: string
  units: number
  value: number | null
  mark: NonNumericMark | null
  /** Resolved on the review screen; every row has a term before it is sent. */
  termCode: string
}

export interface CommitOutcome {
  saved: number
  /** Rows that could not be written, with a reason a student can act on. */
  skipped: { key: string; code: string; reason: string }[]
}

export async function commitImportedGrades(rows: GradeToCommit[]): Promise<CommitOutcome> {
  const supabase = supabaseBrowser()
  const outcome: CommitOutcome = { saved: 0, skipped: [] }
  if (rows.length === 0) return outcome

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('You have been signed out. Sign in again and re-run the import.')

  const termIds = await termIdsFor(supabase, [...new Set(rows.map((row) => row.termCode))])
  const courseIds = new Map<string, string>()
  const enrollmentIds = new Map<string, string>()

  for (const row of rows) {
    const termId = termIds.get(row.termCode)
    if (!termId) {
      outcome.skipped.push({
        key: row.key,
        code: row.code,
        reason: `We don't have ${row.termCode} on file as a term.`,
      })
      continue
    }

    try {
      const courseKey = `${row.code}|${row.title}`
      let courseId = courseIds.get(courseKey)
      if (!courseId) {
        courseId = await findOrCreateCourse(supabase, row)
        courseIds.set(courseKey, courseId)
      }

      const enrollmentKey = `${courseId}|${termId}`
      let enrollmentId = enrollmentIds.get(enrollmentKey)
      if (!enrollmentId) {
        enrollmentId = await findOrCreateEnrollment(supabase, userId, courseId, termId)
        enrollmentIds.set(enrollmentKey, enrollmentId)
      }

      const { error } = await supabase.from('grades').upsert(
        {
          user_id: userId,
          enrollment_id: enrollmentId,
          value: row.value,
          mark: row.mark,
          // An imported grade is a grade the registrar has already given. It is
          // never a projection, whatever the student has pinned in the planner.
          is_projected: false,
          recorded_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,enrollment_id' },
      )

      if (error) throw new Error(error.message)
      outcome.saved += 1
    } catch (error) {
      // One bad row must not abandon the other forty. The student sees exactly
      // which subjects did not save and can fix those alone.
      outcome.skipped.push({
        key: row.key,
        code: row.code,
        reason: error instanceof Error ? error.message : 'That row would not save.',
      })
    }
  }

  return outcome
}

type Client = ReturnType<typeof supabaseBrowser>

async function termIdsFor(supabase: Client, codes: string[]): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('terms').select('id, code').in('code', codes)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((term) => [term.code, term.id]))
}

/**
 * The catalog is shared and insert-only for students (migration 002), so a
 * subject the catalog has never seen is added rather than corrected. Matching
 * on the code alone first is deliberate: ERS abbreviates titles differently
 * between semesters, and two rows for `CS 3105` would split one subject's
 * history in two.
 */
async function findOrCreateCourse(supabase: Client, row: GradeToCommit): Promise<string> {
  const { data: existing, error } = await supabase
    .from('courses')
    .select('id, title')
    .eq('code', row.code)

  if (error) throw new Error(error.message)

  if (existing && existing.length > 0) {
    const sameTitle = existing.find(
      (course) => course.title.toLowerCase() === row.title.toLowerCase(),
    )
    return (sameTitle ?? existing[0]).id
  }

  const { data: created, error: insertError } = await supabase
    .from('courses')
    .insert({
      code: row.code,
      title: row.title || row.code,
      units: row.units,
      // The grades page carries a single unit figure, not the lecture and
      // laboratory split the schedule page gives. Guessing at the split would
      // put a number in front of a student that nothing on ERS supports.
      lec_units: 0,
      lab_units: 0,
    })
    .select('id')
    .single()

  if (insertError) {
    // Another tab, or another student, inserted the same course between the
    // read and the write. The row now exists, which is all we wanted.
    const { data: retry } = await supabase
      .from('courses')
      .select('id')
      .eq('code', row.code)
      .limit(1)
      .maybeSingle()
    if (retry) return retry.id
    throw new Error(insertError.message)
  }

  return created.id
}

async function findOrCreateEnrollment(
  supabase: Client,
  userId: string,
  courseId: string,
  termId: string,
): Promise<string> {
  const { data: existing, error } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('term_id', termId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (existing) return existing.id

  const { data: created, error: insertError } = await supabase
    .from('enrollments')
    .insert({
      user_id: userId,
      course_id: courseId,
      term_id: termId,
      source: 'ers_import',
      imported_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertError) throw new Error(insertError.message)
  return created.id
}
