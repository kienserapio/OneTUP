'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { readAll } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { useNow } from '@/lib/hooks/use-local'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { Button, ButtonLink } from '@/components/ui/button'
import { Badge, Card, EmptyState } from '@/components/ui/surfaces'
import { IconAnnouncement, IconCheck, IconClock, IconPlus, IconWarning } from '@/components/ui/icon'

/**
 * The announcement feed.
 *
 * Everything visible here is scoped by RLS to the reader's own courses plus
 * university-wide posts, so there is no filtering to get wrong on the client.
 * The filter row above the feed is the student's own lens, not a permission
 * boundary.
 *
 * Trust is shown, not implied: an approved class representative's post is
 * marked verified, an ordinary student's carries its confirmation count, and
 * anyone in the section can dispute one. Two disputes outweighing the
 * confirmations hides it pending moderation, and the database does that
 * counting so the tally can never drift from the rows behind it.
 */

// Type aliases rather than interfaces: `readAll` is constrained to a record
// with an index signature, and only a type literal picks one up implicitly.
type AnnouncementRow = {
  id: string
  summary: string
  detail: string | null
  type: string
  event_date: string | null
  event_time: string | null
  trust: 'official' | 'verified' | 'community'
  confirmations: number
  disputes: number
  created_at: string
  course_id: string | null
  is_university_wide: boolean
  courses?: { code: string; title: string } | null
}

type CourseRow = {
  id: string
  code: string
  title: string
}

type EnrollmentRow = {
  id: string
  course_id: string | null
}

const TYPE_LABEL: Record<string, string> = {
  exam: 'Exam',
  quiz: 'Quiz',
  deadline: 'Deadline',
  room_change: 'Room change',
  suspension: 'Suspended',
  schedule_change: 'Schedule change',
  general: 'Announcement',
}

type FilterKey = 'all' | 'mine' | 'university' | 'unconfirmed'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'mine', label: 'My subjects' },
  { key: 'university', label: 'University-wide' },
  { key: 'unconfirmed', label: 'Needs confirming' },
]

