'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  QUALITY,
  dueDateAfter,
  manilaDate,
  scheduleReview,
  type ReviewQuality,
} from '@onetup/core'
import { dueToday, recordReviewDay, type ReviewCard } from '@/lib/queries/study'
import { queueWrite, syncNow } from '@/lib/offline/sync'
import { currentUserId } from '@/lib/queries/classroom'
import { spring, transition } from '@/design/motion'
import { Card, EmptyState } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { IconCards, IconCelebrate, IconBack } from '@/components/ui/icon'
import { IconTile, type Tone } from '@/components/ui/icon-tile'

/**
 * The review loop.
 *
 * One card at a time, tap to flip, then four buttons. **Each button shows the
 * interval it will set before it is pressed**, because a student choosing
 * between Hard and Good is not rating their own performance — they are choosing
 * when they next see this card, and hiding that turns a decision into a guess.
 *
 * The queue is computed once when the screen opens and then walked. It is not
 * recomputed after each answer: a card answered `Again` becomes due today
 * again, and re-sorting mid-session would put it back in front of the student
 * immediately, which is not what "see it again tomorrow" means.
 *
 * Both writes go through the mutation queue, so a review on a train lands when
 * the train comes out of the tunnel. The local card row is updated optimistically
 * so today's count on the previous screen is right the moment the student
 * leaves this one.
 */
