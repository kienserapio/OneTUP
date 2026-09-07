'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { SuspensionAdvisory } from '@onetup/core'
import { getMeta, setMeta } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { supabaseBrowser } from '@/lib/supabase/client'
import { spring, transition } from '@/design/motion'
import { Card } from '@/components/ui/surfaces'
import { IconWarning } from '@/components/ui/icon'
import { AttendancePrompt } from '@/components/today/attendance-prompt'
import type { AttendanceStanding, CourseBlock } from '@/lib/queries/today'
import { cx } from '@/lib/cx'

/**
 * *Walang pasok.*
 *
 * **This card never cancels a class.** A signal-1 announcement suspends
 * face-to-face classes and half the faculty then move the session online — so
 * "no classes today" and "classes are online today" are both true statements
 * about the same announcement, and only the student and their professor know
 * which one applies. An app that auto-marked those sessions `cancelled` would
 * delete a class that happened, in the student's own attendance record, on a
 * day they attended it (15-SUSPENSIONS-PLAN.md §1).
 *
 * So there are three actions and the app decides none of them:
 *
 * - **My classes were cancelled** writes `cancelled` for today's classes,
 *   through the ordinary attendance path, undoably.
 * - **They moved online** does *not* guess which ones. It opens a prompt per
 *   class, and the student answers each.
 * - **Dismiss** writes nothing anywhere. It is a notice.
 *
 * `--warning`, never `--danger`. This is a notice, not an alarm.
 */

const LEVEL_LABEL: Record<string, string> = {
  signal_1: 'Signal No. 1',
  signal_2: 'Signal No. 2',
  signal_3: 'Signal No. 3',
  signal_4: 'Signal No. 4',
  signal_5: 'Signal No. 5',
  flood: 'Flooding',
  holiday: 'Holiday',
  other: 'Advisory',
}

const SOURCE_LABEL: Record<string, string> = {
  pagasa: 'PAGASA',
  lgu: 'the city',
  university: 'the university',
  student: 'a student',
}