export function AnnouncementsView() {
  const router = useRouter()
  const now = useNow(60_000)
  const [items, setItems] = useState<AnnouncementRow[]>([])
  const [courses, setCourses] = useState<Map<string, CourseRow>>(new Map())
  const [myCourseIds, setMyCourseIds] = useState<Set<string>>(new Set())
  const [voted, setVoted] = useState<Map<string, boolean>>(new Map())
  const [filter, setFilter] = useState<FilterKey>('all')
  const [loading, setLoading] = useState(true)

  /**
   * Local first, then the network. The offline set holds the last fourteen days
   * of announcements, which is the window that matters for a feed, so the
   * screen paints from IndexedDB before Supabase is asked anything.
   */
  const loadLocal = useCallback(async () => {
    const [cached, courseRows, enrollments] = await Promise.all([
      readAll<AnnouncementRow & { id: string }>('announcements'),
      readAll<CourseRow & { id: string }>('courses'),
      readAll<EnrollmentRow & { id: string }>('enrollments'),
    ])

    setCourses(new Map(courseRows.map((course) => [course.id, course])))
    setMyCourseIds(
      new Set(
        enrollments
          .map((enrollment) => enrollment.course_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )

    if (cached.length > 0) {
      setItems([...cached].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      setLoading(false)
    }
  }, [])

  const loadRemote = useCallback(async () => {
    const supabase = supabaseBrowser()
    const [{ data }, { data: enrolled }, { data: user }] = await Promise.all([
      supabase
        .from('announcements')
        .select(
          'id, summary, detail, type, event_date, event_time, trust, confirmations, disputes, created_at, course_id, is_university_wide, courses(code, title)',
        )
        .order('created_at', { ascending: false })
        .limit(60),
      // Asked for again rather than trusted from the local store: on a device
      // that has not finished its first sync the store is empty, and a "my
      // subjects" filter that silently matches nothing looks like a bug.
      supabase.from('enrollments').select('course_id'),
      supabase.auth.getUser(),
    ])

    if (data) setItems(data as unknown as AnnouncementRow[])

    if (enrolled) {
      setMyCourseIds(
        new Set(
          enrolled
            .map((enrollment) => enrollment.course_id)
            .filter((id): id is string => Boolean(id)),
        ),
      )
    }

    if (user.user) {
      const { data: votes } = await supabase
        .from('announcement_confirmations')
        .select('announcement_id, is_dispute')
        .eq('user_id', user.user.id)
      setVoted(new Map((votes ?? []).map((vote) => [vote.announcement_id, vote.is_dispute])))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadLocal().then(loadRemote)
  }, [loadLocal, loadRemote])

  const decorated = useMemo(
    () =>
      items.map((announcement) => {
        const course =
          announcement.courses ??
          (announcement.course_id ? (courses.get(announcement.course_id) ?? null) : null)
        return { ...announcement, code: course?.code ?? null, courseTitle: course?.title ?? null }
      }),
    [items, courses],
  )

  const counts = useMemo(
    () => ({
      all: decorated.length,
      mine: decorated.filter((a) => a.course_id && myCourseIds.has(a.course_id)).length,
      university: decorated.filter((a) => a.is_university_wide).length,
      unconfirmed: decorated.filter((a) => a.trust === 'community' && !voted.has(a.id)).length,
    }),
    [decorated, myCourseIds, voted],
  )

  const visible = useMemo(() => {
    switch (filter) {
      case 'mine':
        return decorated.filter((a) => a.course_id && myCourseIds.has(a.course_id))
      case 'university':
        return decorated.filter((a) => a.is_university_wide)
      case 'unconfirmed':
        return decorated.filter((a) => a.trust === 'community' && !voted.has(a.id))
      default:
        return decorated
    }
  }, [decorated, filter, myCourseIds, voted])

  async function vote(announcementId: string, isDispute: boolean) {
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return

    // Marked straight away — the tally is the server's, but whether *you* have
    // answered is a fact this screen already knows.
    setVoted((prev) => new Map(prev).set(announcementId, isDispute))

    await supabase.from('announcement_confirmations').upsert(
      { announcement_id: announcementId, user_id: data.user.id, is_dispute: isDispute },
      { onConflict: 'announcement_id,user_id' },
    )

    await loadRemote()
  }

  async function toDeadline(announcement: AnnouncementRow) {
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    if (!data.user || !announcement.event_date) return

    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('course_id', announcement.course_id ?? '')
      .maybeSingle()

    const id = crypto.randomUUID()
    const dueAt = new Date(
      `${announcement.event_date}T${announcement.event_time ?? '23:59'}:00+08:00`,
    ).toISOString()

    await queueWrite({
      entity: 'deadlines',
      operation: 'insert',
      payload: {
        id,
        user_id: data.user.id,
        enrollment_id: enrollment?.id ?? null,
        title: announcement.summary,
        due_at: dueAt,
        status: 'open',
        source: 'announcement',
        // The link back is what makes the receipt real: the deadline can always
        // show where it came from.
        source_ref: announcement.id,
      },
      optimistic: {
        id,
        title: announcement.summary,
        due_at: dueAt,
        status: 'open',
        source: 'announcement',
        source_ref: announcement.id,
        updated_at: new Date().toISOString(),
      },
    })

    router.push(`/deadlines/${id}`)
  }

  return (
    <>
      <NavBar
        title="Announcements"
        subtitle={
          decorated.length > 0
            ? `${decorated.length} from the last two weeks`
            : undefined
        }
        trailing={
          <ButtonLink
            href="/announcements/new"
            variant="accent"
            className="!px-4"
            leading={<IconPlus size={18} />}
          >
            <span className="type-subheadline font-semibold">Share</span>
          </ButtonLink>
        }
      />

      <div className="app-container pb-6">
        {/* The negative margin lets the chips scroll to the true screen edge on
            a phone. Above the shell breakpoint the container's own padding is
            wider, so it is dropped rather than half-corrected. */}
        <div
          role="group"
          aria-label="Filter announcements"
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-4 min-[900px]:mx-0 min-[900px]:px-0"
        >
          {FILTERS.map((option) => (
            <FilterChip
              key={option.key}
              label={option.label}
              count={counts[option.key]}
              active={filter === option.key}
              onSelect={() => setFilter(option.key)}
            />
          ))}
        </div>

        {loading ? (
          <div className="lg:columns-2 lg:gap-4">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="skeleton mb-4 h-40 break-inside-avoid rounded-[var(--radius-md)]"
              />
            ))}
          </div>
        ) : decorated.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconAnnouncement size={30} />}
              title="Nothing from your sections yet. When your class representative posts something, share it here and everyone in your section gets it."
              action={
                <ButtonLink href="/announcements/new" variant="accent">
                  Share one
                </ButtonLink>
              }
            />
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState title="Nothing here right now. Switch back to everything to see the rest." />
          </Card>
        ) : (
          // Two columns of unequal cards read better than one long ladder, and
          // multicol keeps a single DOM order so the phone layout is untouched.
          <div className="lg:columns-2 lg:gap-4">
            {visible.map((announcement) => (
              <motion.div
                key={announcement.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={transition(spring.ui)}
                className="mb-4 break-inside-avoid"
              >
                <AnnouncementCard
                  announcement={announcement}
                  now={now}
                  vote={voted.get(announcement.id)}
                  hasVoted={voted.has(announcement.id)}
                  onConfirm={() => void vote(announcement.id, false)}
                  onDispute={() => void vote(announcement.id, true)}
                  onAddDeadline={() => void toDeadline(announcement)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function FilterChip({
  label,
  count,
  active,
  onSelect,
}: {
  label: string
  count: number
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className="type-subheadline flex min-h-[var(--target-min)] shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border px-4 font-medium transition-colors"
      style={{
        borderColor: active ? 'transparent' : 'var(--separator)',
        background: active ? 'var(--accent)' : 'var(--bg-grouped-secondary)',
        color: active ? 'var(--on-accent)' : 'var(--label-secondary)',
      }}
    >
      {label}
      <span
        className="type-data type-caption-1"
        style={{ color: active ? 'var(--on-accent)' : 'var(--label-tertiary)' }}
      >
        {count}
      </span>
    </button>
  )
}

interface DecoratedAnnouncement extends AnnouncementRow {
  code: string | null
  courseTitle: string | null
}

function AnnouncementCard({
  announcement,
  now,
  vote,
  hasVoted,
  onConfirm,
  onDispute,
  onAddDeadline,
}: {
  announcement: DecoratedAnnouncement
  now: Date
  vote: boolean | undefined
  hasVoted: boolean
  onConfirm: () => void
  onDispute: () => void
  onAddDeadline: () => void
}) {
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <TrustMarker announcement={announcement} />

        {announcement.code && (
          <span className="type-data type-caption-1 font-semibold text-[var(--label-secondary)]">
            {announcement.code}
          </span>
        )}
        <span className="type-caption-1 text-[var(--label-tertiary)]">
          {TYPE_LABEL[announcement.type] ?? 'Announcement'}
        </span>
        <span className="type-caption-1 ml-auto text-[var(--label-tertiary)]">
          {relativeTime(announcement.created_at, now)}
        </span>
      </div>

      <p className="type-body font-medium">{announcement.summary}</p>

      {announcement.event_date && (
        <p
          className="type-footnote inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1"
          style={{ background: 'var(--fill-quaternary)' }}
        >
          <IconClock size={13} className="text-[var(--label-tertiary)]" />
          <span className="type-data">
            {formatEvent(announcement.event_date, announcement.event_time)}
          </span>
        </p>
      )}

      {announcement.detail && announcement.detail !== announcement.summary && (
        <details>
          <summary className="type-footnote min-h-[var(--target-min)] cursor-pointer content-center text-[var(--accent)]">
            Original message
          </summary>
          <p className="type-footnote whitespace-pre-wrap text-[var(--label-secondary)]">
            {announcement.detail}
          </p>
        </details>
      )}

      <div
        className="flex flex-wrap items-center gap-2 border-t pt-2.5"
        style={{ borderColor: 'var(--separator-soft)' }}
      >
        {/* Full-height buttons with tightened padding: the row stays compact
            without dropping any target below the 44px minimum. */}
        {announcement.event_date && (
          <Button className="!px-3.5" onClick={onAddDeadline}>
            <span className="type-subheadline font-semibold">Add to deadlines</span>
          </Button>
        )}

        {hasVoted ? (
          <span className="type-footnote text-[var(--label-secondary)]">
            {vote ? 'You disputed this' : 'You confirmed this'}
          </span>
        ) : (
          <>
            <Button
              variant="plain"
              className="!px-2.5"
              onClick={onConfirm}
              leading={<IconCheck size={16} />}
            >
              <span className="type-subheadline font-medium">This is right</span>
            </Button>
            <Button
              variant="plain"
              className="!px-2.5"
              onClick={onDispute}
              leading={<IconWarning size={16} />}
            >
              <span className="type-subheadline font-medium">This is wrong</span>
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

function TrustMarker({ announcement }: { announcement: DecoratedAnnouncement }) {
  if (announcement.is_university_wide || announcement.trust === 'official') {
    return <Badge tone="official">Official</Badge>
  }

  if (announcement.trust === 'verified') {
    return (
      <Badge tone="verified">
        <IconCheck size={11} />
        Class rep
      </Badge>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone="neutral">
        <span className="type-data">{announcement.confirmations}</span> confirmed
      </Badge>
      {announcement.disputes > 0 && (
        <span className="type-caption-2" style={{ color: 'var(--warning)' }}>
          <span className="type-data">{announcement.disputes}</span> disputed
        </span>
      )}
    </span>
  )
}

function formatEvent(date: string, time: string | null): string {
  const instant = new Date(`${date}T${time ?? '00:00'}:00+08:00`)
  return instant.toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(time ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'Asia/Manila',
  })
}

function relativeTime(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
