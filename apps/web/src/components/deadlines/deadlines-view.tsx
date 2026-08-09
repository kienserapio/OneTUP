'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { compareByUrgency, urgencyOf, type Deadline, type Enrollment, type Course } from '@onetup/core'
import { readAll } from '@/lib/offline/db'
import { queueWrite, syncNow } from '@/lib/offline/sync'
import { useNow } from '@/lib/hooks/use-local'
import { cancelDeadlineReminders } from '@/lib/notifications/client'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { ButtonLink } from '@/components/ui/button'
import { Card, EmptyState, ListGroup, SectionHeader } from '@/components/ui/surfaces'
import { IconPlus } from '@/components/ui/icon'
import { DeadlineRow } from './deadline-row'
import { cx } from '@/lib/cx'

type Filter = 'all' | 'next48' | 'done'

/**
 * The deadlines list.
 *
 * Urgency is recomputed on every render rather than stored, because a stored
 * urgency is wrong the moment the clock moves — and a deadline that quietly
 * stays "soon" for three days is worse than no signal at all.
 */
export function DeadlinesView() {
  const now = useNow(60_000)
  const [deadlines, setDeadlines] = useState<(Deadline & { id: string })[]>([])
  const [courseByEnrollment, setCourseByEnrollment] = useState<Map<string, string>>(new Map())
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [rows, enrollments, courses] = await Promise.all([
      readAll<Deadline & { id: string }>('deadlines'),
      readAll<Enrollment & { id: string }>('enrollments'),
      readAll<Course & { id: string }>('courses'),
    ])

    const courseById = new Map(courses.map((course) => [course.id, course.code]))
    setCourseByEnrollment(
      new Map(
        enrollments.map((enrollment) => [
          enrollment.id,
          courseById.get(enrollment.course_id) ?? '',
        ]),
      ),
    )
    setDeadlines(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
    void syncNow().then(reload)
  }, [reload])

  const visible = useMemo(() => {
    const open = deadlines.filter((deadline) => deadline.status === 'open')

    if (filter === 'done') {
      return deadlines
        .filter((deadline) => deadline.status === 'done')
        .sort((a, b) => Date.parse(b.completed_at ?? b.due_at) - Date.parse(a.completed_at ?? a.due_at))
    }

    if (filter === 'next48') {
      return open
        .filter((deadline) => {
          const urgency = urgencyOf({ dueAt: deadline.due_at, status: 'open' }, now)
          return urgency === 'overdue' || urgency === 'critical' || urgency === 'urgent'
        })
        .sort((a, b) =>
          compareByUrgency(
            { dueAt: a.due_at, status: 'open' },
            { dueAt: b.due_at, status: 'open' },
            now,
          ),
        )
    }

    return open.sort((a, b) =>
      compareByUrgency(
        { dueAt: a.due_at, status: 'open' },
        { dueAt: b.due_at, status: 'open' },
        now,
      ),
    )
  }, [deadlines, filter, now])

  const urgentCount = deadlines.filter((deadline) => {
    if (deadline.status !== 'open') return false
    const urgency = urgencyOf({ dueAt: deadline.due_at, status: 'open' }, now)
    return urgency === 'overdue' || urgency === 'critical' || urgency === 'urgent'
  }).length

  const complete = useCallback(
    async (id: string) => {
      const deadline = deadlines.find((entry) => entry.id === id)
      if (!deadline) return

      const done = deadline.status !== 'done'
      const patch = {
        id,
        status: done ? ('done' as const) : ('open' as const),
        completed_at: done ? new Date().toISOString() : null,
      }

      setDeadlines((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
      )

      await queueWrite({
        entity: 'deadlines',
        operation: 'update',
        payload: patch,
        optimistic: { ...deadline, ...patch, updated_at: new Date().toISOString() },
      })

      // Reminders for something already done are pure noise.
      if (done) await cancelDeadlineReminders(id)
    },
    [deadlines],
  )

  return (
    <>
      <NavBar
        title="Deadlines"
        subtitle={urgentCount > 0 ? `${urgentCount} due in the next 48 hours` : undefined}
        trailing={
          <ButtonLink href="/deadlines/new" variant="plain" size="sm" leading={<IconPlus size={20} />}>
            <span className="sr-only">Add a deadline</span>
          </ButtonLink>
        }
      />

      <div className="app-container stack">
        <div className="segmented self-start" role="tablist" aria-label="Filter deadlines">
          {(
            [
              ['all', 'Everything'],
              ['next48', 'Next 48 hours'],
              ['done', 'Done'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cx('segmented-item')}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="skeleton h-40 rounded-[var(--radius-lg)]" />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              title={
                filter === 'done'
                  ? 'Nothing finished yet.'
                  : filter === 'next48'
                    ? 'Nothing due in the next 48 hours.'
                    : 'Nothing due. Add one when it comes up.'
              }
              action={
                filter !== 'done' ? (
                  <ButtonLink href="/deadlines/new" variant="accent">
                    Add a deadline
                  </ButtonLink>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <section>
            <SectionHeader>
              {visible.length} {filter === 'done' ? 'finished' : 'open'}
            </SectionHeader>
            <ListGroup>
              <AnimatePresence initial={false}>
                {visible.map((deadline) => (
                  <motion.div
                    key={deadline.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={transition(spring.ui)}
                  >
                    <DeadlineRow
                      id={deadline.id}
                      title={deadline.title}
                      dueAt={deadline.due_at}
                      courseCode={
                        deadline.enrollment_id
                          ? courseByEnrollment.get(deadline.enrollment_id)
                          : null
                      }
                      status={deadline.status}
                      fromAnnouncement={deadline.source === 'announcement'}
                      now={now}
                      onComplete={complete}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </ListGroup>
          </section>
        )}
      </div>
    </>
  )
}
