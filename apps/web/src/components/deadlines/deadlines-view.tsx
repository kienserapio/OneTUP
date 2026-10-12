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
  type Urgency,
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
import { Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { IconDeadlines, IconPlus } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { DeadlineRow, URGENCY_COLOR } from './deadline-row'
import { DeadlineDetail } from './deadline-detail'
import { FilterChip } from '@/components/ui/filter-chip'

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

/** The two windows the summary chips count, in hours. */
const NEXT_48H = 48
const THIS_WEEK_H = 168

/** The three counted filters, in the order a student scans them. */
const STAT_FILTERS: { key: 'overdue' | 'next48' | 'week'; label: string; urgency: Urgency }[] = [
  { key: 'overdue', label: 'Overdue', urgency: 'overdue' },
  { key: 'next48', label: 'Next 48h', urgency: 'urgent' },
  { key: 'week', label: 'This week', urgency: 'upcoming' },
]

/**
 * The deadlines list.
 *
 * Urgency is recomputed on every render rather than stored, because a stored
 * urgency is wrong the moment the clock moves — and a deadline that quietly
 * stays "soon" for three days is worse than no signal at all.
 *
 * The chip row across the top is both the summary and the filter: the three
 * numbers a student scans for are the three things they then want to see on
 * their own, so tapping one narrows the list rather than opening a menu, and
 * tapping it again clears it. Finished sits in the same row, so every way of
 * narrowing the list is in one place.
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
        enrollments.map((enrollment) => [
          enrollment.id,
          courseById.get(enrollment.course_id) ?? '',
        ]),
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
        status:
          item.status === 'submitted' ? ('done' as const) : (item.status as TrackerRow['status']),
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
    [deadlines, classItems, userId],
  )

  return (
    <>
      <NavBar
        title="Deadlines"
        subtitle={
          counts.next48 > 0 ? `${counts.next48} due in the next 48 hours` : `${open.length} open`
        }
        info={
          <InfoTip title="Deadlines">
            Your own deadlines and your class posts, most urgent first. Swipe a row right or tap its
            circle to finish it; tap a chip to narrow the list.
          </InfoTip>
        }
        trailing={
          <ButtonLink
            href="/deadlines/new"
            variant="accent"
            size="sm"
            leading={<IconPlus size={18} />}
          >
            Add
          </ButtonLink>
        }
      />

      <div className="app-container stack pb-4">
        {/* The negative margin lets the chips scroll to the true screen edge on
            a phone; above the shell breakpoint it is dropped. */}
        <div
          role="group"
          aria-label="Filter deadlines"
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 min-[900px]:mx-0 min-[900px]:px-0"
        >
          {STAT_FILTERS.map((option) => (
            <FilterChip
              key={option.key}
              label={option.label}
              count={counts[option.key]}
              dot={counts[option.key] > 0 ? URGENCY_COLOR[option.urgency] : undefined}
              tone="crimson"
              active={filter === option.key}
              onSelect={() => setFilter((current) => (current === option.key ? 'all' : option.key))}
            />
          ))}
          <FilterChip
            label="Finished"
            tone="green"
            active={filter === 'done'}
            onSelect={() => setFilter((current) => (current === 'done' ? 'all' : 'done'))}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <section>
            <SectionHeader>{describeFilter(filter, visible.length)}</SectionHeader>

            {loading ? (
              <div className="skeleton h-40 rounded-[var(--radius-lg)]" />
            ) : visible.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<IconTile Icon={IconDeadlines} tone="crimson" size={52} />}
                  title={emptyCopy(filter)}
                  action={
                    filter === 'all' ? (
                      <ButtonLink
                        href="/deadlines/new"
                        variant="accent"
                        leading={<IconPlus size={18} />}
                      >
                        Add a deadline
                      </ButtonLink>
                    ) : undefined
                  }
                />
              </Card>
            ) : (
              <div className="flex flex-col gap-2.5">
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
              </div>
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
