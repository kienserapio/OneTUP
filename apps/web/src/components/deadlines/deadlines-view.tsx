'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  compareByUrgency,
  hoursUntil,
  urgencyOf,
  type Course,
  type Deadline,
  type Enrollment,
} from '@onetup/core'
import { readAll } from '@/lib/offline/db'
import { queueWrite, syncNow } from '@/lib/offline/sync'
import { useNow } from '@/lib/hooks/use-local'
import { cancelDeadlineReminders } from '@/lib/notifications/client'
import {
  currentUserId,
  loadClassTrackerItems,
  markPostState,
  type ClassTrackerItem,
} from '@/lib/queries/classroom'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { ButtonLink } from '@/components/ui/button'
import { Card, EmptyState, ListGroup, SectionHeader } from '@/components/ui/surfaces'
import { IconPlus } from '@/components/ui/icon'
import { DeadlineRow, URGENCY_COLOR } from './deadline-row'
import { DeadlineDetail } from './deadline-detail'
import { cx } from '@/lib/cx'

type Filter = 'all' | 'overdue' | 'next48' | 'week' | 'done'

/**
 * One line in the list, from either source.
 *
 * A class post is never copied into `deadlines` — it stays one shared row that
 * thirty people read — so the union happens here, at the point of display,
 * rather than in the table. That keeps `deadlines` exactly as private as it was
 * before classrooms existed, and it means a student can always tell which of
 * their commitments they created and which the class did.
 */
interface TrackerRow {
  id: string
  title: string
  dueAt: string
  courseCode: string | null
  status: 'open' | 'done' | 'dismissed'
  fromAnnouncement: boolean
  /** Set only for a class post: the section that published it. */
  sectionCode: string | null
  source: 'personal' | 'class'
  href: string
  /** Personal deadlines only; used to order the finished list. */
  completedAt: string | null
}

/** The two windows the summary strip counts, in hours. */
const NEXT_48H = 48
const THIS_WEEK_H = 168

/**
 * The deadlines list.
 *
 * Urgency is recomputed on every render rather than stored, because a stored
 * urgency is wrong the moment the clock moves — and a deadline that quietly
 * stays "soon" for three days is worse than no signal at all.
 *
 * The strip across the top is both the summary and the filter: the three
 * numbers a student scans for are the three things they then want to see on
 * their own, so tapping one narrows the list rather than opening a menu.
 *
 * Above `lg` the selected deadline opens beside the list instead of replacing
 * it. `/deadlines/[id]` still exists and still works — it is what a phone gets,
 * and what a shared link opens.
 */
