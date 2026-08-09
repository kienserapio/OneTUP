'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  describeFreshness,
  formatPeso,
  freshnessOf,
  rankRoutes,
  type Freshness,
  type RouteRank,
  type UserPreferences,
} from '@onetup/core'
import { readAll } from '@/lib/offline/db'
import { queueWrite, syncNow } from '@/lib/offline/sync'
import { prefersReducedMotion } from '@/design/motion'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button, ButtonLink } from '@/components/ui/button'
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { NavBar } from '@/components/app/nav-bar'
import { IconCheck, IconCommute, IconWarning } from '@/components/ui/icon'
import { CommuteStatStrip, type CommuteStat } from '@/components/commute/stat-strip'
import { cx } from '@/lib/cx'

/**
 * Getting to campus, drawn as a comparison rather than a list.
 *
 * The three things a student actually trades off — time, money, and how many
 * times they have to get on and off something — are on the face of every card,
 * so the choice is made by scanning a column rather than by opening each route
 * in turn. The segmented control re-ranks what is already loaded; ranking is a
 * pure function over the same rows, so switching it costs nothing.
 *
 * Both fares are always shown. That is not decoration — it is how a student
 * notices when a discount is being denied to them at the door (ADR-011).
 */

const RouteMap = dynamic(() => import('@/components/map/route-map').then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="skeleton h-[280px] rounded-[var(--radius-md)]" />,
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
  from_point: { lat: number; lng: number } | null
  to_point: { lat: number; lng: number } | null
  notes: string | null
  freshness: Freshness
}

interface RouteRow {
  id: string
  label: string | null
  legs: Leg[]
  totalMinutes: number
  totalFareRegular: number
  totalFareStudent: number
  transfers: number
  verifiedCount: number
  lastVerifiedAt: string | null
}

/** Freshness is re-derived on the client so a long-open tab does not go stale. */
type Route = RouteRow & { freshness: Freshness }

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

/**
 * Mirrors the polyline palette in components/map/route-map so leg three in the
 * list is leg three on the map. Correlating the two is the whole reason the
 * breakdown sits beside the map rather than under it.
 */
const LEG_COLORS = [
  'var(--ios-blue)',
  'var(--ios-orange)',
  'var(--ios-green)',
  'var(--ios-purple)',
  'var(--ios-teal)',
  'var(--ios-pink)',
]

const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: 'Confirmed recently',
  aging: 'Over a month old',
  stale: 'Over three months old',
  unverified: 'Never confirmed',
}

