'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { Button, ButtonLink } from '@/components/ui/button'
import {Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { Row, RowList } from '@/components/ui/row'
import {
  IconAlarm,
  IconCampus,
  IconClock,
  IconCommute,
  IconRefresh,
  IconSchedule,
  IconWalk,
  IconWarning,
  type IconProps,
  IconRoute,
} from '@/components/ui/icon'
import { IconTile, type Tone } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { CommuteStatStrip, type CommuteStat } from '@/components/commute/stat-strip'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * The wake-up and leave-by plan.
 *
 * Four instants a student reads in order — wake, leave, arrive, class — as
 * icons on a dotted track. That is the same timeline Today draws on its
 * departure card, and deliberately so: a student should recognise this screen
 * as the expanded form of the card they already tapped, not as a second design.
 *
 * The explanation shown here is the one the server templated from the
 * adjustments that actually fired, never a second version written for the
 * screen. That is what stops the card and the 4:55 AM notification telling a
 * student two different stories about why their alarm moved.
 */

interface Adjustment {
  kind: 'peak' | 'weather'
  minutes: number
  reason: string
}

interface Plan {
  plan_date: string
  class_start: string
  arrive_by: string
  leave_at: string
  wake_at: string
  base_minutes: number
  adjustments: Adjustment[]
  explanation: string
}

type Reason = 'no_class_day' | 'no_route_saved' | null

export function DeparturePlanView() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [reason, setReason] = useState<Reason>(null)
  const [loading, setLoading] = useState(true)
  const [alarmSet, setAlarmSet] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/departure/plan')
    const body = await response.json()
    setLoading(false)

    if (!response.ok) {
      setPlan(null)
      setReason('no_route_saved')
      return
    }
    setPlan(body.plan)
    setReason(body.reason ?? null)
    setAlarmSet(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setAlarms() {
    if (!plan) return
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return

    await supabase.from('scheduled_notifications').upsert(
      [
        {
          user_id: data.user.id,
          kind: 'wake_alarm',
          entity: 'departure_plan',
          entity_id: null,
          fire_at: plan.wake_at,
          payload: {
            title: 'Time to get up',
            body: `You leave at ${formatTime(plan.leave_at)}.`,
            url: '/commute/plan',
          },
        },
        {
          user_id: data.user.id,
          kind: 'leave_now',
          entity: 'departure_plan',
          entity_id: null,
          fire_at: plan.leave_at,
          payload: {
            title: 'Time to go',
            body: `Leave now for your ${formatTime(plan.class_start)} class.`,
            url: '/commute/plan',
          },
        },
      ],
      { onConflict: 'user_id,kind,entity_id,fire_at' },
    )

    setAlarmSet(true)
  }

  const addedMinutes = plan?.adjustments.reduce((sum, entry) => sum + entry.minutes, 0) ?? 0
  const travelMinutes = (plan?.base_minutes ?? 0) + addedMinutes

  const stats: CommuteStat[] = plan
    ? [
        { label: 'Wake', value: formatTime(plan.wake_at) },
        { label: 'Leave', value: formatTime(plan.leave_at), hint: 'The one that matters' },
        { label: 'Travel', value: `${travelMinutes} min`, hint: `${plan.base_minutes} min clear` },
        { label: 'First class', value: formatTime(plan.class_start) },
      ]
    : []

  return (
    <>
      <NavBar
        title="Wake-up plan"
        subtitle={plan ? formatDate(plan.plan_date) : undefined}
        back={{ href: '/commute', label: 'Commute' }}
        trailing={
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Recalculate"
            data-tone="green"
            className="glyph grid size-11 place-items-center rounded-full transition-transform duration-150 active:scale-90"
          >
            <IconRefresh size={26} />
          </button>
        }
      />

      <div className="app-container stack pb-6">
        {loading ? (
          <div className="skeleton h-56 rounded-[var(--radius-lg)]" aria-busy="true" />
        ) : !plan ? (
          <Card>
            <EmptyState
              icon={<IconTile Icon={IconAlarm} tone="green" variant="solid" size={56} />}
              title={
                reason === 'no_class_day'
                  ? 'No classes coming up — nothing to plan.'
                  : 'Save a route and OneTUP works out when to leave.'
              }
              action={
                reason === 'no_route_saved' ? (
                  <ButtonLink href="/commute" variant="accent" leading={<IconRoute size={18} />}>
                    Choose a route
                  </ButtonLink>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <>
            <CommuteStatStrip stats={stats} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="stack min-w-0">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={transition(spring.ui)}
                >
                  <PlanTimeline plan={plan} />
                </motion.div>

                {plan.adjustments.length > 0 && (
                  <section>
                    <SectionHeader
                      info={
                        <InfoTip title="Why it moved">
                          Rush hour and weather add minutes on top of the clear-road time. Each
                          line is one thing that fired today.
                        </InfoTip>
                      }
                    >
                      Why it moved · +{addedMinutes} min
                    </SectionHeader>
                    <RowList>
                      {plan.adjustments.map((adjustment, index) => (
                        <Row
                          key={`${adjustment.kind}-${index}`}
                          leading={
                            adjustment.kind === 'weather' ? (
                              <IconTile Icon={IconWarning} tone="crimson" size={36} />
                            ) : (
                              <IconTile Icon={IconClock} tone="crimson" size={36} />
                            )
                          }
                          title={adjustment.reason}
                          trailing={
                            <span className="type-data text-[var(--label-secondary)]">
                              +{adjustment.minutes} min
                            </span>
                          }
                        />
                      ))}
                    </RowList>
                  </section>
                )}
              </div>

              <aside className="stack min-w-0">
                <section>
                  <SectionHeader>The numbers</SectionHeader>
                  <RowList>
                    <Row
                      leading={<IconTile Icon={IconCampus} tone="gray" size={36} />}
                      title="Arrive by"
                      trailing={<span className="type-data">{formatTime(plan.arrive_by)}</span>}
                    />
                    <Row
                      leading={<IconTile Icon={IconSchedule} tone="blue" size={36} />}
                      title="First class"
                      trailing={<span className="type-data">{formatTime(plan.class_start)}</span>}
                    />
                    <Row
                      leading={<IconTile Icon={IconCommute} tone="green" size={36} />}
                      title="Travel time"
                      detail={`${plan.base_minutes} min without delays`}
                      trailing={<span className="type-data">{travelMinutes} min</span>}
                    />
                  </RowList>
                </section>

                <Button
                  variant="accent"
                  size="lg"
                  block
                  onClick={() => void setAlarms()}
                  disabled={alarmSet}
                  leading={<IconAlarm size={20} />}
                >
                  {alarmSet ? 'Alarms set' : 'Set alarm + leave nudge'}
                </Button>

                <p className="type-caption-1 text-center text-[var(--label-tertiary)]">
                  <Link href={'/commute' as never} className="font-semibold text-[var(--accent)]">
                    Change your route
                  </Link>{' '}
                  and this recalculates.
                </p>
              </aside>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/**
 * The four instants as icons on a dotted track, Leave the one solid tile.
 *
 * The stops are evenly spaced so four labels always fit a phone; each stop's
 * true position in the window rides on `data-offset`. The server's explanation
 * sits behind the (i) so the card leads with times, not prose.
 */
function PlanTimeline({ plan }: { plan: Plan }) {
  const stops: {
    label: string
    at: string
    Icon: React.ComponentType<IconProps>
    tone: Tone
  }[] = [
    { label: 'Wake', at: plan.wake_at, Icon: IconAlarm, tone: 'crimson' },
    { label: 'Leave', at: plan.leave_at, Icon: IconWalk, tone: 'green' },
    { label: 'Arrive', at: plan.arrive_by, Icon: IconCampus, tone: 'gray' },
    { label: 'Class', at: plan.class_start, Icon: IconSchedule, tone: 'blue' },
  ]

  const start = new Date(plan.wake_at).getTime()
  const span = Math.max(1, new Date(plan.class_start).getTime() - start)

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="type-headline">First class</h2>
          {plan.explanation && <InfoTip title="How this was worked out">{plan.explanation}</InfoTip>}
        </div>
        <span
          className="type-caption-1 type-data shrink-0 rounded-full px-3 py-1 font-semibold"
          style={{ background: 'var(--tone-green-tint)', color: 'var(--tone-green-ink)' }}
        >
          Leave {formatTime(plan.leave_at)}
        </span>
      </div>

      <div className="relative mt-6">
        <span
          aria-hidden
          className="absolute left-6 right-6 top-6 border-t-2 border-dotted"
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
                    size={48}
                  />
                </span>
                <span className="type-data type-subheadline mt-2 font-bold">
                  {formatTime(stop.at)}
                </span>
                <span className="text-[0.75rem] font-medium text-[var(--label-tertiary)]">
                  {stop.label}
                </span>
              </li>
            )
          })}
        </ol>
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

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
}
