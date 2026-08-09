'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import {
  blockNow,
  blocksOnDay,
  freeBlocks,
  formatTime12,
  formatWeekday,
  manilaMinutes,
  nextBlock,
  toMinutes,
  weekLoad,
  type FreeBlock,
  type Weekday,
} from '@onetup/core'
import { useNow } from '@/lib/hooks/use-local'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink, IconButton } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { IconClock, IconPlus, IconRefresh, IconSchedule } from '@/components/ui/icon'
import { BlockSheet } from '@/components/schedule/block-sheet'
import { StatStrip, type Stat } from '@/components/schedule/stat-strip'
import {
  dayOfMonth,
  formatDayDate,
  formatMinutes,
  formatUnits,
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
 * The week timetable, framed as a dashboard.
 *
 * A timetable is read spatially — a student recognises the shape of their
 * Tuesday before they read a single word of it — so the blocks are positioned
 * by time rather than listed. On a phone the week is a strip of day columns you
 * swipe; from the sidebar breakpoint up, the whole week is one grid with a
 * summary rail beside it, so the screen answers "what now, what next, what is
 * free" without a scroll.
 *
 * It renders entirely from IndexedDB. Nothing on this path touches the network.
 */

/** One hour of the day, in rem so the grid grows with the text-size setting. */
const HOUR_HEIGHT = '3.5rem'

export interface ScheduleViewProps {
  /** From the server, because terms are not part of the offline set. */
  termLabel?: string | null
}

export function ScheduleView({ termLabel }: ScheduleViewProps) {
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

  const { blocks, weekOrder, subjects, totalUnits, bounds } = snapshot
  const dates = weekDates(today, weekOrder)
  const todayWeekday = weekOrder.find((day) => dates[day] === today) ?? null

  // Sunday is dropped unless it earns its column, because an empty seventh
  // column costs a swipe on every phone for the sake of almost no one.
  const days = weekOrder.filter(
    (day) => day !== 'sunday' || day === todayWeekday || blocks.some((b) => b.day === 'sunday'),
  )

  const current = blockNow(blocks, now) as ScheduleBlockView | null
  const upcoming = nextBlock(blocks, now)
  const load = weekLoad(blocks)
  const weekMinutes = days.reduce((sum, day) => sum + load[day], 0)
  const heaviest = days.reduce((worst, day) => (load[day] > load[worst] ? day : worst), days[0])

  const todayBlocks = todayWeekday
    ? (blocksOnDay(blocks, todayWeekday) as ScheduleBlockView[])
    : []
  const todayGaps = todayWeekday ? freeBlocks(blocks, todayWeekday, 30, bounds) : []

  const stats: Stat[] = [
    ...(termLabel ? [{ label: 'Term', value: termLabel }] : []),
    {
      label: 'Subjects',
      value: subjects.length,
      hint: `${blocks.length} block${blocks.length === 1 ? '' : 's'} a week`,
    },
    { label: 'Units', value: formatUnits(totalUnits) },
    {
      label: 'Hours a week',
      value: formatMinutes(weekMinutes),
      hint: load[heaviest] > 0 ? `Heaviest ${formatWeekday(heaviest, 'short')}` : undefined,
    },
  ]

  return (
    <>
      <NavBar
        title="Schedule"
        subtitle={`Week of ${formatDayDate(dates[days[0]])}`}
        trailing={
          <IconButton label="Add a block" onClick={() => setSheetOpen(true)}>
            <IconPlus size={20} />
          </IconButton>
        }
      />

      <div className="app-container stack pb-6">
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
          <StatStrip stats={stats} />
        )}

        {/* One column of rail when there is no grid to sit beside. */}
        <div
          className={cx(
            'grid gap-4',
            blocks.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start',
          )}
        >
          {blocks.length > 0 && (
            <WeekGrid
              blocks={blocks}
              days={days}
              dates={dates}
              todayWeekday={todayWeekday}
              currentBlockId={current?.id ?? null}
              nowMinutes={manilaMinutes(now)}
            />
          )}

          <aside className="stack min-w-0">
            {blocks.length > 0 && (
              <>
                <UpNext current={current} upcoming={upcoming} today={today} />

                {todayWeekday && (
                  <section>
                    <SectionHeader
                      action={
                        <Link
                          href={`/schedule/day/${today}` as never}
                          className="type-footnote text-[var(--accent)]"
                        >
                          Open day
                        </Link>
                      }
                    >
                      Today
                    </SectionHeader>
                    {todayBlocks.length === 0 ? (
                      <Card>
                        <p className="type-subheadline text-[var(--label-secondary)]">
                          Nothing scheduled today.
                        </p>
                      </Card>
                    ) : (
                      <ListGroup>
                        {todayBlocks.map((block) => (
                          <ListRow
                            key={block.id}
                            href={`/schedule/day/${today}`}
                            leading={
                              <span
                                aria-hidden
                                className="block size-2.5 rounded-full"
                                style={{
                                  background:
                                    toMinutes(block.endTime) <= manilaMinutes(now)
                                      ? 'var(--separator-opaque)'
                                      : tintOf(block.colorKey),
                                }}
                              />
                            }
                            title={<span className="type-data">{block.label}</span>}
                            subtitle={
                              <span className="type-data">
                                {formatTime12(block.startTime)} – {formatTime12(block.endTime)}
                                {block.room ? ` · ${block.room}` : ''}
                              </span>
                            }
                          />
                        ))}
                      </ListGroup>
                    )}
                  </section>
                )}

                {todayGaps.length > 0 && (
                  <section>
                    <SectionHeader>Free today</SectionHeader>
                    <ListGroup>
                      {todayGaps.map((gap) => (
                        <ListRow
                          key={`${gap.startTime}-${gap.endTime}`}
                          leading={<IconClock size={19} />}
                          title={
                            <span className="type-data">
                              {formatTime12(gap.startTime)} – {formatTime12(gap.endTime)}
                            </span>
                          }
                          subtitle={describeGap(gap)}
                        />
                      ))}
                    </ListGroup>
                  </section>
                )}
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
          </aside>
        </div>
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

/**
 * What is happening now, or what is next. The rail's first card, because it is
 * the one question the grid answers slowest.
 */
function UpNext({
  current,
  upcoming,
  today,
}: {
  current: ScheduleBlockView | null
  upcoming: ReturnType<typeof nextBlock>
  today: string
}) {
  const block = (current ?? upcoming?.block ?? null) as ScheduleBlockView | null
  if (!block) {
    return (
      <Card>
        <p className="type-section-header">Up next</p>
        <p className="type-subheadline mt-1.5 text-[var(--label-secondary)]">
          Nothing left this week.
        </p>
      </Card>
    )
  }

  const isNow = Boolean(current)
  const when = isNow
    ? 'Right now'
    : upcoming?.isToday
      ? `in ${formatMinutes(upcoming.minutesUntil)}`
      : `${formatWeekday(block.day, 'short')} ${formatTime12(block.startTime)}`

  return (
    <Card className="relative overflow-hidden">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: tintOf(block.colorKey) }}
      />
      <div className="flex items-start justify-between gap-3 pl-2">
        <p className="type-section-header">{isNow ? 'Right now' : 'Up next'}</p>
        <span
          className="type-caption-1 type-data shrink-0 rounded-full px-2.5 py-1 font-medium"
          style={{ background: 'var(--accent-subtle)', color: 'var(--crimson-800)' }}
        >
          {when}
        </span>
      </div>
      <h3 className="type-title-3 type-data mt-1.5 truncate pl-2">{block.label}</h3>
      {block.courseTitle && block.courseTitle !== block.label && (
        <p className="type-subheadline truncate pl-2 text-[var(--label-secondary)]">
          {block.courseTitle}
        </p>
      )}
      <p className="type-data type-footnote mt-1.5 pl-2 text-[var(--label-secondary)]">
        {formatTime12(block.startTime)} – {formatTime12(block.endTime)}
        {block.room ? ` · ${block.room}` : ''}
      </p>
      <div className="mt-3 pl-2">
        <ButtonLink
          href={`/schedule/day/${upcoming && !upcoming.isToday ? upcoming.date : today}`}
          size="sm"
          variant="plain"
          className="-ml-3"
        >
          See the day
        </ButtonLink>
      </div>
    </Card>
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
  const stripRef = useRef<HTMLDivElement>(null)

  const range = useMemo(() => rangeOf(blocks), [blocks])
  const hours = useMemo(() => {
    const list: number[] = []
    for (let minute = range.start; minute <= range.end; minute += 60) list.push(minute)
    return list
  }, [range])

  const landingDay = useMemo(() => {
    if (!todayWeekday) return days[0] ?? null
    const from = days.indexOf(todayWeekday)
    if (from < 0) return days[0] ?? null

    for (let step = 0; step < days.length; step += 1) {
      const day = days[(from + step) % days.length]
      if (blocksOnDay(blocks, day).length > 0) return day
    }
    return todayWeekday
  }, [blocks, days, todayWeekday])

  // Land on today rather than on Monday — but a Sunday with nothing on it would
  // open the week on an empty column, which reads as a broken schedule rather
  // than as a free day. So the strip settles on the next day that has classes.
  useEffect(() => {
    const column = todayColumn.current
    const strip = stripRef.current
    if (!column || !strip) return

    // Setting scrollLeft by hand does not survive here: the strip snaps, and
    // the snap engine pulls the column straight back to the container edge —
    // under the sticky hour axis. The columns carry a scroll-margin instead, so
    // the snap point itself clears the axis, which fixes swiping by hand too.
    column.scrollIntoView({ block: 'nearest', inline: 'start' })
  }, [landingDay])

  const span = range.end - range.start

  return (
    <div className="card squircle min-w-0 overflow-hidden p-2 min-[900px]:p-3">
      <div
        ref={stripRef}
        className={cx(
          'no-scrollbar snap-x snap-mandatory overflow-x-auto',
          // Phones swipe a strip of fixed-width days; from the sidebar
          // breakpoint the same columns relax to 1fr and the week fits at once.
          '[--col-min:9.5rem] min-[900px]:[--col-min:0px]',
        )}
        style={{ ['--hour-h' as string]: HOUR_HEIGHT }}
      >
        {/* The closing hour label is centred on the end of the track, so half of
            it hangs below; without this the card's overflow slices it in two. */}
        <div className="flex min-w-full pb-2">
          <div
            className="sticky left-0 z-10 w-9 flex-none"
            style={{ background: 'var(--bg-grouped-secondary)' }}
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
                ref={day === landingDay ? todayColumn : undefined}
                className="flex-1 snap-start"
                style={{ minWidth: 'var(--col-min, 9.5rem)', scrollMarginLeft: '2.25rem' }}
              >
                <DayHeading day={day} date={dates[day]} count={dayBlocks.length} isToday={isToday} />

                <div
                  className="relative pr-1.5"
                  style={{
                    height: scale(span),
                    // Today reads as the live column without needing the accent.
                    background: isToday ? 'var(--surface-sunken)' : undefined,
                  }}
                >
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
  // Below about 40 minutes there is only room for the code, so the rest is
  // dropped rather than clipped mid-word.
  const roomy = endMinutes - startMinutes >= 50

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
        {roomy && (
          <span className="type-caption-2 type-data truncate text-[var(--label-secondary)]">
            {formatTime12(block.startTime)}
          </span>
        )}
        {roomy && block.room && (
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

function ScheduleSkeleton() {
  return (
    <>
      <NavBar title="Schedule" />
      <div className="app-container stack" aria-busy="true" aria-label="Loading your schedule">
        <div className="skeleton h-20 rounded-[var(--radius-md)]" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="skeleton h-[22rem] rounded-[var(--radius-md)]" />
          <div className="skeleton h-[22rem] rounded-[var(--radius-md)]" />
        </div>
      </div>
    </>
  )
}

function describeGap(gap: FreeBlock): string {
  const length = formatMinutes(gap.minutes)
  if (gap.after && gap.before) return `${length} between ${gap.after} and ${gap.before}`
  if (gap.before) return `${length} before ${gap.before}`
  if (gap.after) return `${length} after ${gap.after}`
  return `${length} free`
}

/** The hour range worth drawing: whole hours around the week's actual classes. */
function rangeOf(blocks: readonly ScheduleBlockView[]): { start: number; end: number } {
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
