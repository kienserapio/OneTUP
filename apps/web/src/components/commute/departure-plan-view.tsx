'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, EmptyState, ListGroup, ListRow } from '@/components/ui/surfaces'
import { IconAlarm, IconClock, IconCommute, IconRefresh } from '@/components/ui/icon'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * The wake-up and leave-by plan.
 *
 * The explanation shown here is the one the server templated from the
 * adjustments that actually fired, not a second version written for the screen.
 * That is what stops the card and the 4:55 AM notification telling a student two
 * different stories about why their alarm moved.
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

  async function load() {
    setLoading(true)
    const response = await fetch('/api/departure/plan')
    const body = await response.json()
    setLoading(false)

    if (!response.ok) {
      setReason('no_route_saved')
      return
    }
    setPlan(body.plan)
    setReason(body.reason ?? null)
  }

  useEffect(() => {
    void load()
  }, [])

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

  return (
    <>
      <NavBar
        title="Wake-up plan"
        back={{ href: '/commute', label: 'Commute' }}
        trailing={
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Recalculate"
            className="grid size-9 place-items-center rounded-full text-[var(--accent)]"
          >
            <IconRefresh size={20} />
          </button>
        }
      />

      <div className="app-container stack">
        {loading ? (
          <div className="skeleton h-56 rounded-[var(--radius-lg)]" />
        ) : !plan ? (
          <Card>
            <EmptyState
              icon={<IconAlarm size={30} />}
              title={
                reason === 'no_class_day'
                  ? 'No classes coming up, so there is nothing to plan for.'
                  : 'Pick where you commute from and OneTUP will work out when to leave.'
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
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition(spring.ui)}
            >
              <Card>
                <p className="type-section-header">{formatDate(plan.plan_date)}</p>

                <div className="mt-3 flex items-baseline gap-6">
                  <div>
                    <p className="type-figure">{formatTime(plan.wake_at)}</p>
                    <p className="type-footnote text-[var(--label-secondary)]">wake up</p>
                  </div>
                  <div>
                    <p className="type-figure">{formatTime(plan.leave_at)}</p>
                    <p className="type-footnote text-[var(--label-secondary)]">leave</p>
                  </div>
                </div>

                <p className="type-body mt-4">{plan.explanation}</p>
              </Card>
            </motion.div>

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
                trailing={
                  <span className="type-data">
                    {plan.base_minutes +
                      plan.adjustments.reduce((sum, entry) => sum + entry.minutes, 0)}{' '}
                    min
                  </span>
                }
              />
            </ListGroup>

            {plan.adjustments.length > 0 && (
              <ListGroup>
                {plan.adjustments.map((adjustment, index) => (
                  <ListRow
                    key={`${adjustment.kind}-${index}`}
                    title={adjustment.reason}
                    trailing={
                      <span className="type-data text-[var(--label-secondary)]">
                        +{adjustment.minutes} min
                      </span>
                    }
                  />
                ))}
              </ListGroup>
            )}

            <Button variant="accent" block onClick={() => void setAlarms()} disabled={alarmSet}>
              {alarmSet ? 'Alarms set' : 'Set the alarm and the leave-now nudge'}
            </Button>

            <p className="type-caption-1 text-center text-[var(--label-tertiary)]">
              <Link href="/commute" className="text-[var(--accent)]">
                Change your route
              </Link>{' '}
              and this recalculates.
            </p>
          </>
        )}
      </div>
    </>
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
