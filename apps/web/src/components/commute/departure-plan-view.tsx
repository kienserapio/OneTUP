'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { IconAlarm, IconClock, IconCommute, IconRefresh, IconWarning } from '@/components/ui/icon'
import { CommuteStatStrip, type CommuteStat } from '@/components/commute/stat-strip'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * The wake-up and leave-by plan.
 *
 * Four instants a student reads in order — wake, leave, arrive, class — with
 * the gaps between them proportional to the real minutes, so a long commute
 * looks long. That is the same timeline Today draws on its departure card, and
 * deliberately so: a student should recognise this screen as the expanded form
 * of the card they already tapped, not as a second design.
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
            className="grid size-[var(--target-min)] place-items-center rounded-full text-[var(--accent)]"
          >
            <IconRefresh size={20} />
          </button>
        }
      />

      <div className="app-container stack pb-6">
        {loading ? (
          <div className="skeleton h-56 rounded-[var(--radius-md)]" aria-busy="true" />
        ) : !plan ? (
          <Card>
            <EmptyState
              icon={<IconAlarm size={30} />}
              title={
                reason === 'no_class_day'
                  ? 'No classes coming up, so there is nothing to plan for.'
                  : 'Pick where you commute from, save a route, and OneTUP will work out when to leave.'
              }
              action={
                reason === 'no_route_saved' ? (
                  <ButtonLink href="/commute" variant="accent">
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
                    <SectionHeader>
                      Why it moved · +{addedMinutes} min
                    </SectionHeader>
                    <ListGroup>
                      {plan.adjustments.map((adjustment, index) => (
                        <ListRow
                          key={`${adjustment.kind}-${index}`}
                          leading={
                            adjustment.kind === 'weather' ? (
                              <IconWarning size={20} />
                            ) : (
                              <IconClock size={20} />
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
                    </ListGroup>
                  </section>
                )}
              </div>

              <aside className="stack min-w-0">
                <section>
                  <SectionHeader>The numbers</SectionHeader>
                  <ListGroup>
                    <ListRow
                      leading={<IconClock size={20} />}
                      title="Arrive by"
                      trailing={<span className="type-data">{formatTime(plan.arrive_by)}</span>}
                    />
                    <ListRow
                      leading={<IconClock size={20} />}
                      title="First class"
                      trailing={<span className="type-data">{formatTime(plan.class_start)}</span>}
                    />
                    <ListRow
                      leading={<IconCommute size={20} />}
                      title="Travel time"
                      subtitle={`${plan.base_minutes} min without delays`}
                      trailing={<span className="type-data">{travelMinutes} min</span>}
                    />
                  </ListGroup>
                </section>

                <Button variant="accent" block onClick={() => void setAlarms()} disabled={alarmSet}>
                  {alarmSet ? 'Alarms set' : 'Set the alarm and the leave-now nudge'}
                </Button>

                <p className="type-caption-1 text-center text-[var(--label-tertiary)]">
                  <Link href={'/commute' as never} className="text-[var(--accent)]">
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
 * The four instants, spaced by their true minutes.
 *
 * Even spacing would make a ninety-minute commute look like a ten-minute one.
 * The dots carry the proportion; the labels stay centred under them and pin to
 * the ends so neither overflows the card.
 */
function PlanTimeline({ plan }: { plan: Plan }) {
  const stops = [
    { label: 'Wake', at: plan.wake_at },
    { label: 'Leave', at: plan.leave_at },
    { label: 'Arrive', at: plan.arrive_by },
    { label: 'Class', at: plan.class_start },
  ]

  const start = new Date(plan.wake_at).getTime()
  const span = Math.max(1, new Date(plan.class_start).getTime() - start)

  return (
    <section className="card squircle p-5">
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
          className="type-caption-1 type-data shrink-0 rounded-full px-2.5 py-1 font-medium"
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
                className="flex flex-col"
                style={{
                  alignItems:
                    index === 0 ? 'flex-start' : index === stops.length - 1 ? 'flex-end' : 'center',
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
                <span className="type-data type-subheadline mt-2 font-semibold">
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
