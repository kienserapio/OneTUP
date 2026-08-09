'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import {
  addDays,
  blocksOnDay,
  formatTime12,
  formatWeekday,
  freeBlocks,
  toMinutes,
  type FreeBlock,
} from '@onetup/core'
import { useNow } from '@/lib/hooks/use-local'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { Button, ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { IconChevronLeft, IconChevronRight, IconClock, IconPlus } from '@/components/ui/icon'
import { BlockSheet } from '@/components/schedule/block-sheet'
import {
  formatDayDate,
  formatMinutes,
  loadSchedule,
  tintFill,
  tintOf,
  todayDate,
  weekdayOfDate,
  type ScheduleBlockView,
  type ScheduleSnapshot,
} from '@/components/schedule/schedule-data'

/**
 * One day, in the order it happens.
 *
 * Classes and the gaps between them are the same list, because that is how a
 * day is actually lived: a student deciding whether a two-hour hole is worth
 * going home for needs to see it sitting between the two classes that made it,
 * not on a separate screen (TDD §3.5).
 */

export interface DayViewProps {
  date: string
}

type Entry =
  | { kind: 'class'; at: number; block: ScheduleBlockView }
  | { kind: 'free'; at: number; gap: FreeBlock }

export function DayView({ date }: DayViewProps) {
  const now = useNow(60_000)
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null)
  const [editing, setEditing] = useState<ScheduleBlockView | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const reload = useCallback(async () => {
    setSnapshot(await loadSchedule())
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void syncNow().then(reload)
  }, [reload])

  const weekday = weekdayOfDate(date)

  const entries = useMemo<Entry[]>(() => {
    if (!snapshot) return []
    const classes = blocksOnDay(snapshot.blocks, weekday) as ScheduleBlockView[]
    const gaps = freeBlocks(snapshot.blocks, weekday, 30, snapshot.bounds)
    return [
      ...classes.map((block) => ({
        kind: 'class' as const,
        at: toMinutes(block.startTime),
        block,
      })),
      ...gaps.map((gap) => ({ kind: 'free' as const, at: toMinutes(gap.startTime), gap })),
    ].sort((a, b) => a.at - b.at)
  }, [snapshot, weekday])

  const isToday = date === todayDate(now)
  const classCount = entries.filter((entry) => entry.kind === 'class').length

  return (
    <>
      <NavBar
        title={formatWeekday(weekday)}
        subtitle={`${formatDayDate(date)}${isToday ? ' · today' : ''}`}
        back={{ href: '/schedule', label: 'Schedule' }}
        trailing={
          <Button
            size="sm"
            variant="plain"
            leading={<IconPlus size={17} />}
            onClick={() => {
              setEditing(null)
              setSheetOpen(true)
            }}
          >
            Add
          </Button>
        }
      />

      <div className="app-container stack pb-4">
        <DayStepper date={date} />

        {!snapshot ? (
          <div className="skeleton h-40 rounded-[var(--radius-lg)]" aria-busy="true" />
        ) : classCount === 0 ? (
          <Card>
            <EmptyState
              title={
                snapshot.blocks.length === 0
                  ? 'No schedule yet. Import it from ERS, or paste it in — either works.'
                  : `Nothing scheduled for ${formatWeekday(weekday)}.`
              }
              action={
                snapshot.blocks.length === 0 ? (
                  <ButtonLink href="/schedule/import" variant="accent">
                    Bring in your schedule
                  </ButtonLink>
                ) : (
                  <Button
                    onClick={() => {
                      setEditing(null)
                      setSheetOpen(true)
                    }}
                  >
                    Add a block
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <section>
            <SectionHeader>
              {classCount} class{classCount === 1 ? '' : 'es'}
            </SectionHeader>
            <div className="stack">
              {entries.map((entry) =>
                entry.kind === 'class' ? (
                  <ClassCard
                    key={entry.block.id}
                    block={entry.block}
                    onEdit={() => {
                      setEditing(entry.block)
                      setSheetOpen(true)
                    }}
                  />
                ) : (
                  <GapRow key={`gap-${entry.at}`} gap={entry.gap} />
                ),
              )}
            </div>
          </section>
        )}
      </div>

      <BlockSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        block={editing}
        defaultDay={weekday}
        onSaved={reload}
      />
    </>
  )
}

function DayStepper({ date }: { date: string }) {
  const previous = addDays(date, -1)
  const next = addDays(date, 1)

  return (
    <nav aria-label="Other days" className="flex items-center justify-between gap-2">
      <Link
        href={`/schedule/day/${previous}` as never}
        className="type-subheadline flex min-h-[var(--target-min)] items-center gap-1 px-1 text-[var(--accent)]"
      >
        <IconChevronLeft size={18} />
        {formatWeekday(weekdayOfDate(previous), 'short')}
      </Link>
      <Link
        href={`/schedule/day/${next}` as never}
        className="type-subheadline flex min-h-[var(--target-min)] items-center gap-1 px-1 text-[var(--accent)]"
      >
        {formatWeekday(weekdayOfDate(next), 'short')}
        <IconChevronRight size={18} />
      </Link>
    </nav>
  )
}

function ClassCard({ block, onEdit }: { block: ScheduleBlockView; onEdit: () => void }) {
  const manual = block.source === 'manual'

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={transition(spring.ui)}>
      <Card className="relative overflow-hidden">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: tintOf(block.colorKey) }}
        />

        <div className="flex items-start justify-between gap-3 pl-2">
          <div className="min-w-0 flex-1">
            <p className="type-data type-footnote text-[var(--label-secondary)]">
              {formatTime12(block.startTime)} – {formatTime12(block.endTime)}
            </p>
            <h3 className="type-title-3 type-data mt-0.5 truncate">{block.label}</h3>
            {block.courseTitle && block.courseTitle !== block.label && (
              <p className="type-subheadline truncate text-[var(--label-secondary)]">
                {block.courseTitle}
              </p>
            )}
          </div>

          {manual && (
            <button
              type="button"
              onClick={onEdit}
              className="type-subheadline min-h-[var(--target-min)] shrink-0 px-1 font-medium text-[var(--accent)]"
            >
              Edit
            </button>
          )}
        </div>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 pl-2">
          <div className="flex items-baseline gap-1.5">
            <dt className="type-caption-1 text-[var(--label-tertiary)]">Room</dt>
            <dd className="type-footnote type-data">{block.room ?? 'TBA'}</dd>
          </div>
          {block.enrollmentId && (
            <div className="flex items-baseline gap-1.5">
              <dt className="type-caption-1 text-[var(--label-tertiary)]">Faculty</dt>
              <dd className="type-footnote">{block.faculty ?? 'Not listed'}</dd>
            </div>
          )}
        </dl>

        {manual && (
          <p
            className="type-caption-1 mt-3 inline-flex rounded-[var(--radius-xs)] px-2 py-0.5 pl-2 text-[var(--label-secondary)]"
            style={{ background: tintFill(block.colorKey, 12) }}
          >
            Yours — re-sync never touches it
          </p>
        )}
      </Card>
    </motion.div>
  )
}

function GapRow({ gap }: { gap: FreeBlock }) {
  return (
    <ListGroup>
      <ListRow
        leading={<IconClock size={19} />}
        title={
          <span className="type-data">
            {formatTime12(gap.startTime)} – {formatTime12(gap.endTime)}
          </span>
        }
        subtitle={describeGap(gap)}
      />
    </ListGroup>
  )
}

function describeGap(gap: FreeBlock): string {
  const length = formatMinutes(gap.minutes)
  if (gap.after && gap.before) return `${length} free between ${gap.after} and ${gap.before}`
  if (gap.before) return `${length} free before ${gap.before}`
  if (gap.after) return `${length} free after ${gap.after}`
  return `${length} free`
}