export function CommuteView() {
  const [areas, setAreas] = useState<{ id: string; name: string; city: string | null }[]>([])
  const [areaId, setAreaId] = useState('')
  const [rank, setRank] = useState<RouteRank>('fastest')
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [defaultRouteId, setDefaultRouteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const detailRef = useRef<HTMLDivElement>(null)

  // Preferences come from the local store; only the area list needs the network.
  const loadPreferences = useCallback(async () => {
    const rows = await readAll<UserPreferences & { id: string }>('user_preferences')
    const preferences = rows[0] ?? null
    const home = preferences?.home_area_id ?? ''
    if (home) setAreaId((current) => current || home)
    setDefaultRouteId(preferences?.default_route_id ?? null)
  }, [])

  useEffect(() => {
    void loadPreferences()
    void syncNow().then(loadPreferences)

    void (async () => {
      const { data } = await supabaseBrowser()
        .from('commute_areas')
        .select('id, name, city')
        .eq('is_active', true)
        .order('name')
      setAreas(data ?? [])
    })()
  }, [loadPreferences])

  const load = useCallback(async () => {
    if (!areaId) {
      setRoutes([])
      setLoading(false)
      return
    }
    setLoading(true)
    const response = await fetch(
      `/api/commute/routes?area_id=${encodeURIComponent(areaId)}&direction=inbound`,
    )
    const body = await response.json()
    const rows: RouteRow[] = response.ok ? (body.routes ?? []) : []
    setRoutes(rows.map((row) => ({ ...row, freshness: freshnessOf(row.lastVerifiedAt) })))
    setLoading(false)
  }, [areaId])

  useEffect(() => {
    void load()
  }, [load])

  const ordered = useMemo(() => rankRoutes(routes, rank), [routes, rank])

  /** Which route wins on each criterion, so every card can carry its own claim. */
  const best = useMemo(
    () => ({
      fastest: rankRoutes(routes, 'fastest')[0] ?? null,
      cheapest: rankRoutes(routes, 'cheapest')[0] ?? null,
      fewest_transfers: rankRoutes(routes, 'fewest_transfers')[0] ?? null,
    }),
    [routes],
  )

  // Keep a selection alive across re-ranks, but never leave a dangling one.
  useEffect(() => {
    setSelectedId((current) =>
      current && ordered.some((route) => route.id === current) ? current : (ordered[0]?.id ?? null),
    )
  }, [ordered])

  const selected = ordered.find((route) => route.id === selectedId) ?? null

  function choose(id: string) {
    setSelectedId(id)

    // On a phone the breakdown sits below the whole list, so bring it to the
    // student rather than making them hunt for what they just tapped. Where the
    // two columns are already side by side it is on screen, and scrolling it
    // into view would jump the page for no reason — so ask, rather than
    // matching a breakpoint in JavaScript that CSS already owns.
    requestAnimationFrame(() => {
      const panel = detailRef.current
      if (!panel) return
      const { top } = panel.getBoundingClientRect()
      if (top >= 0 && top < window.innerHeight * 0.6) return
      panel.scrollIntoView({
        block: 'start',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
    })
  }

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

  /**
   * The saved route is what the wake-up plan is computed against, so choosing
   * one here is what makes /commute/plan produce anything at all.
   */
  async function makeDefault(routeId: string) {
    const rows = await readAll<UserPreferences & { id: string }>('user_preferences')
    const preferences = rows[0]
    const userId = preferences?.user_id
    if (!userId) return

    setDefaultRouteId(routeId)
    await queueWrite({
      entity: 'user_preferences',
      // An upsert, not an update: the sync engine's update path keys on `id`,
      // and this table is keyed on `user_id`.
      operation: 'insert',
      payload: { user_id: userId, default_route_id: routeId },
      optimistic: { ...preferences, id: userId, default_route_id: routeId },
    })
  }

  const stats: CommuteStat[] = [
    { label: 'Options', value: routes.length },
    { label: 'Fastest', value: best.fastest ? `${best.fastest.totalMinutes} min` : '—' },
    { label: 'Cheapest', value: best.cheapest ? formatPeso(best.cheapest.totalFareStudent) : '—' },
    {
      label: 'Fewest rides',
      value: best.fewest_transfers ? best.fewest_transfers.transfers : '—',
    },
  ]

  return (
    <>
      <NavBar
        title="Commute"
        subtitle="Time, fare and rides, side by side."
        trailing={
          <Link
            href={'/commute/plan' as never}
            className="type-subheadline flex min-h-[var(--target-min)] items-center text-[var(--accent)]"
          >
            Wake-up plan
          </Link>
        }
      />

      <div className="app-container stack pb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-[16rem]">
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

          {areaId && routes.length > 1 && (
            <div className="segmented" role="group" aria-label="Rank routes by">
              {RANKS.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  aria-pressed={rank === entry.value}
                  data-selected={rank === entry.value}
                  onClick={() => setRank(entry.value)}
                  className="segmented-item"
                  style={{ paddingInline: 'var(--space-4)' }}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {!areaId ? (
          <Card>
            <EmptyState
              icon={<IconCommute size={30} />}
              title="Pick where you commute from and OneTUP will work out when to leave."
            />
          </Card>
        ) : loading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div className="skeleton h-56 rounded-[var(--radius-md)]" />
            <div className="skeleton h-56 rounded-[var(--radius-md)]" />
          </div>
        ) : routes.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconCommute size={30} />}
              title="No routes on file from there yet. Try a neighbouring area — routes are shared, so one that starts nearby usually still works."
            />
          </Card>
        ) : (
          <>
            <CommuteStatStrip stats={stats} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
              <section className="min-w-0">
                <SectionHeader>
                  {routes.length} way{routes.length === 1 ? '' : 's'} to get there
                </SectionHeader>
                <div className="stack">
                  {ordered.map((route) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      // With one route on file every claim is trivially true,
                      // so the badges would say nothing.
                      claims={routes.length > 1 ? claimsFor(route, best) : []}
                      isSelected={route.id === selectedId}
                      isDefault={route.id === defaultRouteId}
                      onSelect={() => choose(route.id)}
                    />
                  ))}
                </div>

                <p className="type-caption-1 mt-3 text-[var(--label-tertiary)]">
                  Routes and fares come from students. Confirm one after you ride it so the next
                  person gets it right.
                </p>
              </section>

              <div
                ref={detailRef}
                className="min-w-0 scroll-mt-[calc(var(--topbar-height)+var(--space-4))]"
              >
                {selected && (
                  <RouteDetail
                    route={selected}
                    isDefault={selected.id === defaultRouteId}
                    onConfirm={() => void confirmRoute(selected.id)}
                    onMakeDefault={() => void makeDefault(selected.id)}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function claimsFor(
  route: Route,
  best: Record<RouteRank, Route | null>,
): { label: string }[] {
  return RANKS.filter((entry) => best[entry.value]?.id === route.id).map((entry) => ({
    label: entry.label,
  }))
}

function RouteCard({
  route,
  claims,
  isSelected,
  isDefault,
  onSelect,
}: {
  route: Route
  claims: { label: string }[]
  isSelected: boolean
  isDefault: boolean
  onSelect: () => void
}) {
  const discounted = route.totalFareRegular > route.totalFareStudent
  // Aging is not an alarm, but it is not a green tick either.
  const warn = route.freshness === 'stale' || route.freshness === 'unverified'

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className="card squircle block w-full p-4 text-left"
      style={{
        transition: 'box-shadow var(--duration-fast) var(--ease-standard)',
        ...(isSelected
          ? { boxShadow: '0 0 0 1.5px var(--accent)', borderColor: 'transparent' }
          : null),
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {claims.map((claim) => (
          <Badge key={claim.label} tone="official">
            {claim.label}
          </Badge>
        ))}
        {isDefault && <Badge tone="verified">Your route</Badge>}
        <Badge tone={route.freshness === 'fresh' ? 'verified' : 'stale'}>
          {warn && <IconWarning size={11} />}
          {FRESHNESS_LABEL[route.freshness]}
        </Badge>
      </div>

      <p className="type-headline mt-2 truncate">{route.label ?? 'Route'}</p>

      <dl className="mt-2.5 grid grid-cols-3 gap-2">
        <div>
          <dt className="type-caption-2 uppercase tracking-[0.08em] text-[var(--label-tertiary)]">
            Time
          </dt>
          <dd className="type-data type-title-3">{route.totalMinutes} min</dd>
        </div>
        <div>
          <dt className="type-caption-2 uppercase tracking-[0.08em] text-[var(--label-tertiary)]">
            Student fare
          </dt>
          <dd className="type-data type-title-3">
            {formatPeso(route.totalFareStudent)}
            {discounted && (
              <span className="type-data type-caption-1 ml-1.5 align-middle text-[var(--label-tertiary)] line-through">
                {formatPeso(route.totalFareRegular)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="type-caption-2 uppercase tracking-[0.08em] text-[var(--label-tertiary)]">
            Rides
          </dt>
          <dd className="type-data type-title-3">{route.transfers}</dd>
        </div>
      </dl>
    </button>
  )
}

function RouteDetail({
  route,
  isDefault,
  onConfirm,
  onMakeDefault,
}: {
  route: Route
  isDefault: boolean
  onConfirm: () => void
  onMakeDefault: () => void
}) {
  return (
    <section className="stack">
      <Card padded={false}>
        <div className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="type-section-header">The way there</p>
              <h3 className="type-title-3 mt-0.5 truncate">{route.label ?? 'Route'}</h3>
            </div>
            <p className="type-data type-footnote shrink-0 text-[var(--label-secondary)]">
              {route.totalMinutes} min · {route.transfers} ride
              {route.transfers === 1 ? '' : 's'} · {formatPeso(route.totalFareStudent)}
            </p>
          </div>
        </div>

        <div className="px-4 pb-4">
          <RouteMap legs={route.legs} />
        </div>

        <ol className="px-4 pb-4">
          {route.legs.map((leg, index) => {
            const color = LEG_COLORS[index % LEG_COLORS.length]
            const last = index === route.legs.length - 1
            return (
              <li key={leg.ordinal} className="flex gap-3">
                <span aria-hidden className="flex w-3 flex-none flex-col items-center">
                  <span
                    className="mt-1.5 block size-3 flex-none rounded-full"
                    style={{ background: color }}
                  />
                  {!last && (
                    <span
                      className="block w-[2px] flex-1"
                      style={{ background: 'var(--separator)' }}
                    />
                  )}
                </span>

                <div className={cx('min-w-0 flex-1', last ? 'pb-0' : 'pb-4')}>
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
                          <span className="ml-1 text-[var(--label-tertiary)] line-through">
                            {formatPeso(leg.fare_regular)}
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
            )
          })}
        </ol>

        <div
          className="flex flex-wrap items-center justify-between gap-3 p-4"
          style={{ borderTop: '1px solid var(--separator)' }}
        >
          <p className="type-caption-1 min-w-0 flex-1 text-[var(--label-tertiary)]">
            {describeFreshness(route.freshness)}
            {route.verifiedCount > 0 &&
              ` · ${route.verifiedCount} confirmation${route.verifiedCount === 1 ? '' : 's'}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onConfirm} leading={<IconCheck size={16} />}>
              I rode this
            </Button>
            <Button
              size="sm"
              variant={isDefault ? 'plain' : 'accent'}
              onClick={onMakeDefault}
              disabled={isDefault}
            >
              {isDefault ? 'Saved as your route' : 'Use for my wake-up plan'}
            </Button>
          </div>
        </div>
      </Card>

      <ButtonLink href="/commute/plan" variant="plain" size="sm" className="-ml-3">
        Work out when to leave
      </ButtonLink>
    </section>
  )
}
