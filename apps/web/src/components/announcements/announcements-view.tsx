'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { queueWrite } from '@/lib/offline/sync'
import { useNow } from '@/lib/hooks/use-local'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { Button, ButtonLink } from '@/components/ui/button'
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { IconAnnouncement, IconCheck, IconPlus, IconWarning } from '@/components/ui/icon'

/**
 * The announcement feed.
 *
 * Everything visible here is scoped by RLS to the reader's own courses plus
 * university-wide posts, so there is no filtering to get wrong on the client.
 *
 * Trust is shown, not implied: an approved class representative's post is
 * marked verified, an ordinary student's carries its confirmation count, and
 * anyone in the section can dispute one. Two disputes outweighing the
 * confirmations hides it pending moderation, and the database does that
 * counting so the tally can never drift from the rows behind it.
 */

interface AnnouncementRow {
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
  courses: { code: string; title: string } | null
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

export function AnnouncementsView() {
  const router = useRouter()
  const now = useNow(60_000)
  const [items, setItems] = useState<AnnouncementRow[]>([])
  const [voted, setVoted] = useState<Map<string, boolean>>(new Map())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = supabaseBrowser()
    const [{ data }, { data: user }] = await Promise.all([
      supabase
        .from('announcements')
        .select(
          'id, summary, detail, type, event_date, event_time, trust, confirmations, disputes, created_at, course_id, is_university_wide, courses(code, title)',
        )
        .order('created_at', { ascending: false })
        .limit(60),
      supabase.auth.getUser(),
    ])

    setItems((data ?? []) as unknown as AnnouncementRow[])

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
    void load()
  }, [load])

  async function vote(announcementId: string, isDispute: boolean) {
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return

    await supabase.from('announcement_confirmations').upsert(
      { announcement_id: announcementId, user_id: data.user.id, is_dispute: isDispute },
      { onConflict: 'announcement_id,user_id' },
    )

    setVoted((prev) => new Map(prev).set(announcementId, isDispute))
    await load()
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
        trailing={
          <ButtonLink
            href="/announcements/new"
            variant="plain"
            size="sm"
            leading={<IconPlus size={20} />}
          >
            <span className="sr-only">Share an announcement</span>
          </ButtonLink>
        }
      />

      <div className="app-container stack">
        {loading ? (
          <div className="skeleton h-40 rounded-[var(--radius-lg)]" />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconAnnouncement size={30} />}
              title="Nothing from your sections yet. When your beadle posts something, share it here and everyone in your section gets it."
              action={
                <ButtonLink href="/announcements/new" variant="accent">
                  Share one
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <section>
            <SectionHeader>Your sections</SectionHeader>
            <div className="stack">
              {items.map((announcement) => (
                <motion.div
                  key={announcement.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={transition(spring.ui)}
                >
                  <Card>
                    <div className="flex flex-wrap items-center gap-2">
                      {announcement.is_university_wide ? (
                        <Badge tone="official">University-wide</Badge>
                      ) : announcement.trust === 'verified' ? (
                        <Badge tone="verified">
                          <IconCheck size={11} />
                          Class rep
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          {announcement.confirmations} confirmed
                        </Badge>
                      )}

                      {announcement.courses && (
                        <span className="type-data type-caption-1 text-[var(--label-secondary)]">
                          {announcement.courses.code}
                        </span>
                      )}
                      <span className="type-caption-1 text-[var(--label-tertiary)]">
                        {TYPE_LABEL[announcement.type] ?? 'Announcement'}
                      </span>
                    </div>

                    <p className="type-body mt-2">{announcement.summary}</p>

                    {announcement.event_date && (
                      <p className="type-data type-footnote mt-1 text-[var(--label-secondary)]">
                        {formatEvent(announcement.event_date, announcement.event_time)}
                      </p>
                    )}

                    {announcement.detail && announcement.detail !== announcement.summary && (
                      <details className="mt-2">
                        <summary className="type-footnote cursor-pointer text-[var(--accent)]">
                          Original message
                        </summary>
                        <p className="type-footnote mt-2 whitespace-pre-wrap text-[var(--label-secondary)]">
                          {announcement.detail}
                        </p>
                      </details>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {announcement.event_date && (
                        <Button size="sm" onClick={() => void toDeadline(announcement)}>
                          Add to deadlines
                        </Button>
                      )}

                      {voted.has(announcement.id) ? (
                        <span className="type-footnote text-[var(--label-secondary)]">
                          {voted.get(announcement.id) ? 'You disputed this' : 'You confirmed this'}
                        </span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="plain"
                            onClick={() => void vote(announcement.id, false)}
                            leading={<IconCheck size={16} />}
                          >
                            This is right
                          </Button>
                          <Button
                            size="sm"
                            variant="plain"
                            onClick={() => void vote(announcement.id, true)}
                            leading={<IconWarning size={16} />}
                          >
                            This is wrong
                          </Button>
                        </>
                      )}
                    </div>

                    <p className="type-caption-2 mt-2 text-[var(--label-tertiary)]">
                      Shared {relativeTime(announcement.created_at, now)}
                    </p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
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
