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
import { StatStrip, type Stat } from '@/components/schedule/stat-strip'
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
 * not on a separate screen (TDD §3.5). The figures above and the rooms rail
 * beside it are the same day counted, for the questions the list answers
 * slowly — how long am I on campus, and which room am I heading to.
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

  const classes = useMemo<ScheduleBlockView[]>(
    () => (snapshot ? (blocksOnDay(snapshot.blocks, weekday) as ScheduleBlockView[]) : []),
    [snapshot, weekday],
  )

  const gaps = useMemo<FreeBlock[]>(
    () => (snapshot ? freeBlocks(snapshot.blocks, weekday, 30, snapshot.bounds) : []),
    [snapshot, weekday],
  )

  const entries = useMemo<Entry[]>(
    () =>
      [
        ...classes.map((block) => ({
          kind: 'class' as const,
          at: toMinutes(block.startTime),
          block,
        })),
        ...gaps.map((gap) => ({ kind: 'free' as const, at: toMinutes(gap.startTime), gap })),
      ].sort((a, b) => a.at - b.at),
    [classes, gaps],
  )

  const isToday = date === todayDate(now)

  const classMinutes = classes.reduce(
    (sum, block) => sum + (toMinutes(block.endTime) - toMinutes(block.startTime)),
    0,
  )
  const freeMinutes = gaps
    .filter((gap) => gap.after && gap.before)
    .reduce((sum, gap) => sum + gap.minutes, 0)

  const stats: Stat[] = [
    { label: 'Classes', value: classes.length },
    { label: 'Class time', value: classMinutes === 0 ? '—' : formatMinutes(classMinutes) },
    { label: 'Free between', value: freeMinutes === 0 ? '—' : formatMinutes(freeMinutes) },
    {
      label: 'On campus',
      value:
        classes.length === 0
          ? '—'
          : `${formatTime12(classes[0].startTime)} – ${formatTime12(classes[classes.length - 1].endTime)}`,
    },
  ]

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

      <div className="app-container stack pb-6">
        <DayStepper date={date} />

        {!snapshot ? (
          <div className="skeleton h-40 rounded-[var(--radius-md)]" aria-busy="true" />
        ) : classes.length === 0 ? (
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
          <>
            <StatStrip stats={stats} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <section className="min-w-0">
                <SectionHeader>In order</SectionHeader>
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

              <aside className="stack min-w-0">
                <section>
                  <SectionHeader>Where to be</SectionHeader>
                  <ListGroup>
                    {classes.map((block) => (
                      <ListRow
                        key={block.id}
                        leading={
                          <span
                            aria-hidden
                            className="block size-2.5 rounded-full"
                            style={{ background: tintOf(block.colorKey) }}
                          />
                        }
                        title={<span className="type-data">{block.label}</span>}
                        subtitle={<span className="type-data">{formatTime12(block.startTime)}</span>}
                        trailing={
                          <span className="type-data type-footnote text-[var(--label-secondary)]">
                            {block.room ?? 'TBA'}
                          </span>
                        }
                      />
                    ))}
                  </ListGroup>
                </section>

                <section>
                  <SectionHeader>This day</SectionHeader>
                  <ListGroup>
                    <ListRow
                      href="/schedule"
                      title="Back to the week"
                      subtitle="See every day at once"
                    />
                    <ListRow
                      onClick={() => {
                        setEditing(null)
                        setSheetOpen(true)
                      }}
                      leading={<IconPlus size={20} />}
                      title="Add a block"
                      subtitle={`Lands on ${formatWeekday(weekday)}`}
                    />
                  </ListGroup>
                </section>
              </aside>
            </div>
          </>
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
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(spring.ui)}
    >
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
          <div className="flex items-baseline gap-1.5">
            <dt className="type-caption-1 text-[var(--label-tertiary)]">Runs</dt>
            <dd className="type-footnote type-data">
              {formatMinutes(toMinutes(block.endTime) - toMinutes(block.startTime))}
            </dd>
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
            className="type-caption-1 ml-2 mt-3 inline-flex rounded-[var(--radius-xs)] px-2 py-0.5 text-[var(--label-secondary)]"
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
