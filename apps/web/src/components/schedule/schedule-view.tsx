'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import {
  blockNow,
  blocksOnDay,
  formatTime12,
  formatWeekday,
  manilaMinutes,
  toMinutes,
  weekLoad,
  type Weekday,
} from '@onetup/core'
import { useNow } from '@/lib/hooks/use-local'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink, IconButton } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { IconPlus, IconRefresh, IconSchedule } from '@/components/ui/icon'
import { BlockSheet } from '@/components/schedule/block-sheet'
import {
  dayOfMonth,
  formatDayDate,
  formatMinutes,
  layoutDay,
  loadSchedule,
  tintFill,
  tintOf,
  todayDate,
  weekDates,
  type ScheduleBlockView,
  type ScheduleSnapshot,
} from '@/components/schedule/schedule-data'
import { cx } from '@/lib/cx'

/**
 * The week timetable.
 *
 * A timetable is read spatially — a student recognises the shape of their
 * Tuesday before they read a single word of it — so the blocks are positioned
 * by time rather than listed. On a phone the week becomes a strip of day
 * columns you swipe through; from a tablet up, the whole week is one grid.
 *
 * It renders entirely from IndexedDB. Nothing on this path touches the network.
 */

/** One hour of the day, in rem so the grid grows with the text-size setting. */
const HOUR_HEIGHT = '3.5rem'

export function ScheduleView() {
  const now = useNow(60_000)
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null)
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

  const today = todayDate(now)

  if (!snapshot) return <ScheduleSkeleton />

  const { blocks, weekOrder } = snapshot
  const dates = weekDates(today, weekOrder)
  const todayWeekday = weekOrder.find((day) => dates[day] === today) ?? null

  // Sunday is dropped unless it earns its column, because an empty seventh
  // column costs a swipe on every phone for the sake of almost no one.
  const days = weekOrder.filter(
    (day) =>
      day !== 'sunday' ||
      day === todayWeekday ||
      blocks.some((block) => block.day === 'sunday'),
  )

  const current = blockNow(blocks, now) as ScheduleBlockView | null

  return (
    <>
      <NavBar
        title="Schedule"
        subtitle={`Week of ${formatDayDate(dates[days[0]])}`}
        trailing={
          <IconButton
            label="Add a block"
            onClick={() => setSheetOpen(true)}
          >
            <IconPlus size={20} />
          </IconButton>
        }
      />

      <div className="app-container stack pb-4">
        {blocks.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconSchedule size={30} />}
              title="No schedule yet. Import it from ERS, or paste it in — either works."
              action={
                <ButtonLink href="/schedule/import" variant="accent">
                  Bring in your schedule
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <>
            <WeekGrid
              blocks={blocks}
              days={days}
              dates={dates}
              todayWeekday={todayWeekday}
              currentBlockId={current?.id ?? null}
              nowMinutes={manilaMinutes(now)}
            />
            <WeekLoad blocks={blocks} days={days} />
          </>
        )}

        <section>
          <SectionHeader>Your schedule</SectionHeader>
          <ListGroup>
            <ListRow
              href="/schedule/import"
              title="Import or paste a schedule"
              subtitle="From ERS, or straight off the clipboard"
            />
            <ListRow
              href="/schedule/resync"
              leading={<IconRefresh size={20} />}
              title="Check ERS for changes"
              subtitle="You approve every change before it lands"
            />
            <ListRow
              onClick={() => setSheetOpen(true)}
              leading={<IconPlus size={20} />}
              title="Add a block by hand"
              subtitle="Org meetings, shifts, anything else that takes your time"
            />
          </ListGroup>
        </section>
      </div>

      <BlockSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        block={null}
        defaultDay={todayWeekday ?? 'monday'}
        onSaved={reload}
      />
    </>
  )
}

