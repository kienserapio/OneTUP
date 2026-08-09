'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import {
  formatWeekday,
  type Course,
  type Enrollment,
  type ParsedCourse,
  type ScheduleBlockRow,
  type ScheduleChange,
  type ScheduleChangeKind,
  type Weekday,
} from '@onetup/core'
import type { ImportProposal, ReviewedCourse } from '@/lib/import/types'
import { readAll } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import { supabaseBrowser } from '@/lib/supabase/client'
import { spring, transition } from '@/design/motion'
import { Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { Button, ButtonLink } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { NavBar } from '@/components/app/nav-bar'
import { IconCheck, IconClose, IconRefresh, IconWarning } from '@/components/ui/icon'
import { ErsConnect, PasteBox } from '@/components/schedule/import-source'

/**
 * Re-sync.
 *
 * The rule this screen exists to enforce: a fresh import never overwrites a
 * committed schedule. It is diffed, and the student accepts or rejects each
 * change on its own (TDD §3.3). A dropped course asks twice, because accepting
 * it deletes attendance and grades the student spent a semester recording —
 * the one action here that cannot be walked back.
 *
 * Rejections are remembered server-side against a hash of the change, so the
 * next re-sync does not argue the same point again.
 */

type Stage = 'source' | 'connect' | 'paste' | 'review' | 'done'

interface DiffChange extends ScheduleChange {
  hash: string
}

interface CommittedCourseLocal {
  code: string
  title: string
  faculty: string | null
  lecUnits: number
  labUnits: number
  units: number
  enrollmentId: string
  meetings: { day: Weekday; startTime: string; endTime: string; room: string }[]
}

export interface ScheduleResyncProps {
  studentNumber: string
  emailVerified: boolean
  termCode: string
  termLabel: string
}

export function ScheduleResync({
  studentNumber,
  emailVerified,
  termCode,
  termLabel,
}: ScheduleResyncProps) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('source')
  const [proposal, setProposal] = useState<ImportProposal | null>(null)
  const [source, setSource] = useState<'ers_import' | 'paste'>('ers_import')
  const [jobId, setJobId] = useState<string | null>(null)

  const [changes, setChanges] = useState<DiffChange[]>([])
  const [termId, setTermId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, boolean>>({})

  const [confirming, setConfirming] = useState<DiffChange | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState({ accepted: 0, rejected: 0 })

  const runDiff = useCallback(
    async (fresh: ImportProposal) => {
      setBusy(true)
      setError(null)
      try {
        const response = await fetch('/api/schedule/diff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            term_code: termCode,
            courses: fresh.courses.map((course) => ({
              code: course.code,
              title: course.title,
              faculty: course.faculty,
              meetings: course.meetings.map((meeting) => ({
                day: meeting.day,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                room: meeting.room,
              })),
            })),
          }),
        })

        const body = await response.json()
        if (!response.ok) {
          setError(body?.error?.message ?? 'We could not compare that against your schedule.')
          return
        }

        setChanges(body.changes ?? [])
        setTermId(body.term_id ?? null)
        setUserId(body.user_id ?? null)
        setDecisions({})
        setStage('review')
      } catch {
        setError('That comparison needs a connection. Try again when you have one.')
      } finally {
        setBusy(false)
      }
    },
    [termCode],
  )

  async function apply() {
    setBusy(true)
    setError(null)

    try {
      const accepted = changes.filter((change) => decisions[change.hash] === true)
      const rejected = changes.filter((change) => decisions[change.hash] === false)

      const committed = await loadCommitted()
      const incoming = new Map(proposal?.courses.map((course) => [course.code, course]) ?? [])

      const removals = accepted
        .filter((change) => change.kind === 'course_removed')
        .map((change) => committed.get(change.courseCode)?.enrollmentId)
        .filter((id): id is string => Boolean(id))

      const courses = buildCourses(accepted, committed, incoming)

      if (courses.length > 0) {
        const response = await fetch('/api/schedule/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term_code: termCode, source, job_id: jobId, courses }),
        })
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error?.message ?? 'Those changes did not save. Try again.')
        }
      }

      const supabase = supabaseBrowser()

      // Deleting the enrollment is what cascades to attendance and grades. It
      // only ever runs behind the second confirmation.
      for (const enrollmentId of removals) {
        const { error: removeError } = await supabase
          .from('enrollments')
          .delete()
          .eq('id', enrollmentId)
        if (removeError) throw new Error(removeError.message)
      }

      if (rejected.length > 0 && termId && userId) {
        const { error: rejectError } = await supabase.from('schedule_rejections').insert(
          rejected.map((change) => ({
            user_id: userId,
            term_id: termId,
            change_kind: change.kind,
            course_code: change.courseCode,
            change_hash: change.hash,
          })),
        )
        if (rejectError) throw new Error(rejectError.message)
      }

      await syncNow()
      setApplied({ accepted: accepted.length, rejected: rejected.length })
      setStage('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const decided = changes.filter((change) => decisions[change.hash] !== undefined).length

  return (
    <>
      <NavBar
        title="Re-sync"
        subtitle={termLabel || undefined}
        back={{ href: '/schedule', label: 'Schedule' }}
      />

      <div className="app-container pb-6">
        {error && (
          <p
            role="alert"
            className="type-subheadline mb-4 rounded-[var(--radius-sm)] px-3.5 py-2.5"
            style={{
              background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
              color: 'var(--danger)',
            }}
          >
            {error}
          </p>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={stage}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={transition(spring.ui)}
          >
            {stage === 'source' && (
              <SourceStep
                onConnect={() => setStage('connect')}
                onPaste={() => setStage('paste')}
              />
            )}

            {stage === 'connect' && (
              <ErsConnect
                studentNumber={studentNumber}
                termCode={termCode}
                termLabel={termLabel}
                emailVerified={emailVerified}
                submitLabel="Check for changes"
                busyLabel="Reading ERS…"
                onImported={(fresh, job) => {
                  setProposal(fresh)
                  setSource('ers_import')
                  setJobId(job)
                  void runDiff(fresh)
                }}
                onPaste={() => setStage('paste')}
                onCancel={() => setStage('source')}
              />
            )}

            {stage === 'paste' && (
              <PasteBox
                title="Paste the current schedule"
                submitLabel="Compare it"
                onParsed={(fresh) => {
                  setProposal(fresh)
                  setSource('paste')
                  setJobId(null)
                  void runDiff(fresh)
                }}
                onCancel={() => setStage('source')}
              />
            )}

            {stage === 'review' && (
              <ReviewStep
                changes={changes}
                decisions={decisions}
                decided={decided}
                busy={busy}
                onDecide={(change, accept) => {
                  // A dropped course is the only change that asks twice.
                  if (accept && change.kind === 'course_removed') {
                    setConfirming(change)
                    return
                  }
                  setDecisions((prev) => ({ ...prev, [change.hash]: accept }))
                }}
                onApply={() => void apply()}
                onStartOver={() => setStage('source')}
              />
            )}

            {stage === 'done' && <DoneStep applied={applied} onBack={() => router.push('/schedule' as never)} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <RemovalConfirm
        change={confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) {
            setDecisions((prev) => ({ ...prev, [confirming.hash]: true }))
          }
          setConfirming(null)
        }}
      />
    </>
  )
}

function SourceStep({
  onConnect,
  onPaste,
}: {
  onConnect: () => void
  onPaste: () => void
}) {
  return (
    <div className="stack">
      <header>
        <h2 className="type-title-2">Check ERS for changes</h2>
        <p className="type-subheadline mt-1 max-w-[60ch] text-[var(--label-secondary)]">
          We read your schedule again and show you what moved. Nothing changes until you say so, and
          blocks you added by hand are never touched.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <ListGroup>
          <ListRow
            onClick={onConnect}
            leading={<IconRefresh size={20} />}
            title="Connect ERS"
            subtitle="Password used once, then discarded"
          />
          <ListRow
            onClick={onPaste}
            title="Paste the current schedule"
            subtitle="No password needed"
          />
        </ListGroup>

        <Card>
          <p className="type-subheadline font-medium">What a re-sync will not do:</p>
          <ul className="mt-2 space-y-2">
            {[
              'Overwrite anything before you have accepted it.',
              'Touch a block you added by hand.',
              'Ask you again about a change you already rejected.',
            ].map((point) => (
              <li key={point} className="type-subheadline flex gap-2.5">
                <IconCheck size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--ok)' }} />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function ReviewStep({
  changes,
  decisions,
  decided,
  busy,
  onDecide,
  onApply,
  onStartOver,
}: {
  changes: DiffChange[]
  decisions: Record<string, boolean>
  decided: number
  busy: boolean
  onDecide: (change: DiffChange, accept: boolean) => void
  onApply: () => void
  onStartOver: () => void
}) {
  if (changes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<IconCheck size={28} />}
          title="Nothing has changed. Your schedule already matches ERS."
          action={
            <ButtonLink href="/schedule" variant="accent">
              Back to my week
            </ButtonLink>
          }
        />
      </Card>
    )
  }

  return (
    <div className="stack">
      <header>
        <h2 className="type-title-2">
          {changes.length} change{changes.length === 1 ? '' : 's'}
        </h2>
        <p className="type-subheadline mt-1 max-w-[60ch] text-[var(--label-secondary)]">
          Decide on each one. Anything you reject will not be proposed again unless ERS changes it
          afresh. <span className="type-data">{decided}</span> of{' '}
          <span className="type-data">{changes.length}</span> decided.
        </p>
      </header>

      {/* Changes are independent decisions, so they tile rather than stack once
          the column is wide enough to fit two side by side. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {changes.map((change) => (
          <ChangeCard
            key={change.hash}
            change={change}
            decision={decisions[change.hash]}
            onDecide={(accept) => onDecide(change, accept)}
          />
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="plain" onClick={onStartOver} disabled={busy}>
          Start over
        </Button>
        <Button variant="accent" block onClick={onApply} disabled={busy || decided === 0}>
          {busy ? 'Applying…' : `Apply ${decided} decision${decided === 1 ? '' : 's'}`}
        </Button>
      </div>

      {decided < changes.length && (
        <p className="type-footnote text-center text-[var(--label-secondary)]">
          {changes.length - decided} left undecided. Those stay as they are and come back next
          re-sync.
        </p>
      )}
    </div>
  )
}

function ChangeCard({
  change,
  decision,
  onDecide,
}: {
  change: DiffChange
  decision: boolean | undefined
  onDecide: (accept: boolean) => void
}) {
  const removal = change.kind === 'course_removed'

  return (
    <motion.div
      layout
      transition={transition(spring.ui)}
      // The ring lives on the wrapper so the card keeps its own elevation.
      style={
        removal
          ? { boxShadow: '0 0 0 1px var(--danger)', borderRadius: 'var(--radius-lg)' }
          : undefined
      }
    >
      <Card>
        <div className="flex items-start gap-2.5">
          {removal && (
            <IconWarning size={19} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
          )}
          <div className="min-w-0 flex-1">
            <p
              className="type-caption-2 font-semibold uppercase tracking-[0.04em]"
              style={{ color: kindColor(change.kind) }}
            >
              {KIND_LABEL[change.kind]}
            </p>
            <p className="type-body mt-1">{humanise(change)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant={decision === true ? 'accent' : 'glass'}
            onClick={() => onDecide(true)}
            aria-pressed={decision === true}
            leading={<IconCheck size={16} />}
            className="flex-1 justify-center"
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="plain"
            onClick={() => onDecide(false)}
            aria-pressed={decision === false}
            leading={<IconClose size={16} />}
            className="flex-1 justify-center"
            style={decision === false ? { color: 'var(--label)' } : undefined}
          >
            Reject
          </Button>
        </div>

        {decision !== undefined && (
          <p className="type-footnote mt-2 text-[var(--label-secondary)]">
            {decision
              ? 'Will be applied when you press Apply.'
              : 'Will be remembered, and not proposed again.'}
          </p>
        )}
      </Card>
    </motion.div>
  )
}

/**
 * The second ask on a dropped course. Stated in terms of what the student
 * loses, not in terms of rows — "PE 4" means nothing next to "the attendance
 * you recorded for it".
 */
function RemovalConfirm({
  change,
  onCancel,
  onConfirm,
}: {
  change: DiffChange | null
  onCancel: () => void
  onConfirm: () => void
}) {
  // Held past the close so the course code does not blank out mid-dismissal.
  const [shown, setShown] = useState<DiffChange | null>(change)
  if (change && change !== shown) setShown(change)

  return (
    <Sheet
      open={change !== null}
      onClose={onCancel}
      title="Remove this subject?"
      footer={
        <div className="flex gap-2">
          <Button variant="plain" onClick={onCancel} block>
            Keep it
          </Button>
          <Button variant="destructive" onClick={onConfirm} block>
            Remove it
          </Button>
        </div>
      }
    >
      <p className="type-body">
        ERS no longer lists <span className="type-data">{shown?.courseCode}</span>. Accepting this
        removes the subject along with the attendance and the grades you recorded for it.
      </p>
      <p className="type-body mt-3 text-[var(--label-secondary)]">
        If you dropped it, that is what you want. If ERS is simply wrong today, reject this instead
        — you can always re-sync later.
      </p>
    </Sheet>
  )
}

function DoneStep({
  applied,
  onBack,
}: {
  applied: { accepted: number; rejected: number }
  onBack: () => void
}) {
  return (
    <div className="stack">
      <Card>
        <EmptyState
          icon={<IconCheck size={28} />}
          title={`${applied.accepted} change${applied.accepted === 1 ? '' : 's'} applied, ${applied.rejected} rejected. Your schedule is up to date.`}
          action={
            <Button variant="accent" onClick={onBack}>
              Back to my week
            </Button>
          }
        />
      </Card>
      <section>
        <SectionHeader>Next time</SectionHeader>
        <Card>
          <p className="type-subheadline text-[var(--label-secondary)]">
            Rejected changes stay rejected until ERS changes that value again, so a re-sync will not
            keep asking you the same question.
          </p>
        </Card>
      </section>
    </div>
  )
}

// --- Applying decisions ---------------------------------------------------

const KIND_LABEL: Record<ScheduleChangeKind, string> = {
  course_added: 'New subject',
  course_removed: 'Dropped subject',
  room_change: 'Room',
  time_change: 'Time',
  day_change: 'Day',
  faculty_change: 'Faculty',
}

function kindColor(kind: ScheduleChangeKind): string {
  if (kind === 'course_removed') return 'var(--danger)'
  if (kind === 'course_added') return 'var(--ok)'
  return 'var(--label-secondary)'
}

/** The diff phrases days in their raw form; students read weekday names. */
function humanise(change: ScheduleChange): string {
  const detail = change.detail
  return detail.replace(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g,
    (day) => formatWeekday(day as Weekday),
  )
}

async function loadCommitted(): Promise<Map<string, CommittedCourseLocal>> {
  const [blocks, enrollments, courses] = await Promise.all([
    readAll<ScheduleBlockRow & { id: string }>('schedule_blocks'),
    readAll<Enrollment & { id: string }>('enrollments'),
    readAll<Course & { id: string }>('courses'),
  ])

  const courseById = new Map(courses.map((course) => [course.id, course]))
  const committed = new Map<string, CommittedCourseLocal>()

  for (const enrollment of enrollments) {
    const course = courseById.get(enrollment.course_id)
    if (!course) continue

    committed.set(course.code, {
      code: course.code,
      title: course.title,
      faculty: enrollment.faculty_name,
      lecUnits: Number(course.lec_units ?? 0),
      labUnits: Number(course.lab_units ?? 0),
      units: Number(course.units ?? 0),
      enrollmentId: enrollment.id,
      // Manual blocks are the student's own and never part of a diff.
      meetings: blocks
        .filter((block) => block.enrollment_id === enrollment.id && block.source !== 'manual')
        .map((block) => ({
          day: block.day as Weekday,
          startTime: block.start_time.slice(0, 5),
          endTime: block.end_time.slice(0, 5),
          room: block.room ?? 'TBA',
        })),
    })
  }

  return committed
}

/**
 * Turns accepted changes into a commit payload.
 *
 * Building up from the committed course and applying only what the student
 * accepted is what makes a partial acceptance real: reject the room move, keep
 * the time move, and the committed room survives rather than being quietly
 * replaced by whatever ERS said.
 */
function buildCourses(
  accepted: readonly DiffChange[],
  committed: ReadonlyMap<string, CommittedCourseLocal>,
  incoming: ReadonlyMap<string, ParsedCourse>,
): ReviewedCourse[] {
  const byCode = new Map<string, DiffChange[]>()
  for (const change of accepted) {
    if (change.kind === 'course_removed') continue
    const list = byCode.get(change.courseCode) ?? []
    list.push(change)
    byCode.set(change.courseCode, list)
  }

  const payload: ReviewedCourse[] = []

  for (const [code, list] of byCode) {
    const fresh = incoming.get(code)

    if (list.some((change) => change.kind === 'course_added')) {
      if (!fresh) continue
      payload.push(toReviewed(fresh))
      continue
    }

    const base = committed.get(code)
    if (!base) continue

    let faculty = base.faculty
    let meetings = base.meetings.map((meeting) => ({ ...meeting }))

    for (const change of list) {
      switch (change.kind) {
        case 'faculty_change':
          faculty = change.to && change.to !== 'none' ? change.to : null
          break

        case 'room_change':
          meetings = meetings.map((meeting) =>
            meeting.room === change.from ? { ...meeting, room: change.to ?? meeting.room } : meeting,
          )
          break

        case 'time_change': {
          const [start, end] = (change.to ?? '').split('–')
          if (!start || !end) break
          meetings = meetings.map((meeting) =>
            `${meeting.startTime}–${meeting.endTime}` === change.from
              ? { ...meeting, startTime: start, endTime: end }
              : meeting,
          )
          break
        }

        case 'day_change':
          if (change.to) {
            const added = fresh?.meetings.find((meeting) => meeting.day === change.to)
            if (added) {
              meetings.push({
                day: added.day,
                startTime: added.startTime,
                endTime: added.endTime,
                room: added.room || 'TBA',
              })
            }
          } else if (change.from) {
            meetings = meetings.filter((meeting) => meeting.day !== change.from)
          }
          break

        default:
          break
      }
    }

    if (meetings.length === 0) continue

    payload.push({
      code: base.code,
      title: fresh?.title || base.title,
      lecUnits: base.lecUnits,
      labUnits: base.labUnits,
      units: base.units,
      faculty,
      meetings,
    })
  }

  return payload
}

function toReviewed(course: ParsedCourse): ReviewedCourse {
  return {
    code: course.code,
    title: course.title || course.code,
    lecUnits: course.lecUnits,
    labUnits: course.labUnits,
    units: course.units,
    faculty: course.faculty,
    meetings: course.meetings.map((meeting) => ({
      day: meeting.day,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      room: meeting.room || 'TBA',
    })),
  }
}
