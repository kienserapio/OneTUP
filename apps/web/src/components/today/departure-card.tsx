'use client'

import Link from 'next/link'
import type { DeparturePlanRow } from '@onetup/core'
import {
  IconAlarm,
  IconCampus,
  IconCommute,
  IconSchedule,
  IconWalk,
  type IconProps,
} from '@/components/ui/icon'
import { IconTile, type Tone } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { Watermark } from '@/components/ui/watermark'

/**
 * The wake-and-leave plan, drawn as the timeline it actually is.
 *
 * Four instants a student reads in order — wake, leave, arrive, class — each
 * as an icon on a dotted track, with Leave the one solid tile because it is
 * the one that matters. The stops are evenly spaced; each one's true position
 * in the window is kept on `data-offset` for when the track learns to draw it.
 * The explanation is the one the server templated from the adjustments that
 * fired, never a second version written for this card — it sits behind the
 * (i) so the card leads with times, not prose.
 */
export function DepartureCard({ plan }: { plan: DeparturePlanRow }) {
  const stops: {
    label: string
    at: string
    Icon: React.ComponentType<IconProps>
    tone: Tone
  }[] = [
    { label: 'Wake', at: plan.wake_at, Icon: IconAlarm, tone: 'crimson' },
    { label: 'Leave', at: plan.leave_at, Icon: IconWalk, tone: 'blue' },
    { label: 'Arrive', at: plan.arrive_by, Icon: IconCampus, tone: 'blue' },
    { label: 'Class', at: plan.class_start, Icon: IconSchedule, tone: 'gray' },
  ]

  const start = new Date(plan.wake_at).getTime()
  const span = Math.max(1, new Date(plan.class_start).getTime() - start)

  return (
    <section className="card-glass p-5">
      <Watermark Icon={IconCommute} size={120} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="type-headline">First class</h2>
          {plan.explanation && <InfoTip title="How this was worked out">{plan.explanation}</InfoTip>}
        </div>
        <span
          className="type-caption-1 shrink-0 rounded-full px-3 py-1 font-semibold"
          style={{ background: 'var(--tone-blue-tint)', color: 'var(--tone-blue-ink)' }}
        >
          Leave {formatTime(plan.leave_at)}
        </span>
      </div>

      <div className="relative mt-5">
        <span
          aria-hidden
          className="absolute left-5 right-5 top-5 border-t-2 border-dotted"
          style={{ borderColor: 'var(--label-quaternary)' }}
        />
        <ol className="relative flex justify-between">
          {stops.map((stop) => {
            const offset = ((new Date(stop.at).getTime() - start) / span) * 100
            const isLeave = stop.label === 'Leave'
            return (
              <li
                key={stop.label}
                className="flex w-16 flex-col items-center text-center"
                data-offset={offset.toFixed(1)}
              >
                <span className="rounded-[30%]" style={{ boxShadow: '0 0 0 4px var(--bg)' }}>
                  <IconTile
                    Icon={stop.Icon}
                    tone={stop.tone}
                    variant={isLeave ? 'solid' : 'soft'}
                    size={40}
                  />
                </span>
                <span className="type-data mt-2 text-[0.9375rem] font-bold">
                  {formatTime(stop.at)}
                </span>
                <span className="text-[0.6875rem] font-medium text-[var(--label-tertiary)]">
                  {stop.label}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link href={'/commute' as never} className="glass glass-sm">
          See the route
        </Link>
        <Link href={'/commute/plan' as never} className="glass glass-sm">
          Change alarm
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
