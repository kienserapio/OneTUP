'use client'

import {
  DEFAULT_ALLOWED_ABSENCES,
  DEFAULT_LATES_PER_ABSENCE,
  computeGwa,
  evaluateThreshold,
  shouldNotifyAttendance,
  shouldNotifyThreshold,
  summariseAttendance,
  type AttendanceRecord,
  type AttendanceState,
  type Course,
  type Enrollment,
  type Grade,
  type ThresholdState,
  type UserPreferences,
  type UserThreshold,
} from '@onetup/core'
import { getMeta, readAll, setMeta } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * Threshold monitoring.
 *
 * This runs on the client, deliberately. Evaluating thresholds on a server
 * would mean a service-role process reading every student's grades and
 * attendance — precisely the administrative path the product promises does not
 * exist (ARD §6.1). The student's own device already holds the data, so it does
 * the arithmetic and enqueues the notification.
 *
 * Both checks fire only on a transition to a worse state. A student already at
 * their absence limit does not need to be told again every time the app syncs.
 */

interface AttendanceStateCache {
  [enrollmentId: string]: AttendanceState
}

export async function evaluateAlerts(): Promise<{ fired: number }> {
  const supabase = supabaseBrowser()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { fired: 0 }

  const [enrollments, courses, attendance, grades, preferencesRows, thresholds] = await Promise.all(
    [
      readAll<Enrollment & { id: string }>('enrollments'),
      readAll<Course & { id: string }>('courses'),
      readAll<AttendanceRecord & { id: string }>('attendance_records'),
      readAll<Grade & { id: string }>('grades'),
      readAll<UserPreferences & { id: string }>('user_preferences'),
      readAll<UserThreshold & { id: string }>('user_thresholds'),
    ],
  )

  const preferences = preferencesRows[0] ?? null
  const courseById = new Map(courses.map((course) => [course.id, course]))
  let fired = 0

  // --- Attendance -------------------------------------------------------

  const previousStates = (await getMeta<AttendanceStateCache>('attendanceStates')) ?? {}
  const nextStates: AttendanceStateCache = {}

  for (const enrollment of enrollments) {
    const records = attendance.filter((record) => record.enrollment_id === enrollment.id)
    const summary = summariseAttendance(
      {
        present: records.filter((r) => r.status === 'present').length,
        absent: records.filter((r) => r.status === 'absent').length,
        late: records.filter((r) => r.status === 'late').length,
        excused: records.filter((r) => r.status === 'excused').length,
      },
      {
        allowedAbsences: enrollment.allowed_absences ?? preferences?.default_allowed_absences ?? DEFAULT_ALLOWED_ABSENCES,
        latesPerAbsence: enrollment.lates_per_absence ?? preferences?.lates_per_absence ?? DEFAULT_LATES_PER_ABSENCE,
      },
    )

    nextStates[enrollment.id] = summary.state

    if (shouldNotifyAttendance(previousStates[enrollment.id] ?? null, summary.state)) {
      const code = courseById.get(enrollment.course_id)?.code ?? 'this subject'
      await enqueue(supabase, userId, {
        kind: 'threshold_breach',
        entity: 'enrollment',
        entityId: enrollment.id,
        title:
          summary.state === 'at_limit'
            ? `You're at the limit in ${code}`
            : `Watch your cuts in ${code}`,
        body:
          summary.remaining === 0
            ? `${summary.absenceUnits} of ${summary.allowed} used. One more affects your grade.`
            : `${summary.remaining} absence${summary.remaining === 1 ? '' : 's'} left.`,
        url: `/subjects/${enrollment.id}`,
      })
      fired += 1
    }
  }

  await setMeta('attendanceStates', nextStates)

  // --- GWA --------------------------------------------------------------

  const gradeByEnrollment = new Map(grades.map((grade) => [grade.enrollment_id, grade]))

  const graded = enrollments.map((enrollment) => {
    const grade = gradeByEnrollment.get(enrollment.id)
    const course = courseById.get(enrollment.course_id)
    return {
      enrollmentId: enrollment.id,
      code: course?.code ?? '—',
      units: Number(course?.units ?? 0),
      value: grade?.value === null || grade?.value === undefined ? null : Number(grade.value),
      mark: (grade?.mark ?? null) as never,
      isProjected: grade?.is_projected ?? false,
    }
  })

  const actual = computeGwa(graded.filter((course) => !course.isProjected))
  const projected = computeGwa(graded)

  for (const threshold of thresholds) {
    if (!threshold.active || threshold.kind !== 'gwa') continue

    const state = evaluateThreshold(
      {
        id: threshold.id,
        label: threshold.label,
        comparator: threshold.comparator as never,
        value: Number(threshold.value),
        lastState: (threshold.last_state ?? null) as ThresholdState | null,
      },
      actual.gwa,
      projected.gwa,
    )

    if (!shouldNotifyThreshold((threshold.last_state ?? null) as ThresholdState | null, state)) {
      continue
    }

    await enqueue(supabase, userId, {
      kind: 'threshold_breach',
      entity: 'threshold',
      entityId: threshold.id,
      title: state === 'breached' ? `${threshold.label} is slipping` : `${threshold.label} is at risk`,
      body:
        state === 'breached'
          ? `Your GWA is ${actual.gwa?.toFixed(2)} against a target of ${Number(threshold.value).toFixed(2)}.`
          : `Where your grades are heading puts you past ${Number(threshold.value).toFixed(2)}.`,
      url: '/subjects/gwa',
    })

    // Recording the reported state is what stops this repeating on every sync.
    await queueWrite({
      entity: 'user_thresholds',
      operation: 'update',
      payload: { id: threshold.id, last_state: state },
    })

    fired += 1
  }

  return { fired }
}

interface Alert {
  kind: string
  entity: string
  entityId: string
  title: string
  body: string
  url: string
}

async function enqueue(
  supabase: ReturnType<typeof supabaseBrowser>,
  userId: string,
  alert: Alert,
): Promise<void> {
  await supabase.from('scheduled_notifications').upsert(
    {
      user_id: userId,
      kind: alert.kind,
      entity: alert.entity,
      entity_id: alert.entityId,
      // Immediately: the crossing has already happened.
      fire_at: new Date().toISOString(),
      payload: { title: alert.title, body: alert.body, url: alert.url },
    },
    { onConflict: 'user_id,kind,entity_id,fire_at' },
  )
}