export function ReviewSession() {
  const [queue, setQueue] = useState<ReviewCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [answered, setAnswered] = useState(0)

  useEffect(() => {
    void dueToday(new Date()).then(setQueue)
  }, [])

  const card = queue?.[index] ?? null

  const answer = useCallback(
    async (quality: ReviewQuality) => {
      if (!card) return

      const today = manilaDate(new Date())
      const userId = await currentUserId()
      if (!userId) return

      const outcome = scheduleReview(
        {
          easeFactor: card.easeFactor,
          intervalDays: card.intervalDays,
          repetitions: card.repetitions,
          lapses: card.lapses,
        },
        quality,
        { daysUntilDeadline: card.daysUntilDeadline, cardsInPack: card.cardsInPack },
      )

      /* Two writes, and this is the one that must not be lost.
       *
       * The id is generated here rather than by the database so the queued
       * insert is idempotent: `applyMutation` upserts, and a replay after a
       * response that never arrived lands on the same primary key instead of
       * recording the review twice. */
      await queueWrite({
        entity: 'flashcard_reviews',
        operation: 'insert',
        payload: {
          id: crypto.randomUUID(),
          user_id: userId,
          flashcard_id: card.id,
          quality,
        },
      })

      /* And the projection, optimistically applied so the count on the previous
       * screen is right the moment the student leaves this one. */
      const projection = {
        id: card.id,
        ease_factor: outcome.easeFactor,
        interval_days: outcome.appliedIntervalDays,
        repetitions: outcome.repetitions,
        lapses: outcome.lapses,
        due_on: dueDateAfter(today, outcome.appliedIntervalDays),
      }
      await queueWrite({
        entity: 'flashcards',
        operation: 'update',
        payload: projection,
        optimistic: { ...projection, updated_at: new Date().toISOString() },
      })

      await recordReviewDay(today)

      setAnswered((count) => count + 1)
      setRevealed(false)
      setIndex((position) => position + 1)

      void syncNow()
    },
    [card],
  )

  if (!queue) return <ReviewSkeleton />

  if (queue.length === 0) {
    return (
      <>
        <NavBar title="Review" back={{ href: '/study', label: 'Study' }} largeTitle={false} />
        <div className="app-container stack pb-4">
          <Card>
            <EmptyState
              icon={<IconTile Icon={IconCards} tone="crimson" variant="solid" size={64} />}
              title="Nothing is due today. That is the system working, not a screen with nothing on it."
              action={
                <ButtonLink href="/study" variant="plain">
                  Back to packs
                </ButtonLink>
              }
            />
          </Card>
        </div>
      </>
    )
  }

  if (!card) return <SessionDone answered={answered} />

  const remaining = queue.length - index

  return (
    <>
      <NavBar
        title="Review"
        subtitle={`${remaining} left · ${card.packTitle}`}
        back={{ href: '/study', label: 'Study' }}
        largeTitle={false}
      />

      <div className="app-container stack pb-4">
        <Progress done={index} total={queue.length} />

        <AnimatePresence mode="wait">
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={transition(spring.ui)}
          >
            {/* Big, centred, and the whole thing is the target: a card is
                flipped by tapping it, not by finding a button on it. */}
            <button
              type="button"
              onClick={() => setRevealed(true)}
              disabled={revealed}
              className="card flex min-h-[19rem] w-full flex-col items-center justify-center gap-5 px-6 py-10 text-center !rounded-[28px] disabled:cursor-default"
              aria-label={revealed ? undefined : 'Show the answer'}
            >
              <IconTile Icon={IconCards} tone="gray" size={44} />
              <p className="text-balance text-[1.5rem] font-semibold leading-snug tracking-[-0.02em]">
                {card.front}
              </p>

              {revealed ? (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={transition(spring.ui)}
                  className="type-body w-full text-balance rounded-[20px] px-4 py-4 text-[var(--label-secondary)]"
                  style={{ background: 'var(--canvas)' }}
                >
                  {card.back}
                </motion.p>
              ) : (
                <span
                  className="type-footnote rounded-full px-3.5 py-1.5 font-semibold"
                  style={{ background: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}
                >
                  Tap to flip
                </span>
              )}
            </button>
          </motion.div>
        </AnimatePresence>

        {revealed && <QualityButtons card={card} onAnswer={answer} />}
      </div>
    </>
  )
}

/**
 * The four answers, each labelled with what it does to the schedule.
 *
 * The interval on each button is `scheduleReview` run ahead of time — the same
 * function the write path calls a moment later — so the number a student reads
 * before pressing is the number they get. It is not an estimate.
 */
function QualityButtons({
  card,
  onAnswer,
}: {
  card: ReviewCard
  onAnswer: (quality: ReviewQuality) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  const press = async (quality: ReviewQuality) => {
    if (busy) return
    setBusy(true)
    try {
      await onAnswer(quality)
    } finally {
      setBusy(false)
    }
  }

  /* Each answer gets a tone, so the four read as a scale — red for "again"
   * through to the calm end for "easy" — before a label is read. */
  const options: Array<{ label: string; quality: ReviewQuality; tone: Tone }> = [
    { label: 'Again', quality: QUALITY.again, tone: 'crimson' },
    { label: 'Hard', quality: QUALITY.hard, tone: 'gray' },
    { label: 'Good', quality: QUALITY.good, tone: 'green' },
    { label: 'Easy', quality: QUALITY.easy, tone: 'blue' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(spring.ui)}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {options.map((option) => {
        /* The same function the write path calls, so the number under the
         * label is the interval the card actually gets — compression included,
         * which is exactly when a preview would otherwise lie. */
        const outcome = scheduleReview(
          {
            easeFactor: card.easeFactor,
            intervalDays: card.intervalDays,
            repetitions: card.repetitions,
            lapses: card.lapses,
          },
          option.quality,
          { daysUntilDeadline: card.daysUntilDeadline, cardsInPack: card.cardsInPack },
        )
        return (
          <motion.button
            key={option.label}
            type="button"
            disabled={busy}
            onClick={() => void press(option.quality)}
            whileTap={{ scale: 0.94 }}
            transition={transition(spring.snap)}
            className="flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-[20px] px-2 py-3 disabled:opacity-50"
            style={{
              background: `var(--tone-${option.tone}-tint)`,
              color: `var(--tone-${option.tone}-ink)`,
            }}
          >
            <span className="type-subheadline font-semibold">{option.label}</span>
            <span className="type-caption-2 opacity-75">
              {describeInterval(outcome.appliedIntervalDays)}
            </span>
          </motion.button>
        )
      })}
    </motion.div>
  )
}

function SessionDone({ answered }: { answered: number }) {
  return (
    <>
      <NavBar title="Done" back={{ href: '/study', label: 'Study' }} largeTitle={false} />
      <div className="app-container stack pb-4">
        <Card>
          <EmptyState
            icon={<IconTile Icon={IconCelebrate} tone="green" variant="solid" size={64} />}
            title={
              answered === 0
                ? 'Nothing left in the queue.'
                : `${answered} card${answered === 1 ? '' : 's'} reviewed. The rest come back on their own schedule.`
            }
            action={
              <ButtonLink href="/study" variant="accent" leading={<IconBack size={18} />}>
                Back to packs
              </ButtonLink>
            }
          />
        </Card>
      </div>
    </>
  )
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--fill-tertiary)' }}
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label="Cards reviewed this session"
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: 'var(--tone-crimson)' }}
        animate={{ width: `${pct}%` }}
        transition={transition(spring.ui)}
      />
    </div>
  )
}

/** "1d", "6d", "3wk", "4mo" — short enough to sit under a button label. */
export function describeInterval(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 21) return `${days}d`
  if (days < 60) return `${Math.round(days / 7)}wk`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}yr`
}

function ReviewSkeleton() {
  return (
    <>
      <NavBar title="Review" back={{ href: '/study', label: 'Study' }} largeTitle={false} />
      <div className="app-container stack" aria-busy="true" aria-label="Loading the queue">
        <div className="skeleton h-2 rounded-full" />
        <div className="skeleton h-[19rem] rounded-[28px]" />
      </div>
    </>
  )
}
