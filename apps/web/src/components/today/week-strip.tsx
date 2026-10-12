'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import type { WeekDay } from '@/lib/queries/today'

/**
 * The next seven days as a row of pills.
 *
 * Today leads, filled in crimson; every other day is a white pill with its
 * letter and date. Under each, up to two dots: grey for classes, crimson for
 * something due — enough to see a heavy Thursday coming without reading a
 * calendar. Each pill opens that day on the schedule.
 */
export function WeekStrip({ week }: { week: WeekDay[] }) {
  const still = useReducedMotion()

  return (
    <nav aria-label="This week" className="-mx-1">
      <ol className="grid grid-cols-7 gap-1.5 px-1">
        {week.map((day, index) => {
          const today = index === 0
          const date = new Date(`${day.date}T00:00:00Z`)
          const label = [
            date.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
            today ? 'today' : null,
            day.classes ? `${day.classes} class${day.classes === 1 ? '' : 'es'}` : 'no classes',
            day.due ? `${day.due} due` : null,
          ]
            .filter(Boolean)
            .join(', ')

          return (
            <motion.li
              key={day.date}
              initial={still ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transition(spring.ui), delay: still ? 0 : index * 0.03 }}
            >
              <Link
                href={`/schedule/day/${day.date}` as never}
                aria-label={label}
                aria-current={today ? 'date' : undefined}
                className="flex flex-col items-center gap-1 rounded-[18px] pb-2 pt-2.5 transition-transform duration-150 active:scale-95"
                style={
                  today
                    ? {
                        background: 'var(--accent)',
                        color: 'var(--on-accent)',
                        boxShadow:
                          '0 8px 18px -10px color-mix(in srgb, var(--accent) 80%, transparent)',
                      }
                    : {
                        background: 'var(--bg)',
                        color: 'var(--label)',
                        boxShadow: '0 1px 2px rgb(24 24 27 / 0.04)',
                      }
                }
              >
                <span
                  aria-hidden
                  className="text-[0.6875rem] font-semibold uppercase"
                  style={{ opacity: today ? 0.8 : 0.5 }}
                >
                  {date.toLocaleDateString('en-PH', { weekday: 'narrow', timeZone: 'UTC' })}
                </span>
                <span aria-hidden className="text-[1.0625rem] font-bold leading-none tabular-nums">
                  {date.getUTCDate()}
                </span>
                <span aria-hidden className="flex h-1.5 items-center gap-[3px]">
                  {day.classes > 0 && (
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: today ? 'rgb(255 255 255 / 0.7)' : 'var(--label-quaternary)' }}
                    />
                  )}
                  {day.due > 0 && (
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: today ? 'var(--on-accent)' : 'var(--accent)' }}
                    />
                  )}
                </span>
              </Link>
            </motion.li>
          )
        })}
      </ol>
    </nav>
  )
}
