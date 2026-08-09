'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { describeFreshness, formatPeso, type Freshness, type RouteRank } from '@onetup/core'
import { supabaseBrowser } from '@/lib/supabase/client'
import { NavBar } from '@/components/app/nav-bar'
import { Button } from '@/components/ui/button'
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { IconCheck, IconCommute, IconWarning } from '@/components/ui/icon'

const RouteMap = dynamic(() => import('@/components/map/route-map').then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="skeleton h-[280px] rounded-[var(--radius-lg)]" />,
})

interface Leg {
  ordinal: number
  mode: string
  from_label: string
  to_label: string
  duration_minutes: number
  fare_regular: number
  fare_student: number
  discount_applied: boolean
  geometry: unknown
  notes: string | null
  freshness: Freshness
}

interface Route {
  id: string
  label: string | null
  legs: Leg[]
  totalMinutes: number
  totalFareRegular: number
  totalFareStudent: number
  transfers: number
  verifiedCount: number
  lastVerifiedAt: string | null
  freshness: Freshness
}

const RANKS: { value: RouteRank; label: string }[] = [
  { value: 'fastest', label: 'Fastest' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'fewest_transfers', label: 'Fewest rides' },
]

const MODE_LABEL: Record<string, string> = {
  walk: 'Walk',
  jeep: 'Jeep',
  bus: 'Bus',
  uv_express: 'UV Express',
  rail: 'Rail',
  tricycle: 'Tricycle',
  taxi: 'Taxi',
  tnvs: 'Ride-hail',
}

