'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconSchedule } from './icon'
import { PickerPanel } from './picker-panel'

/**
 * The app's date field, in place of <input type="date">.
 *
 * The value is the same 'YYYY-MM-DD' string the native input produced, so no
 * caller had to change what it stores. Everything is done on calendar dates
 * as plain year/month/day numbers — never through a local-time Date — and
 * "today" is today in Manila, which is the only clock the app keeps.
 *
 * The calendar opens on the chosen date (or today), and its title switches
 * to a year grid and a month grid, so a birthdate twenty years back is three
 * taps rather than two hundred and forty.
 */

export interface DatePickerProps {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  /** Offer a way back to no date, for fields where the date is optional. */
  clearable?: boolean
  /** Today / Tomorrow / Next week shortcuts. Off for things like a birthdate. */
  quick?: boolean
  label?: string
  autoComplete?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
  'aria-label'?: string
}

interface Ymd {
  y: number
  m: number // 1–12
  d: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function parseYmd(value: string | undefined | null): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

export function formatYmd({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Today's date in Manila, as 'YYYY-MM-DD'. */
export function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function weekday({ y, m, d }: Ymd): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function addDays(date: Ymd, days: number): Ymd {
  const next = new Date(Date.UTC(date.y, date.m - 1, date.d + days))
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() }
}

function addMonths(date: Ymd, months: number): Ymd {
  const index = date.y * 12 + (date.m - 1) + months
  const y = Math.floor(index / 12)
  const m = (index % 12) + 1
  return { y, m, d: Math.min(date.d, daysIn(y, m)) }
}

/** "Mon, Oct 13", with the year only when it is not this one. */
export function formatFriendlyDate(value: string, thisYear?: number): string {
  const date = parseYmd(value)
  if (!date) return ''
  const day = WEEKDAYS[weekday(date)]
  const month = MONTHS[date.m - 1].slice(0, 3)
  return `${day}, ${month} ${date.d}${date.y === thisYear ? '' : `, ${date.y}`}`
}

export function DatePicker({
  id,
  name,
  value,
  onChange,
  min,
  max,
  placeholder = 'Pick a date',
  disabled,
  required,
  className,
  clearable,
  quick = true,
  label,
  ...aria
}: DatePickerProps) {
  const autoId = useId()
  const triggerId = id ?? `date-${autoId}`

  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [today, setToday] = useState('')
  const [focus, setFocus] = useState<Ymd>({ y: 2000, m: 1, d: 1 })
  const [view, setView] = useState<'days' | 'months' | 'years'>('days')
  const [direction, setDirection] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)

  const selected = parseYmd(value)
  const minDate = parseYmd(min)
  const maxDate = parseYmd(max)
  const outOfRange = (date: string) => (!!min && date < min) || (!!max && date > max)

  const openCalendar = (element: HTMLButtonElement) => {
    if (disabled) return
    const now = manilaToday()
    setToday(now)
    setAnchor(element)
    setFocus(selected ?? parseYmd(now)!)
    setView('days')
    setDirection(0)
    setOpen(true)
  }

  const close = () => setOpen(false)

  const pick = (date: string) => {
    if (outOfRange(date)) return
    onChange(date)
    close()
  }

  const moveFocus = (next: Ymd) => {
    if (next.y !== focus.y || next.m !== focus.m) {
      setDirection(next.y * 12 + next.m > focus.y * 12 + focus.m ? 1 : -1)
    }
    setFocus(next)
  }

  // Keyboard focus follows the focused day, including across a month change.
  useEffect(() => {
    if (!open || view !== 'days') return
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-date="${formatYmd(focus)}"]`)
      ?.focus({ preventScroll: true })
  }, [open, view, focus])

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, event.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -weekday(focus)),
      End: () => addDays(focus, 6 - weekday(focus)),
    }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    moveFocus(step())
  }

  const display = selected ? formatFriendlyDate(value, parseYmd(manilaToday())?.y) : ''

  const quickPicks = (() => {
    const base = parseYmd(today)
    if (!base) return []
    return [
      { label: 'Today', date: today },
      { label: 'Tomorrow', date: formatYmd(addDays(base, 1)) },
      { label: 'Next week', date: formatYmd(addDays(base, 7)) },
    ].filter((item) => !outOfRange(item.date))
  })()

  return (
    <>
      <button
        type="button"
        id={triggerId}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-required={required || undefined}
        data-invalid={aria['aria-invalid'] === true || aria['aria-invalid'] === 'true' || undefined}
        aria-describedby={aria['aria-describedby']}
        aria-label={
          aria['aria-label'] ? `${aria['aria-label']}${display ? `, ${display}` : ''}` : undefined
        }
        disabled={disabled}
        data-open={open || undefined}
        className={cx('picker-trigger field', className)}
        onClick={(event) => (open ? close() : openCalendar(event.currentTarget))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            openCalendar(event.currentTarget)
          }
        }}
      >
        <IconSchedule size={18} className="picker-lead shrink-0" aria-hidden />
        <span className={cx('min-w-0 flex-1 truncate text-left', !display && 'picker-placeholder')}>
          {display || placeholder}
        </span>
        <IconChevronDown size={18} className="picker-chevron shrink-0" aria-hidden />
      </button>

      {name && <input type="hidden" name={name} value={value} />}

      <PickerPanel
        open={open}
        anchor={anchor}
        onClose={close}
        label={label ?? aria['aria-label'] ?? 'Choose a date'}
        minWidth={316}
        footer={
          (clearable && value) || (quick && quickPicks.length > 0) ? (
            <div className="flex flex-wrap items-center gap-2">
              {quick &&
                quickPicks.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="picker-chip"
                    data-selected={item.date === value || undefined}
                    onClick={() => pick(item.date)}
                  >
                    {item.label}
                  </button>
                ))}
              {clearable && value && (
                <button
                  type="button"
                  className="picker-chip picker-chip-quiet ml-auto"
                  onClick={() => {
                    onChange('')
                    close()
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          ) : undefined
        }
      >
        <div className="calendar">
          <div className="calendar-head">
            <button
              type="button"
              className="calendar-title"
              aria-label={
                view === 'days'
                  ? 'Choose month and year'
                  : view === 'months'
                    ? 'Choose year'
                    : 'Back to days'
              }
              onClick={() =>
                setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days')
              }
            >
              {view === 'years'
                ? `${yearPage(focus.y)} – ${yearPage(focus.y) + 11}`
                : view === 'months'
                  ? focus.y
                  : `${MONTHS[focus.m - 1]} ${focus.y}`}
              <IconChevronDown
                size={16}
                className="transition-transform"
                style={{ transform: view === 'days' ? undefined : 'rotate(180deg)' }}
                aria-hidden
              />
            </button>
            <span className="flex gap-1">
              <button
                type="button"
                className="calendar-nav"
                aria-label={
                  view === 'days'
                    ? 'Previous month'
                    : view === 'months'
                      ? 'Previous year'
                      : 'Earlier years'
                }
                onClick={() =>
                  moveFocus(addMonths(focus, view === 'days' ? -1 : view === 'months' ? -12 : -144))
                }
              >
                <IconChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="calendar-nav"
                aria-label={
                  view === 'days' ? 'Next month' : view === 'months' ? 'Next year' : 'Later years'
                }
                onClick={() =>
                  moveFocus(addMonths(focus, view === 'days' ? 1 : view === 'months' ? 12 : 144))
                }
              >
                <IconChevronRight size={18} />
              </button>
            </span>
          </div>

          {view === 'days' && (
            <div
              ref={gridRef}
              role="grid"
              aria-label={`${MONTHS[focus.m - 1]} ${focus.y}`}
              onKeyDown={onGridKeyDown}
            >
              <div role="row" className="calendar-weekdays">
                {WEEKDAYS.map((day) => (
                  <span key={day} role="columnheader" aria-label={day}>
                    {day.slice(0, 2)}
                  </span>
                ))}
              </div>
              <div className="relative overflow-hidden">
                <AnimatePresence initial={false} mode="popLayout" custom={direction}>
                  <motion.div
                    key={`${focus.y}-${focus.m}`}
                    custom={direction}
                    variants={{
                      enter: (dir: number) => ({ x: dir * 40, opacity: 0 }),
                      center: { x: 0, opacity: 1 },
                      exit: (dir: number) => ({ x: dir * -40, opacity: 0 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition(spring.snap)}
                  >
                    {monthWeeks(focus.y, focus.m).map((week, row) => (
                      <div key={row} role="row" className="calendar-week">
                        {week.map((day, column) => {
                          if (day === null) return <span key={column} role="gridcell" />
                          const date = formatYmd({ y: focus.y, m: focus.m, d: day })
                          const isSelected = date === value
                          const blocked = outOfRange(date)
                          return (
                            <span key={column} role="gridcell" aria-selected={isSelected}>
                              <button
                                type="button"
                                data-date={date}
                                tabIndex={day === focus.d ? 0 : -1}
                                disabled={blocked}
                                aria-label={formatFriendlyDate(date)}
                                aria-current={date === today ? 'date' : undefined}
                                data-selected={isSelected || undefined}
                                data-today={date === today || undefined}
                                className="calendar-day"
                                onClick={() => pick(date)}
                                onFocus={() => day !== focus.d && setFocus({ ...focus, d: day })}
                              >
                                {day}
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          )}

          {view === 'months' && (
            <div className="calendar-tiles">
              {MONTHS.map((month, index) => {
                const m = index + 1
                const beforeMin = minDate && focus.y * 12 + m < minDate.y * 12 + minDate.m
                const afterMax = maxDate && focus.y * 12 + m > maxDate.y * 12 + maxDate.m
                return (
                  <button
                    key={month}
                    type="button"
                    className="calendar-tile"
                    disabled={!!beforeMin || !!afterMax}
                    data-selected={(selected?.y === focus.y && selected.m === m) || undefined}
                    onClick={() => {
                      setFocus({ y: focus.y, m, d: Math.min(focus.d, daysIn(focus.y, m)) })
                      setView('days')
                    }}
                  >
                    {month.slice(0, 3)}
                  </button>
                )
              })}
            </div>
          )}

          {view === 'years' && (
            <div className="calendar-tiles">
              {Array.from({ length: 12 }, (_, index) => yearPage(focus.y) + index).map((year) => (
                <button
                  key={year}
                  type="button"
                  className="calendar-tile"
                  disabled={(!!minDate && year < minDate.y) || (!!maxDate && year > maxDate.y)}
                  data-selected={selected?.y === year || undefined}
                  onClick={() => {
                    setFocus({ y: year, m: focus.m, d: Math.min(focus.d, daysIn(year, focus.m)) })
                    setView('months')
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}
        </div>
      </PickerPanel>
    </>
  )
}

function yearPage(year: number): number {
  return year - (((year % 12) + 12) % 12)
}

/** The month as weeks of day numbers, Sunday first, null for the blanks. */
function monthWeeks(y: number, m: number): (number | null)[][] {
  const lead = weekday({ y, m, d: 1 })
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysIn(y, m) }, (_, index) => index + 1),
  ]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7))
}
