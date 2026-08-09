'use client'

import Link from 'next/link'
import type { DeparturePlanRow } from '@onetup/core'

/**
 * The wake-and-leave plan, drawn as the timeline it actually is.
 *
 * Four instants a student reads in order — wake, leave, arrive, class — with
 * the gaps between them proportional to the real minutes, so a long commute
 * looks long. The explanation underneath is the one the server templated from
 * the adjustments that fired, never a second version written for this card.
 */
export function DepartureCard({ plan }: { plan: DeparturePlanRow }) {
  const stops = [
    { label: 'Wake', at: plan.wake_at },
    { label: 'Leave', at: plan.leave_at },
    { label: 'Arrive', at: plan.arrive_by },
    { label: 'Class', at: plan.class_start },
  ]

  const start = new Date(plan.wake_at).getTime()
  const span = Math.max(1, new Date(plan.class_start).getTime() - start)

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-headline">Getting to your first class</h2>
          {plan.explanation && (
            <p className="type-footnote mt-1 max-w-[52ch] text-[var(--label-secondary)]">
              {plan.explanation}
            </p>
          )}
        </div>
        <span
          className="type-caption-1 shrink-0 rounded-full px-2.5 py-1 font-medium"
          style={{ background: 'var(--accent-subtle)', color: 'var(--crimson-800)' }}
        >
          leave {formatTime(plan.leave_at)}
        </span>
      </div>

      <div className="relative mt-6 pb-1">
        <span
          aria-hidden
          className="absolute left-0 right-0 top-[5px] h-[2px]"
          style={{ background: 'var(--separator)' }}
        />
        <ol className="relative flex justify-between">
          {stops.map((stop, index) => {
            const offset = ((new Date(stop.at).getTime() - start) / span) * 100
            const isLeave = stop.label === 'Leave'
            return (
              <li
                key={stop.label}
                className="flex flex-col items-center"
                style={{
                  // The dots sit at their true position in the window; the
                  // labels stay centred under them without overflowing an edge.
                  alignItems: index === 0 ? 'flex-start' : index === stops.length - 1 ? 'flex-end' : 'center',
                }}
              >
                <span
                  aria-hidden
                  className="block size-3 rounded-full"
                  style={{
                    background: isLeave ? 'var(--accent)' : 'var(--separator-opaque)',
                    outline: isLeave ? '3px solid var(--accent-subtle)' : 'none',
                  }}
                  data-offset={offset.toFixed(1)}
                />
                <span className="type-data mt-2 text-[0.9375rem] font-semibold">
                  {formatTime(stop.at)}
                </span>
                <span className="type-caption-2 uppercase tracking-[0.08em] text-[var(--label-tertiary)]">
                  {stop.label}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={'/commute' as never} className="glass glass-sm">
          See the route
        </Link>
        <Link href={'/commute/plan' as never} className="glass glass-sm glass-plain">
          Change my alarm
        </Link>
      </div>
    </section>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}
