'use client'

import { useEffect, useState } from 'react'
import { readAll } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import { loadSubjects } from '@/lib/queries/subjects'
import { readStreak } from '@/lib/queries/study'

/**
 * The handful of numbers the profile shows off.
 *
 * Every one is read from the local store the other screens already keep, so
 * the profile never disagrees with Subjects or Deadlines and works with no
 * signal. Nothing here is a new metric: a figure a student cannot trace back to
 * a screen of their own data has no business on a page about them.
 */
export interface ProfileStats {
  termLabel: string | null
  subjects: number
  units: number
  /** Cumulative, across every term — the same figure /gwa leads with. */
  gwa: number | null
  /** Sessions attended (present or late) out of sessions held, 0–100. null with no records. */
  attendanceRate: number | null
  absences: number
  sessions: number
  deadlinesDone: number
  deadlinesOpen: number
  studyStreak: number
  /** The earliest class start of the week, "HH:MM", for the early-bird badge. */
  earliestStart: string | null
}

export function useProfileStats(): ProfileStats | null {
  const [stats, setStats] = useState<ProfileStats | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const [subjects, deadlines, blocks, streak] = await Promise.all([
        loadSubjects(new Date()),
        readAll<{ id: string; status?: string }>('deadlines'),
        readAll<{ id: string; start_time?: string }>('schedule_blocks'),
        readStreak(manilaDate()),
      ])

      let attended = 0
      let absences = 0
      for (const subject of subjects.subjects) {
        attended += subject.attendance.present + subject.attendance.late
        absences += subject.attendance.absent
      }
      const sessions = attended + absences

      const starts = blocks
        .map((block) => block.start_time?.slice(0, 5))
        .filter((start): start is string => Boolean(start))
        .sort()

      if (cancelled) return
      setStats({
        termLabel: subjects.termLabel,
        subjects: subjects.subjects.length,
        units: subjects.termUnits,
        gwa: subjects.cumulative.gwa,
        attendanceRate: sessions > 0 ? Math.round((attended / sessions) * 100) : null,
        absences,
        sessions,
        deadlinesDone: deadlines.filter((d) => d.status === 'done').length,
        deadlinesOpen: deadlines.filter((d) => d.status === 'open').length,
        studyStreak: streak,
        earliestStart: starts[0] ?? null,
      })
    }

    // Local first so the numbers are there at once, then again after a pull.
    void load()
      .then(() => syncNow())
      .then(() => load())
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  return stats
}

function manilaDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}