export function CommuteView() {
  const [areas, setAreas] = useState<{ id: string; name: string; city: string | null }[]>([])
  const [areaId, setAreaId] = useState('')
  const [rank, setRank] = useState<RouteRank>('fastest')
  const [routes, setRoutes] = useState<Route[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const supabase = supabaseBrowser()
      const [{ data: areaRows }, { data: user }] = await Promise.all([
        supabase.from('commute_areas').select('id, name, city').eq('is_active', true).order('name'),
        supabase.auth.getUser(),
      ])
      setAreas(areaRows ?? [])

      if (user.user) {
        const { data: preferences } = await supabase
          .from('user_preferences')
          .select('home_area_id')
          .eq('user_id', user.user.id)
          .maybeSingle()
        if (preferences?.home_area_id) setAreaId(preferences.home_area_id)
      }
    })()
  }, [])

  const load = useCallback(async () => {
    if (!areaId) {
      setRoutes([])
      setLoading(false)
      return
    }
    setLoading(true)
    const response = await fetch(
      `/api/commute/routes?area_id=${encodeURIComponent(areaId)}&direction=inbound&rank=${rank}`,
    )
    const body = await response.json()
    setRoutes(response.ok ? (body.routes ?? []) : [])
    setLoading(false)
  }, [areaId, rank])

  useEffect(() => {
    void load()
  }, [load])

  async function confirmRoute(routeId: string) {
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return

    await supabase.from('route_verifications').insert({
      user_id: data.user.id,
      route_id: routeId,
      kind: 'confirm',
    })
    await supabase
      .from('commute_routes')
      .update({ last_verified_at: new Date().toISOString() })
      .eq('id', routeId)

    await load()
  }

  return (
    <>
      <NavBar
        title="Commute"
        trailing={
          <Link href="/commute/plan" className="type-subheadline text-[var(--accent)]">
            Wake-up plan
          </Link>
        }
      />

      <div className="app-container stack">
        <div>
          <label htmlFor="origin" className="type-subheadline mb-1.5 block font-medium">
            Coming from
          </label>
          <select
            id="origin"
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
            className="field"
          >
            <option value="">Pick your area</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
                {area.city ? ` · ${area.city}` : ''}
              </option>
            ))}
          </select>
        </div>

        {areaId && (
          <div className="segmented self-start" role="tablist" aria-label="Rank routes by">
            {RANKS.map((entry) => (
              <button
                key={entry.value}
                role="tab"
                aria-selected={rank === entry.value}
                onClick={() => setRank(entry.value)}
                className="segmented-item"
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}

        {!areaId ? (
          <Card>
            <EmptyState
              icon={<IconCommute size={30} />}
              title="Pick where you commute from and OneTUP will work out when to leave."
            />
          </Card>
        ) : loading ? (
          <div className="skeleton h-48 rounded-[var(--radius-lg)]" />
        ) : routes.length === 0 ? (
          <Card>
            <EmptyState
              title="No routes on file from there yet. Adding one takes a minute and helps everyone from your area."
              action={
                <Button variant="accent" onClick={() => void 0}>
                  Add a route
                </Button>
              }
            />
          </Card>
        ) : (
          <section>
            <SectionHeader>
              {routes.length} way{routes.length === 1 ? '' : 's'} to get there
            </SectionHeader>

            <div className="stack">
              {routes.map((route, index) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  rank={index === 0 ? rank : null}
                  expanded={expanded === route.id}
                  onToggle={() => setExpanded(expanded === route.id ? null : route.id)}
                  onConfirm={() => void confirmRoute(route.id)}
                />
              ))}
            </div>

            <p className="type-caption-1 mt-3 text-[var(--label-tertiary)]">
              Routes and fares come from students. Confirm one after you ride it so the next person
              gets it right.
            </p>
          </section>
        )}
      </div>
    </>
  )
}

function RouteCard({
  route,
  rank,
  expanded,
  onToggle,
  onConfirm,
}: {
  route: Route
  rank: RouteRank | null
  expanded: boolean
  onToggle: () => void
  onConfirm: () => void
}) {
  const stale = route.freshness === 'stale' || route.freshness === 'unverified'

  return (
    <Card>
      <button type="button" onClick={onToggle} className="w-full text-left" aria-expanded={expanded}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {rank && (
                <Badge tone="official">
                  {RANKS.find((entry) => entry.value === rank)?.label}
                </Badge>
              )}
              {stale && (
                <Badge tone="stale">
                  <IconWarning size={11} />
                  {route.freshness === 'unverified' ? 'Not confirmed yet' : 'Out of date'}
                </Badge>
              )}
            </div>
            <p className="type-headline mt-1.5">{route.label ?? 'Route'}</p>
            <p className="type-data type-footnote mt-1 text-[var(--label-secondary)]">
              {route.totalMinutes} min · {route.transfers} ride
              {route.transfers === 1 ? '' : 's'}
            </p>
          </div>

          <div className="text-right">
            <p className="type-data type-title-3">{formatPeso(route.totalFareStudent)}</p>
            {route.totalFareRegular !== route.totalFareStudent && (
              <p className="type-data type-caption-1 text-[var(--label-tertiary)] line-through">
                {formatPeso(route.totalFareRegular)}
              </p>
            )}
            <p className="type-caption-2 text-[var(--label-secondary)]">student fare</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          <RouteMap legs={route.legs} />

          <ol className="space-y-2">
            {route.legs.map((leg) => (
              <li key={leg.ordinal} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="type-subheadline">
                    <span className="font-semibold">{MODE_LABEL[leg.mode] ?? leg.mode}</span>{' '}
                    {leg.from_label} → {leg.to_label}
                  </p>
                  <p className="type-data type-footnote text-[var(--label-secondary)]">
                    {leg.duration_minutes} min
                    {leg.fare_regular > 0 && (
                      <>
                        {' · '}
                        {formatPeso(leg.fare_student)}
                        {leg.discount_applied && (
                          <span className="text-[var(--label-tertiary)]">
                            {' '}
                            ({formatPeso(leg.fare_regular)} regular)
                          </span>
                        )}
                      </>
                    )}
                  </p>
                  {leg.notes && (
                    <p className="type-footnote text-[var(--label-secondary)]">{leg.notes}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="type-caption-1 text-[var(--label-tertiary)]">
              {describeFreshness(route.freshness)}
              {route.verifiedCount > 0 && ` · ${route.verifiedCount} confirmations`}
            </p>
            <Button size="sm" onClick={onConfirm} leading={<IconCheck size={16} />}>
              I rode this
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