function WeekGrid({
  blocks,
  days,
  dates,
  todayWeekday,
  currentBlockId,
  nowMinutes,
}: {
  blocks: ScheduleBlockView[]
  days: Weekday[]
  dates: Record<Weekday, string>
  todayWeekday: Weekday | null
  currentBlockId: string | null
  nowMinutes: number
}) {
  const todayColumn = useRef<HTMLDivElement>(null)

  const range = useMemo(() => bounds(blocks), [blocks])
  const hours = useMemo(() => {
    const list: number[] = []
    for (let minute = range.start; minute <= range.end; minute += 60) list.push(minute)
    return list
  }, [range])

  // Land on today rather than on Monday. `block: 'nearest'` keeps the page from
  // scrolling vertically to bring the column into view.
  useEffect(() => {
    todayColumn.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [])

  const span = range.end - range.start

  return (
    <div
      className={cx(
        'no-scrollbar -mx-4 snap-x snap-mandatory overflow-x-auto px-4',
        // Phones get a strip of fixed-width days to swipe; from sm up the same
        // columns relax to 1fr and the whole week fits without scrolling.
        '[--col-min:9.5rem] sm:[--col-min:0px]',
      )}
      style={{ ['--hour-h' as string]: HOUR_HEIGHT }}
    >
      <div className="flex min-w-full">
        <div
          className="sticky left-0 z-10 w-9 flex-none"
          style={{ background: 'var(--bg-grouped)' }}
          aria-hidden
        >
          <div className="h-11" />
          <div className="relative" style={{ height: scale(span) }}>
            {hours.map((minute) => (
              <span
                key={minute}
                className="type-caption-2 type-data absolute right-1.5 -translate-y-1/2 text-[var(--label-tertiary)]"
                style={{ top: scale(minute - range.start) }}
              >
                {formatHour(minute)}
              </span>
            ))}
          </div>
        </div>

        {days.map((day) => {
          const isToday = day === todayWeekday
          const dayBlocks = blocksOnDay(blocks, day) as ScheduleBlockView[]
          return (
            <div
              key={day}
              ref={isToday ? todayColumn : undefined}
              className="flex-1 snap-start"
              style={{ minWidth: 'var(--col-min, 9.5rem)' }}
            >
              <DayHeading
                day={day}
                date={dates[day]}
                count={dayBlocks.length}
                isToday={isToday}
              />

              <div className="relative pr-1.5" style={{ height: scale(span) }}>
                {hours.map((minute) => (
                  <span
                    key={minute}
                    aria-hidden
                    className="absolute inset-x-0 h-px"
                    style={{
                      top: scale(minute - range.start),
                      background: 'var(--separator)',
                      opacity: 0.5,
                    }}
                  />
                ))}

                {layoutDay(dayBlocks).map((placed) => (
                  <BlockChip
                    key={placed.block.id}
                    placed={placed}
                    date={dates[day]}
                    rangeStart={range.start}
                    isCurrent={placed.block.id === currentBlockId}
                  />
                ))}

                {isToday && nowMinutes >= range.start && nowMinutes <= range.end && (
                  <NowLine top={scale(nowMinutes - range.start)} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayHeading({
  day,
  date,
  count,
  isToday,
}: {
  day: Weekday
  date: string
  count: number
  isToday: boolean
}) {
  return (
    <Link
      href={`/schedule/day/${date}` as never}
      aria-label={`${formatWeekday(day)} ${formatDayDate(date)}, ${count} class${count === 1 ? '' : 'es'}`}
      className="flex h-11 flex-col items-center justify-center gap-0.5"
    >
      <span
        className={cx(
          'type-caption-2 font-semibold uppercase tracking-[0.04em]',
          isToday ? 'text-[var(--accent)]' : 'text-[var(--label-secondary)]',
        )}
      >
        {formatWeekday(day, 'short')}
      </span>
      <span
        className={cx(
          'type-data type-footnote grid size-6 place-items-center rounded-full font-semibold',
          isToday && 'text-[var(--on-accent)]',
        )}
        style={isToday ? { background: 'var(--accent)' } : undefined}
      >
        {dayOfMonth(date)}
      </span>
    </Link>
  )
}

function BlockChip({
  placed,
  date,
  rangeStart,
  isCurrent,
}: {
  placed: ReturnType<typeof layoutDay>[number]
  date: string
  rangeStart: number
  isCurrent: boolean
}) {
  const { block, startMinutes, endMinutes, column, columns } = placed
  const width = `${100 / columns}%`

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transition(spring.ui)}
      className="absolute"
      style={{
        top: scale(startMinutes - rangeStart),
        height: scale(endMinutes - startMinutes),
        left: `calc(${column} * ${width})`,
        width,
        minHeight: '1.75rem',
        padding: '0 2px',
      }}
    >
      <Link
        href={`/schedule/day/${date}` as never}
        className="squircle flex h-full flex-col overflow-hidden px-2 py-1"
        style={{
          background: tintFill(block.colorKey, isCurrent ? 26 : 15),
          borderRadius: 'var(--radius-sm)',
          borderLeft: `3px solid ${tintOf(block.colorKey)}`,
          boxShadow: isCurrent ? '0 0 0 1.5px var(--accent), var(--shadow-chip)' : undefined,
        }}
      >
        <span className="type-caption-1 type-data truncate font-semibold">{block.label}</span>
        <span className="type-caption-2 type-data truncate text-[var(--label-secondary)]">
          {formatTime12(block.startTime)}
        </span>
        {block.room && (
          <span className="type-caption-2 type-data truncate text-[var(--label-tertiary)]">
            {block.room}
          </span>
        )}
      </Link>
    </motion.div>
  )
}

/**
 * Where the student is in the day. The one element on this screen allowed the
 * accent, because it is the live state rather than decoration.
 */
function NowLine({ top }: { top: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 z-10" style={{ top }}>
      <span className="block h-[2px] w-full" style={{ background: 'var(--accent)' }} />
      <span
        className="absolute -top-[3px] left-0 block size-2 rounded-full"
        style={{ background: 'var(--accent)' }}
      />
    </span>
  )
}

function WeekLoad({ blocks, days }: { blocks: ScheduleBlockView[]; days: Weekday[] }) {
  const load = weekLoad(blocks)
  const total = days.reduce((sum, day) => sum + load[day], 0)
  const heaviest = days.reduce((worst, day) => (load[day] > load[worst] ? day : worst), days[0])

  return (
    <Card className="flex items-baseline justify-between gap-3">
      <p className="type-subheadline text-[var(--label-secondary)]">
        <span className="type-data text-[var(--label)]">{formatMinutes(total)}</span> of class this
        week
      </p>
      {load[heaviest] > 0 && (
        <p className="type-footnote text-[var(--label-secondary)]">
          Heaviest: {formatWeekday(heaviest)},{' '}
          <span className="type-data">{formatMinutes(load[heaviest])}</span>
        </p>
      )}
    </Card>
  )
}

function ScheduleSkeleton() {
  return (
    <>
      <NavBar title="Schedule" />
      <div className="app-container stack" aria-busy="true" aria-label="Loading your schedule">
        <div className="skeleton h-[22rem] rounded-[var(--radius-lg)]" />
        <div className="skeleton h-16 rounded-[var(--radius-lg)]" />
      </div>
    </>
  )
}

/** The hour range worth drawing: whole hours around the week's actual classes. */
function bounds(blocks: readonly ScheduleBlockView[]): { start: number; end: number } {
  if (blocks.length === 0) return { start: 7 * 60, end: 21 * 60 }

  let earliest = 24 * 60
  let latest = 0
  for (const block of blocks) {
    earliest = Math.min(earliest, toMinutes(block.startTime))
    latest = Math.max(latest, toMinutes(block.endTime))
  }

  const start = Math.floor(earliest / 60) * 60
  const end = Math.max(Math.ceil(latest / 60) * 60, start + 4 * 60)
  return { start, end }
}

/** Minutes expressed against the hour track, for both offsets and heights. */
function scale(minutes: number): string {
  return `calc(${minutes} / 60 * var(--hour-h))`
}

function formatHour(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`
}
