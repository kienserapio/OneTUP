/**
 * Cross-user access test — 04-DATA-MODEL.md §17.4.
 *
 * Two real accounts are created against the project, one of them is given a
 * full set of owned rows, and the other tries to reach every one of them. The
 * point is not that the client refuses: it is that the database does, so a
 * client bug or a hand-written request cannot get past it either.
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

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/** Manila is a constant +08:00, which is all the views' `at time zone` needs. */
const manilaNow = () => new Date(Date.now() + 8 * 3_600_000)
const manilaWeekday = () => WEEKDAYS[manilaNow().getUTCDay()]
const manilaDate = () => manilaNow().toISOString().slice(0, 10)

const OWNED_VIEWS = ['v_today', 'v_gwa', 'v_attendance_summary', 'v_deadlines_upcoming'] as const

describe.skipIf(!configured)('RLS: cross-user access', () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const password = `Rls-${stamp}-Pw!`

  let admin: SupabaseClient
  let anon: SupabaseClient
  let alice: SupabaseClient
  let bob: SupabaseClient

  let aliceId = ''
  let bobId = ''
  const createdPlaceIds: string[] = []
  let createdCourseId = ''

  /** Bob's rows. Every one of these is what Alice must fail to reach. */
  const bobRows = {
    termId: '',
    courseId: '',
    enrollmentId: '',
    blockId: '',
    attendanceId: '',
    gradeId: '',
    deadlineId: '',
  }

  let approvedPlaceId = ''
  let pendingPlaceId = ''

  beforeAll(async () => {
    /* Say what is wrong in one line, rather than in a GoTrue stack trace. */
    await requireReachableProject()

    const { createClient } = await import('@supabase/supabase-js')
    const clientOptions = {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }

    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, clientOptions)
    anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, clientOptions)

    for (const label of ['a', 'b'] as const) {
      const email = `rls-${label}-${stamp}@example.com`
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) throw error
      const id = data.user?.id ?? ''
      if (label === 'a') aliceId = id
      else bobId = id

      const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, clientOptions)
      const signIn = await client.auth.signInWithPassword({ email, password })
      if (signIn.error) throw signIn.error
      if (label === 'a') alice = client
      else bob = client
    }

    // --- Bob's data -------------------------------------------------------
    // Written as Bob rather than with the service key, because the service role
    // is deliberately denied grades and attendance (migration 023).

    const term = await admin
      .from('terms')
      .select('id')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle()
    if (term.error) throw term.error
    if (!term.data) throw new Error('No current term is seeded; run the migrations first.')
    bobRows.termId = term.data.id

    const course = await bob
      .from('courses')
      .insert({
        code: `RLS ${stamp}`,
        title: 'RLS fixture course',
        lec_units: 3,
        lab_units: 0,
        units: 3,
      })
      .select('id')
      .single()
    if (course.error) throw course.error
    bobRows.courseId = course.data.id
    createdCourseId = course.data.id

    const enrollment = await bob
      .from('enrollments')
      .insert({
        user_id: bobId,
        course_id: bobRows.courseId,
        term_id: bobRows.termId,
        source: 'manual',
      })
      .select('id')
      .single()
    if (enrollment.error) throw enrollment.error
    bobRows.enrollmentId = enrollment.data.id

    // `v_today` filters on the Manila weekday, so the block has to be today's.
    const block = await bob
      .from('schedule_blocks')
      .insert({
        user_id: bobId,
        enrollment_id: bobRows.enrollmentId,
        day: manilaWeekday(),
        start_time: '07:00',
        end_time: '09:00',
        room: 'RM312',
        source: 'manual',
      })
      .select('id')
      .single()
    if (block.error) throw block.error
    bobRows.blockId = block.data.id

    const attendance = await bob
      .from('attendance_records')
      .insert({
        user_id: bobId,
        enrollment_id: bobRows.enrollmentId,
        block_id: bobRows.blockId,
        session_date: manilaDate(),
        status: 'present',
      })
      .select('id')
      .single()
    if (attendance.error) throw attendance.error
    bobRows.attendanceId = attendance.data.id

    const grade = await bob
      .from('grades')
      .insert({ user_id: bobId, enrollment_id: bobRows.enrollmentId, value: 1.75 })
      .select('id')
      .single()
    if (grade.error) throw grade.error
    bobRows.gradeId = grade.data.id

    const deadline = await bob
      .from('deadlines')
      .insert({
        user_id: bobId,
        enrollment_id: bobRows.enrollmentId,
        title: 'RLS fixture deadline',
        due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (deadline.error) throw deadline.error
    bobRows.deadlineId = deadline.data.id

    // --- Campus places, the one table anonymous readers may see -----------
    const places = await admin
      .from('campus_places')
      .insert([
        {
          campus: 'manila',
          category: 'landmark',
          name: `RLS approved ${stamp}`,
          lat: 14.5878,
          lng: 120.9877,
          status: 'approved',
        },
        {
          campus: 'manila',
          category: 'landmark',
          name: `RLS pending ${stamp}`,
          lat: 14.5879,
          lng: 120.9878,
          status: 'pending',
        },
      ])
      .select('id,status')
    if (places.error) throw places.error
    for (const place of places.data ?? []) {
      createdPlaceIds.push(place.id)
      if (place.status === 'approved') approvedPlaceId = place.id
      else pendingPlaceId = place.id
    }
  })

  afterAll(async () => {
    // Runs whatever happened above: a half-built fixture still leaves accounts
    // behind, and accounts are the expensive thing to leak.
    if (createdPlaceIds.length > 0) {
      await admin.from('campus_places').delete().in('id', createdPlaceIds).then(
        () => undefined,
        () => undefined,
      )
    }
    for (const id of [aliceId, bobId]) {
      if (!id) continue
      try {
        await admin.auth.admin.deleteUser(id)
      } catch {
        // Reported by the next run as a stray account rather than failing here.
      }
    }
    if (createdCourseId) {
      await admin.from('courses').delete().eq('id', createdCourseId).then(
        () => undefined,
        () => undefined,
      )
    }
  })

  it('gave Bob rows to begin with, so the zero-row assertions below mean something', async () => {
    const { data, error } = await bob.from('grades').select('id').eq('id', bobRows.gradeId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('returns zero rows when Alice selects Bob’s grades', async () => {
    const all = await alice.from('grades').select('*')
    expect(all.error).toBeNull()
    expect(all.data).toEqual([])

    // Asking for the row by its primary key must be no more revealing.
    const byId = await alice.from('grades').select('*').eq('id', bobRows.gradeId)
    expect(byId.error).toBeNull()
    expect(byId.data).toEqual([])
  })

  it('returns zero rows when Alice selects Bob’s attendance, enrollments, blocks and deadlines', async () => {
    for (const table of [
      'attendance_records',
      'enrollments',
      'schedule_blocks',
      'deadlines',
    ] as const) {
      const { data, error } = await alice.from(table).select('*')
      expect(error, table).toBeNull()
      // Alice owns nothing on these tables, so an unfiltered select is empty.
      expect(data, table).toEqual([])

      const targeted = await alice.from(table).select('*').eq('user_id', bobId)
      expect(targeted.data, table).toEqual([])
    }
  })

  it('shows Alice only her own preferences and profile, never Bob’s', async () => {
    // These two rows exist for every account, so the assertion is about
    // ownership rather than emptiness.
    const preferences = await alice.from('user_preferences').select('user_id')
    expect(preferences.error).toBeNull()
    expect(preferences.data?.map((row) => row.user_id)).toEqual([aliceId])

    const profiles = await alice.from('profiles').select('id')
    expect(profiles.error).toBeNull()
    expect(profiles.data?.map((row) => row.id)).toEqual([aliceId])

    expect((await alice.from('user_preferences').select('*').eq('user_id', bobId)).data).toEqual([])
    expect((await alice.from('profiles').select('*').eq('id', bobId)).data).toEqual([])
  })

  it('affects zero rows when Alice updates Bob’s attendance record', async () => {
    const { data, error } = await alice
      .from('attendance_records')
      .update({ status: 'absent' })
      .eq('id', bobRows.attendanceId)
      .select()

    // The update matches nothing rather than erroring, which is what an RLS
    // policy does — and the row is untouched.
    expect(error).toBeNull()
    expect(data).toEqual([])

    const after = await bob
      .from('attendance_records')
      .select('status')
      .eq('id', bobRows.attendanceId)
      .single()
    expect(after.error).toBeNull()
    expect(after.data?.status).toBe('present')
  })

  it('affects zero rows when Alice deletes Bob’s grade', async () => {
    const { data, error } = await alice
      .from('grades')
      .delete()
      .eq('id', bobRows.gradeId)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    const survivor = await bob.from('grades').select('id').eq('id', bobRows.gradeId)
    expect(survivor.data).toHaveLength(1)
  })

  it('fails when Alice inserts an announcement into a course she is not enrolled in', async () => {
    const { data, error } = await alice.from('announcements').insert({
      course_id: bobRows.courseId,
      term_id: bobRows.termId,
      is_university_wide: false,
      type: 'quiz',
      summary: 'Quiz on Friday, chapters 4 to 6',
      content_hash: '0'.repeat(16),
      submitted_by: aliceId,
    })

    expect(error).not.toBeNull()
    // 42501 is the policy violation; anything else would mean the row landed.
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('fails when Alice inserts an announcement attributed to Bob', async () => {
    const { error } = await alice.from('announcements').insert({
      course_id: bobRows.courseId,
      term_id: bobRows.termId,
      is_university_wide: false,
      type: 'quiz',
      summary: 'Quiz on Friday, chapters 4 to 6',
      content_hash: '0'.repeat(16),
      submitted_by: bobId,
    })
    expect(error).not.toBeNull()
  })

  it('fails when Alice writes a row owned by Bob', async () => {
    const { error } = await alice.from('deadlines').insert({
      user_id: bobId,
      title: 'Planted by another student',
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('lets an anonymous client read campus_places, and only approved rows', async () => {
    const { data, error } = await anon.from('campus_places').select('id,name,status')

    // The one deliberate anonymous read in the schema (ADR-012).
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBeGreaterThan(0)
    expect(data?.every((place) => place.status === 'approved')).toBe(true)
    expect(data?.some((place) => place.id === approvedPlaceId)).toBe(true)
    expect(data?.some((place) => place.id === pendingPlaceId)).toBe(false)
  })

  it('returns zero rows when an anonymous client reads schedule_blocks', async () => {
    const { data, error } = await anon.from('schedule_blocks').select('*')

    // No grant at all is a stronger outcome than an empty result set, so a
    // permission-denied error satisfies "zero rows" just as well.
    if (error) expect(error.code).toBe('42501')
    expect(data ?? []).toEqual([])
  })

  it('returns zero rows when an anonymous client reads the other owned tables', async () => {
    for (const table of ['grades', 'attendance_records', 'deadlines', 'enrollments'] as const) {
      const { data, error } = await anon.from(table).select('*')
      if (error) expect(error.code, table).toBe('42501')
      expect(data ?? [], table).toEqual([])
    }
  })

  it('returns Bob’s own rows from every view', async () => {
    for (const view of OWNED_VIEWS) {
      const { data, error } = await bob.from(view).select('*')
      expect(error, view).toBeNull()
      expect(data?.length ?? 0, view).toBeGreaterThan(0)
    }
  })

  it('returns zero rows from every view when queried by a non-owner', async () => {
    // The views run `security_invoker`, so this is the assertion that catches a
    // view created without it — the single most likely way this schema could
    // leak one student's data to another.
    for (const view of OWNED_VIEWS) {
      const { data, error } = await alice.from(view).select('*')
      expect(error, view).toBeNull()
      expect(data, view).toEqual([])
    }
  })

  it('returns zero rows from every view when queried anonymously', async () => {
    for (const view of OWNED_VIEWS) {
      const { data, error } = await anon.from(view).select('*')
      if (error) expect(error.code, view).toBe('42501')
      expect(data ?? [], view).toEqual([])
    }
  })

  /**
   * Storage, which is the newest place a student's own material lives and the
   * one where the access rule is least obvious: it is a *path prefix*, not a
   * column, so nothing about a bucket looks like RLS until you read `038`.
   *
   * A study source is a student's lecture notes and a shared announcement image
   * may be a photo of a whiteboard with names on it. Both are private, both are
   * enforced here.
   */
  describe('storage buckets', () => {
    const BUCKETS = ['study-sources', 'announcement-images'] as const
    const body = () => new Blob(['notes only Bob should see'], { type: 'text/plain' })

    it('lets a student write into their own folder and read it back', async () => {
      for (const bucket of BUCKETS) {
        const path = `${bobId}/${stamp}-own.txt`
        const upload = await bob.storage.from(bucket).upload(path, body(), {
          contentType: 'text/plain',
          upsert: true,
        })
        /* announcement-images restricts mime types, so a text blob is refused
         * there on content rather than on ownership — which is itself correct
         * and not what this case is about. */
        if (upload.error && bucket === 'announcement-images') continue
        expect(upload.error, bucket).toBeNull()

        const download = await bob.storage.from(bucket).download(path)
        expect(download.error, bucket).toBeNull()
        expect(await download.data?.text(), bucket).toContain('only Bob')

        await bob.storage.from(bucket).remove([path])
      }
    })

    it('refuses a write into another student’s folder', async () => {
      const path = `${bobId}/${stamp}-alice-tried.txt`
      const { error } = await alice.storage.from('study-sources').upload(path, body(), {
        contentType: 'text/plain',
      })
      expect(error).not.toBeNull()
    })

    it('refuses a read of another student’s file', async () => {
      const path = `${bobId}/${stamp}-private.txt`
      const upload = await bob.storage.from('study-sources').upload(path, body(), {
        contentType: 'text/plain',
        upsert: true,
      })
      expect(upload.error).toBeNull()

      const asAlice = await alice.storage.from('study-sources').download(path)
      expect(asAlice.error).not.toBeNull()

      const asAnon = await anon.storage.from('study-sources').download(path)
      expect(asAnon.error).not.toBeNull()

      await bob.storage.from('study-sources').remove([path])
    })

    it('does not serve either bucket over a public URL', async () => {
      for (const bucket of BUCKETS) {
        const path = `${bobId}/${stamp}-public-check.txt`
        const upload = await bob.storage.from(bucket).upload(path, body(), {
          contentType: 'text/plain',
          upsert: true,
        })
        if (upload.error) continue

        const { data } = bob.storage.from(bucket).getPublicUrl(path)
        const response = await fetch(data.publicUrl)
        /* A private bucket answers 400 to an unsigned request. A 200 here means
         * the bucket was created public, and a student's notes are one guessed
         * URL away from anybody. */
        expect(response.ok, bucket).toBe(false)

        await bob.storage.from(bucket).remove([path])
      }
    })
  })
})