export function SuspensionCard({
  advisory,
  blocks,
  sessionDate,
  standings,
  onRecorded,
}: {
  advisory: SuspensionAdvisory
  /** Today's classes. The ones any action here would touch. */
  blocks: CourseBlock[]
  sessionDate: string
  standings: Record<string, AttendanceStanding>
  onRecorded: () => void
}) {
  const [mode, setMode] = useState<'notice' | 'online' | 'done'>('notice')
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  /* Dismissal is per advisory and lives on the device. It is a preference about
   * a notice, not a fact about the student's record — putting it in the
   * database would mean a row whose only content is "this person has read
   * this", which is not worth the table. */
  useEffect(() => {
    void getMeta<string[]>(DISMISSED_KEY).then((seen) => {
      setDismissed((seen ?? []).includes(advisory.id))
    })
  }, [advisory.id])

  const dismiss = async () => {
    const seen = (await getMeta<string[]>(DISMISSED_KEY)) ?? []
    await setMeta(DISMISSED_KEY, [...new Set([...seen, advisory.id])].slice(-40))
    setDismissed(true)
  }

  const cancelAll = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { data } = await supabaseBrowser().auth.getUser()
      const userId = data.user?.id
      if (!userId) return

      /* Only classes with an enrolment behind them. A block a student typed in
       * by hand has no subject to count against, so there is nothing to
       * record and nothing lost by skipping it. */
      for (const block of blocks) {
        if (!block.enrollmentId) continue
        const id = crypto.randomUUID()
        const row = {
          id,
          user_id: userId,
          enrollment_id: block.enrollmentId,
          block_id: block.id,
          session_date: sessionDate,
          status: 'cancelled' as const,
          recorded_via: 'suspension',
          delivery_mode: null,
        }
        await queueWrite({
          entity: 'attendance_records',
          operation: 'insert',
          payload: row,
          optimistic: { ...row, updated_at: new Date().toISOString() },
        })
      }
      setMode('done')
      onRecorded()
    } finally {
      setBusy(false)
    }
  }

  if (dismissed !== false) return null

  const scopeName =
    advisory.scope === 'city' && advisory.city
      ? advisory.city
      : advisory.scope === 'university'
        ? 'TUP'
        : advisory.scope === 'ncr'
          ? 'Metro Manila'
          : 'The national government'

  const answerable = blocks.filter((block) => block.enrollmentId)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(spring.ui)}
    >
      <Card
        className="stack"
        /* Tinted, not alarming. A suspension is good news as often as not. */
      >
        <div className="flex items-start gap-3">
          <IconWarning size={22} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
          <div className="min-w-0 flex-1">
            <h3 className="type-headline text-balance">{advisory.headline}</h3>
            <p className="type-footnote mt-0.5 text-[var(--label-secondary)]">
              {[
                advisory.level ? LEVEL_LABEL[advisory.level] : null,
                `from ${SOURCE_LABEL[advisory.source] ?? advisory.source}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {/* The sentence that stops this being an instruction. */}
        <p className="type-footnote text-[var(--label-secondary)]">
          {scopeName} announced this. Whether your own classes were called off or moved online is
          between you and your professors — nothing is recorded until you say so.
        </p>

        {advisory.source_url && (
          <a
            href={advisory.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="type-footnote font-medium text-[var(--accent)]"
          >
            Read the announcement
          </a>
        )}

        <AnimatePresence mode="wait">
          {mode === 'notice' && (
            <motion.div
              key="actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition(spring.snap)}
              className="stack"
            >
              {answerable.length > 0 ? (
                <>
                  <NoticeButton onClick={() => void cancelAll()} disabled={busy} emphasis>
                    My classes were cancelled
                  </NoticeButton>
                  <div className="flex gap-2">
                    <NoticeButton onClick={() => setMode('online')} disabled={busy}>
                      They moved online
                    </NoticeButton>
                    <NoticeButton onClick={() => void dismiss()} disabled={busy}>
                      Dismiss
                    </NoticeButton>
                  </div>
                </>
              ) : (
                <NoticeButton onClick={() => void dismiss()}>Dismiss</NoticeButton>
              )}
            </motion.div>
          )}

          {mode === 'online' && (
            <motion.div
              key="online"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={transition(spring.snap)}
              className="stack"
            >
              {/* One prompt per class, because the app does not know which of
                  them actually went ahead and guessing would put a present on a
                  class nobody held. */}
              <p className="type-footnote text-[var(--label-secondary)]">
                Which ones went ahead?
              </p>
              {answerable.map((block) => (
                <AttendancePrompt
                  key={block.id}
                  block={block}
                  sessionDate={sessionDate}
                  standing={block.enrollmentId ? standings[block.enrollmentId] : null}
                  deliveryMode="online"
                  compact
                  onRecorded={onRecorded}
                />
              ))}
              <NoticeButton onClick={() => setMode('notice')}>Back</NoticeButton>
            </motion.div>
          )}

          {mode === 'done' && (
            <motion.p
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="type-footnote text-[var(--label-secondary)]"
            >
              {answerable.length} class{answerable.length === 1 ? '' : 'es'} marked cancelled. They
              do not count either way — undo any of them from the subject.
            </motion.p>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

const DISMISSED_KEY = 'suspension.dismissed'

function NoticeButton({
  children,
  onClick,
  disabled,
  emphasis,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  emphasis?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.98 }}
      transition={transition(spring.snap)}
      className={cx(
        'flex min-h-[var(--target-min)] flex-1 items-center justify-center',
        'rounded-[var(--radius-sm)] text-[0.9375rem] font-semibold',
        'transition-transform disabled:opacity-50',
      )}
      style={
        emphasis
          ? {
              color: 'var(--warning)',
              background: 'color-mix(in srgb, var(--warning) 11%, transparent)',
              border: '1px solid color-mix(in srgb, var(--warning) 26%, transparent)',
            }
          : {
              color: 'var(--label-secondary)',
              background: 'var(--fill-quaternary)',
              border: '1px solid var(--separator)',
            }
      }
    >
      {children}
    </motion.button>
  )
}
