'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  addDays,
  blocksOnDay,
  formatTime12,
  formatWeekday,
  freeBlocks,
  manilaMinutes,
  toMinutes,
  type FreeBlock,
} from '@onetup/core'
import { useNow } from '@/lib/hooks/use-local'
import { syncNow } from '@/lib/offline/sync'
import { Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { Button, ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconSchedule,
  IconImport,
} from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { BlockSheet } from '@/components/schedule/block-sheet'
import { StatStrip, type Stat } from '@/components/schedule/stat-strip'
import { Row } from '@/components/ui/row'
import { DayTimeline } from '@/components/schedule/day-timeline'
import {
  formatDayDate,
  formatMinutes,
  loadSchedule,
  todayDate,
  weekdayOfDate,
  type ScheduleBlockView,
  type ScheduleSnapshot,
} from '@/components/schedule/schedule-data'

/**
 * One day, laid out against the clock.
 *
 * Classes and the gaps between them sit on the same time grid, because that is
 * how a day is actually lived: a student deciding whether a two-hour hole is
 * worth going home for needs to see it sitting between the two classes that
 * made it, not on a separate screen (TDD §3.5). The figures above and the rooms
 * rail beside it are the same day counted, for the questions the grid answers
 * slowly — how long am I on campus, and which room am I heading to.
 */

export interface DayViewProps {
  date: string
}

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
          <div className="skeleton h-40 rounded-[var(--radius-lg)]" aria-busy="true" />
        ) : classes.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconTile Icon={IconSchedule} tone="crimson" variant="solid" size={56} />}
              title={
                snapshot.blocks.length === 0
                  ? 'No schedule yet. Import it from ERS, or paste it in — either works.'
                  : `Nothing scheduled for ${formatWeekday(weekday)}.`
              }
              action={
                snapshot.blocks.length === 0 ? (
                  <ButtonLink
                    href="/schedule/import"
                    variant="accent"
                    leading={<IconImport size={18} />}
                  >
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
                <SectionHeader>{isToday ? 'Your day' : 'The day'}</SectionHeader>
                <DayTimeline
                  classes={classes}
                  gaps={gaps}
                  nowMinutes={isToday ? manilaMinutes(now) : null}
                  onEdit={(block) => {
                    setEditing(block)
                    setSheetOpen(true)
                  }}
                />
              </section>

              <aside className="stack min-w-0">
                <section>
                  <SectionHeader>Where to be</SectionHeader>
                  <div className="row-list">
                    {classes.map((block) => (
                      <Row
                        as="div"
                        key={block.id}
                        leading={
                          <span
                            aria-hidden
                            className="block size-2.5 rounded-full"
                            style={{ background: 'var(--label-quaternary)' }}
                          />
                        }
                        title={<span className="type-data">{block.label}</span>}
                        detail={<span className="type-data">{formatTime12(block.startTime)}</span>}
                        trailing={
                          <span className="type-data type-footnote text-[var(--label-secondary)]">
                            {block.room ?? 'TBA'}
                          </span>
                        }
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <SectionHeader>This day</SectionHeader>
                  <div className="row-list">
                    <Row
                      as="div"
                      href="/schedule"
                      leading={<IconTile Icon={IconSchedule} tone="gray" size={36} />}
                      title="Back to the week"
                      detail="Every day at once"
                    />
                    <Row
                      as="div"
                      onClick={() => {
                        setEditing(null)
                        setSheetOpen(true)
                      }}
                      leading={<IconTile Icon={IconPlus} tone="gray" size={36} />}
                      title="Add a block"
                      detail={`Lands on ${formatWeekday(weekday)}`}
                    />
                  </div>
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
        className="type-subheadline flex min-h-[var(--target-min)] items-center gap-1 rounded-full pl-2.5 pr-4 font-semibold transition-transform duration-150 active:scale-95"
        style={{ background: 'var(--bg)', boxShadow: 'var(--shadow-chip)' }}
      >
        <IconChevronLeft size={18} />
        {formatWeekday(weekdayOfDate(previous), 'short')}
      </Link>
      <Link
        href={`/schedule/day/${next}` as never}
        className="type-subheadline flex min-h-[var(--target-min)] items-center gap-1 rounded-full pl-4 pr-2.5 font-semibold transition-transform duration-150 active:scale-95"
        style={{ background: 'var(--bg)', boxShadow: 'var(--shadow-chip)' }}
      >
        {formatWeekday(weekdayOfDate(next), 'short')}
        <IconChevronRight size={18} />
      </Link>
    </nav>
  )
}