export function DeadlinesView() {
  const now = useNow(60_000)
  const paneOpen = useDetailPane()

  const [deadlines, setDeadlines] = useState<(Deadline & { id: string })[]>([])
  const [classItems, setClassItems] = useState<ClassTrackerItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [courseByEnrollment, setCourseByEnrollment] = useState<Map<string, string>>(new Map())
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const id = await currentUserId()
    setUserId(id)

    const [rows, enrollments, courses, fromClass] = await Promise.all([
      readAll<Deadline & { id: string }>('deadlines'),
      readAll<Enrollment & { id: string }>('enrollments'),
      readAll<Course & { id: string }>('courses'),
      id ? loadClassTrackerItems(id) : Promise.resolve([]),
    ])

    const courseById = new Map(courses.map((course) => [course.id, course.code]))
    setCourseByEnrollment(
      new Map(
        enrollments.map((enrollment) => [enrollment.id, courseById.get(enrollment.course_id) ?? '']),
      ),
    )
    setDeadlines(rows)
    setClassItems(fromClass)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
    void syncNow().then(reload)
  }, [reload])

  const rows = useMemo<TrackerRow[]>(
    () => [
      ...deadlines.map((deadline) => ({
        id: deadline.id,
        title: deadline.title,
        dueAt: deadline.due_at,
        courseCode: deadline.enrollment_id
          ? (courseByEnrollment.get(deadline.enrollment_id) ?? null)
          : null,
        status: deadline.status,
        fromAnnouncement: deadline.source === 'announcement',
        sectionCode: null,
        source: 'personal' as const,
        href: `/deadlines/${deadline.id}`,
        completedAt: deadline.completed_at,
      })),
      ...classItems.map((item) => ({
        id: item.id,
        title: item.title,
        dueAt: item.dueAt,
        courseCode: item.courseCode,
        status: item.status === 'submitted' ? ('done' as const) : (item.status as TrackerRow['status']),
        fromAnnouncement: false,
        sectionCode: item.sectionCode,
        source: 'class' as const,
        href: `/classroom/posts/${item.id}`,
        completedAt: null,
      })),
    ],
    [deadlines, classItems, courseByEnrollment],
  )

  const open = useMemo(() => rows.filter((row) => row.status === 'open'), [rows])

  const counts = useMemo(
    () => ({
      overdue: open.filter((d) => urgencyOf({ dueAt: d.dueAt, status: 'open' }, now) === 'overdue')
        .length,
      next48: open.filter((d) => within(d.dueAt, now, NEXT_48H)).length,
      week: open.filter((d) => within(d.dueAt, now, THIS_WEEK_H)).length,
    }),
    [open, now],
  )

  const visible = useMemo(() => {
    if (filter === 'done') {
      return rows
        .filter((row) => row.status === 'done')
        .sort((a, b) => Date.parse(b.completedAt ?? b.dueAt) - Date.parse(a.completedAt ?? a.dueAt))
    }

    const matching = open.filter((row) => {
      switch (filter) {
        case 'overdue':
          return urgencyOf({ dueAt: row.dueAt, status: 'open' }, now) === 'overdue'
        case 'next48':
          return within(row.dueAt, now, NEXT_48H)
        case 'week':
          return within(row.dueAt, now, THIS_WEEK_H)
        default:
          return true
      }
    })

    return matching.sort((a, b) =>
      compareByUrgency({ dueAt: a.dueAt, status: 'open' }, { dueAt: b.dueAt, status: 'open' }, now),
    )
  }, [rows, open, filter, now])

  // The pane always has something in it: falling back to the top of the list is
  // less jarring than an empty half-screen after completing the selected item.
  useEffect(() => {
    if (!paneOpen) return
    // The pane shows a personal deadline; a class post has its own screen,
    // where the submission control and the log live.
    const own = visible.filter((row) => row.source === 'personal')
    if (selectedId && own.some((row) => row.id === selectedId)) return
    setSelectedId(own[0]?.id ?? null)
  }, [paneOpen, selectedId, visible])

  const selected = deadlines.find((deadline) => deadline.id === selectedId) ?? null

  const complete = useCallback(
    async (id: string) => {
      /* A class post is marked done on the student's own state row, which is
       * the only part of a shared post they own. The post itself is untouched:
       * one person finishing something does not finish it for thirty. */
      const item = classItems.find((entry) => entry.id === id)
      if (item) {
        if (!userId) return
        const next = item.status === 'done' || item.status === 'submitted' ? 'open' : 'done'
        setClassItems((prev) =>
          prev.map((entry) => (entry.id === id ? { ...entry, status: next } : entry)),
        )
        await markPostState(id, userId, next)
        return
      }

      const deadline = deadlines.find((entry) => entry.id === id)
      if (!deadline) return

      const done = deadline.status !== 'done'
      const patch = {
        id,
        status: done ? ('done' as const) : ('open' as const),
        completed_at: done ? new Date().toISOString() : null,
      }

      setDeadlines((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))

      await queueWrite({
        entity: 'deadlines',
        operation: 'update',
        payload: patch,
        optimistic: { ...deadline, ...patch, updated_at: new Date().toISOString() },
      })

      // Reminders for something already done are pure noise.
      if (done) await cancelDeadlineReminders(id)
    },
    [deadlines, classItems, userId],
  )

  return (
    <>
      <NavBar
        title="Deadlines"
        subtitle={
          counts.next48 > 0
            ? `${counts.next48} due in the next 48 hours`
            : `${open.length} open`
        }
        trailing={
          <ButtonLink
            href="/deadlines/new"
            variant="plain"
            size="sm"
            leading={<IconPlus size={18} />}
          >
            Add
          </ButtonLink>
        }
      />

      <div className="app-container stack pb-4">
        <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Filter deadlines">
          <SummaryStat
            label="Overdue"
            value={counts.overdue}
            tone={URGENCY_COLOR.overdue}
            active={filter === 'overdue'}
            onToggle={() => setFilter((current) => (current === 'overdue' ? 'all' : 'overdue'))}
          />
          <SummaryStat
            label="Next 48h"
            value={counts.next48}
            tone={URGENCY_COLOR.urgent}
            active={filter === 'next48'}
            onToggle={() => setFilter((current) => (current === 'next48' ? 'all' : 'next48'))}
          />
          <SummaryStat
            label="This week"
            value={counts.week}
            tone={URGENCY_COLOR.upcoming}
            active={filter === 'week'}
            onToggle={() => setFilter((current) => (current === 'week' ? 'all' : 'week'))}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <section>
            <SectionHeader
              action={
                <button
                  type="button"
                  onClick={() => setFilter((current) => (current === 'done' ? 'all' : 'done'))}
                  className="type-footnote min-h-[var(--target-min)] font-medium text-[var(--accent)]"
                >
                  {filter === 'done' ? 'Show open' : 'Show finished'}
                </button>
              }
            >
              {describeFilter(filter, visible.length)}
            </SectionHeader>

            {loading ? (
              <div className="skeleton h-40 rounded-[var(--radius-md)]" />
            ) : visible.length === 0 ? (
              <Card>
                <EmptyState
                  title={emptyCopy(filter)}
                  action={
                    filter === 'all' ? (
                      <ButtonLink href="/deadlines/new" variant="accent">
                        Add a deadline
                      </ButtonLink>
                    ) : undefined
                  }
                />
              </Card>
            ) : (
              <ListGroup>
                <AnimatePresence initial={false}>
                  {visible.map((row) => (
                    <motion.div
                      key={`${row.source}-${row.id}`}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={transition(spring.ui)}
                    >
                      <DeadlineRow
                        id={row.id}
                        title={row.title}
                        dueAt={row.dueAt}
                        courseCode={row.courseCode}
                        status={row.status}
                        fromAnnouncement={row.fromAnnouncement}
                        sectionCode={row.sectionCode}
                        href={row.href}
                        now={now}
                        onComplete={complete}
                        onOpen={paneOpen && row.source === 'personal' ? setSelectedId : undefined}
                        selected={paneOpen && row.source === 'personal' && row.id === selectedId}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </ListGroup>
            )}
          </section>

          {/* Mounted only where there is room for it; the phone navigates to
              /deadlines/[id] instead, which is the same content in one column. */}
          {paneOpen && (
            <div className="hidden lg:block">
              <DeadlineDetail
                deadline={selected}
                courseCode={
                  selected?.enrollment_id ? courseByEnrollment.get(selected.enrollment_id) : null
                }
                now={now}
                onComplete={complete}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SummaryStat({
  label,
  value,
  tone,
  active,
  onToggle,
}: {
  label: string
  value: number
  tone: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cx(
        'card squircle flex min-h-[var(--target-min)] flex-col items-start px-3 py-2.5 text-left',
        'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
      )}
      style={
        active
          ? { background: 'var(--accent-subtle)', borderColor: 'var(--accent-border)' }
          : undefined
      }
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="block size-2 shrink-0 rounded-full"
          style={{ background: value > 0 ? tone : 'var(--label-quaternary)' }}
        />
        <span className="type-title-2 type-data" style={value > 0 ? { color: tone } : undefined}>
          {value}
        </span>
      </span>
      <span className="type-caption-1 mt-0.5 text-[var(--label-secondary)]">{label}</span>
    </button>
  )
}

/** Open and inside a forward-looking window — overdue is counted separately. */
function within(dueAt: string, now: Date, hours: number): boolean {
  const left = hoursUntil(dueAt, now)
  return left >= 0 && left <= hours
}

function describeFilter(filter: Filter, count: number): string {
  switch (filter) {
    case 'done':
      return `${count} finished`
    case 'overdue':
      return `${count} overdue`
    case 'next48':
      return `${count} in the next 48 hours`
    case 'week':
      return `${count} in the next 7 days`
    default:
      return `${count} open`
  }
}

function emptyCopy(filter: Filter): string {
  switch (filter) {
    case 'done':
      return 'Nothing finished yet.'
    case 'overdue':
      return 'Nothing overdue. That is the whole point.'
    case 'next48':
      return 'Nothing due in the next 48 hours.'
    case 'week':
      return 'Nothing due in the next 7 days.'
    default:
      return 'Nothing due. Add one when it comes up.'
  }
}

/**
 * Whether the detail pane is on screen.
 *
 * Matched in JS as well as CSS because the row has to *know*: where the pane is
 * mounted a click selects, and where it is not the same click has to navigate.
 * 64rem is Tailwind's `lg`, which is where the grid splits above.
 */
function useDetailPane(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 64rem)')
    const update = () => setOpen(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return open
}
