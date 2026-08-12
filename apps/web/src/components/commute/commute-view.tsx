'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  freshnessOf,
  rankRoutes,
  type RouteRank,
  type UserPreferences,
} from '@onetup/core'
import { readAll } from '@/lib/offline/db'
import { queueWrite, syncNow } from '@/lib/offline/sync'
import { supabaseBrowser } from '@/lib/supabase/client'
import { IconButton } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/surfaces'
import { IconChevronDown, IconCommute, IconTarget } from '@/components/ui/icon'
import { DirectionsChat } from '@/components/commute/directions-chat'
import { RoutePanel, type Route, type RouteRow } from '@/components/commute/route-panel'
import type { MapInsets } from '@/components/map/route-map'
import { cx } from '@/lib/cx'

/**
 * Getting to campus, as a map.
 *
 * The question is where a route goes and what it costs, and both of those are
 * geography — so the map is the screen and everything else floats over it. The
 * canvas opens on TUP at walking zoom rather than on nothing, because the
 * destination is the one thing every student on this screen has in common.
 *
 * The overlay is a `pointer-events-none` layer holding `pointer-events-auto`
 * islands, so the map stays draggable everywhere the panels are not — the same
 * arrangement /campus uses over the 360° tour. It is written before the map in
 * the DOM so a keyboard reaches the controls without first walking through
 * Leaflet's own tab stops.
 *
 * One panel serves both breakpoints: a rail down the left where there is width
 * for one, a two-height sheet at the bottom where there is not.
 */

const RouteMap = dynamic(() => import('@/components/map/route-map').then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="skeleton size-full" style={{ borderRadius: 0 }} />,
})

/** Close enough to read street names, wide enough to see which gate is which. */
const CAMPUS_ZOOM = 16

/** Breathing room between a fitted route and the edge of what is visible. */
const GUTTER = 16

/**
 * One array, so "no route selected" is the same value every render. A fresh
 * `[]` here would look like new legs to the map and redraw it on every keypress
 * anywhere on the screen.
 */
const NO_LEGS: Route['legs'] = []

export function CommuteView() {
  const [areas, setAreas] = useState<{ id: string; name: string; city: string | null }[]>([])
  const [areaId, setAreaId] = useState('')
  const [rank, setRank] = useState<RouteRank>('fastest')
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [defaultRouteId, setDefaultRouteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  /** Bumped to re-run the map's fit — how the recentre button reaches Leaflet. */
  const [focusNonce, setFocusNonce] = useState(0)

  const headerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  /**
   * The canvas is the page, so the page does not scroll.
   *
   * The shell gives every screen a scroll container a viewport tall plus room
   * for the floating bar. That is right for a list and wrong for a map: the
   * leftover drags the canvas up under the top bar and shows a band of nothing
   * underneath it. Locked from here rather than in the shell's CSS because this
   * is the only screen that takes the whole viewport, and put back on the way
   * out so no other screen inherits it.
   */
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.overflowY
    root.style.overflowY = 'hidden'
    return () => {
      root.style.overflowY = previous
    }
  }, [])

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
  const areaName = areas.find((area) => area.id === areaId)?.name ?? null

  const insets = useMapInsets(headerRef, panelRef)

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

  return (
    <div
      className="relative isolate w-full overflow-hidden"
      // The shell's top bar is sticky and sits above this, so the canvas takes
      // what is left of the viewport rather than all of it. The safe area comes
      // off as well because the bar's own top padding includes it — installed
      // to a phone's home screen, that is another 40-odd pixels of notch.
      style={{
        height: 'calc(100dvh - var(--topbar-height) - env(safe-area-inset-top))',
        background: 'var(--bg)',
      }}
    >
      {/* The overlay comes first so a keyboard reaches it before the map. */}
      <div
        className={cx(
          'pointer-events-none absolute inset-0 z-10 grid gap-[var(--space-3)] p-[var(--space-3)]',
          // A phone stacks: picker, the chat button over open map, then the
          // sheet. A desktop puts the picker and the panel in one 24rem rail
          // and leaves the chat button in the far corner.
          'grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)_auto]',
          'min-[900px]:grid-cols-[24rem_minmax(0,1fr)] min-[900px]:grid-rows-[auto_minmax(0,1fr)]',
        )}
      >
        <div
          ref={headerRef}
          className="row-start-1 flex items-center gap-[var(--space-2)] min-[900px]:col-start-1 min-[900px]:row-start-1"
        >
          <OriginPicker
            areas={areas}
            value={areaId}
            onChange={(next) => {
              setAreaId(next)
              setExpanded(false)
            }}
          />
          <IconButton
            label="Centre the map on the route"
            onClick={() => setFocusNonce((value) => value + 1)}
            className="pointer-events-auto shrink-0"
            style={{ boxShadow: 'var(--shadow-float)' }}
          >
            <IconTarget size={20} />
          </IconButton>
        </div>

        <DirectionsChat
          areaName={areaName}
          // The extra bottom padding on a desktop keeps the button off
          // OpenStreetMap's attribution, which the tile terms require to stay
          // legible in the corner it sits in.
          className="row-start-2 justify-self-end min-[900px]:col-start-2 min-[900px]:row-start-2 min-[900px]:self-end min-[900px]:pb-[var(--space-4)]"
        />

        <div
          ref={panelRef}
          className="row-start-4 flex min-h-0 flex-col min-[900px]:col-start-1 min-[900px]:row-start-2"
        >
          {!areaId ? (
            <Card className="pointer-events-auto" padded>
              <EmptyState
                icon={<IconCommute size={28} />}
                title="Pick where you commute from and the ways to campus draw themselves on the map."
              />
            </Card>
          ) : loading ? (
            <div className="skeleton pointer-events-auto h-40 w-full rounded-[var(--radius-md)]" />
          ) : routes.length === 0 ? (
            <Card className="pointer-events-auto" padded>
              <EmptyState
                icon={<IconCommute size={28} />}
                title="No routes on file from there yet. Try a neighbouring area — routes are shared, so one that starts nearby usually still works."
              />
            </Card>
          ) : (
            <RoutePanel
              routes={ordered}
              best={best}
              rank={rank}
              onRank={setRank}
              selected={selected}
              defaultRouteId={defaultRouteId}
              onSelect={setSelectedId}
              onConfirm={() => selected && void confirmRoute(selected.id)}
              onMakeDefault={() => selected && void makeDefault(selected.id)}
              expanded={expanded}
              onExpanded={setExpanded}
            />
          )}

          {/* Clears the floating bar, which only exists below the breakpoint. */}
          <div
            className="mobile-only shrink-0"
            aria-hidden
            style={{
              height:
                'calc(var(--tab-bar-height) + var(--tab-bar-inset) * 2 + env(safe-area-inset-bottom))',
            }}
          />
        </div>
      </div>

      <div className="absolute inset-0 z-0">
        <RouteMap
          legs={selected?.legs ?? NO_LEGS}
          height="100%"
          zoom={CAMPUS_ZOOM}
          insets={insets}
          focusNonce={focusNonce}
          rounded={false}
          // The canvas has no room for Leaflet's own buttons without landing
          // them under a panel. Pinch, wheel, double-tap and the keyboard's
          // +/− all still zoom, and the recentre control is in the overlay.
          zoomControl={false}
          className="size-full"
        />
      </div>
    </div>
  )
}

/**
 * The search bar of a maps app, which here has exactly one field in it.
 *
 * The whole card is the label, so the target is the card rather than the two
 * lines of text inside it — a select that only opens when a thumb lands on the
 * word itself is a select that feels broken.
 */
function OriginPicker({
  areas,
  value,
  onChange,
}: {
  areas: { id: string; name: string; city: string | null }[]
  value: string
  onChange: (next: string) => void
}) {
  return (
    <label
      htmlFor="commute-origin"
      className="card squircle pointer-events-auto flex min-w-0 flex-1 items-center gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)]"
      style={{ boxShadow: 'var(--shadow-float)' }}
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full"
        style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
      >
        <IconCommute size={17} />
      </span>

      <span className="min-w-0 flex-1">
        {/* Weight and tracking are inline because the type scale is unlayered
            CSS and therefore outranks anything in Tailwind's utilities. */}
        <span
          className="type-caption-2 block uppercase text-[var(--label-tertiary)]"
          style={{ fontWeight: 600, letterSpacing: '0.06em' }}
        >
          Coming from
        </span>
        <select
          id="commute-origin"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="type-callout w-full appearance-none truncate bg-transparent"
          style={{ border: 'none', outline: 'none', padding: 0, fontWeight: 600 }}
        >
          <option value="">Pick your area</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
              {area.city ? ` · ${area.city}` : ''}
            </option>
          ))}
        </select>
      </span>

      <IconChevronDown size={16} className="shrink-0 text-[var(--label-tertiary)]" aria-hidden />
    </label>
  )
}

/**
 * How much of the map each floating panel is standing on.
 *
 * Measured rather than assumed: the sheet's height changes when it expands and
 * the rail's width is a token away from changing, and a route fitted to the
 * whole canvas would sit half underneath either of them.
 */
function useMapInsets(
  header: React.RefObject<HTMLElement | null>,
  panel: React.RefObject<HTMLElement | null>,
): MapInsets {
  const [box, setBox] = useState({ header: 0, panelWidth: 0, panelHeight: 0 })
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    // The shell's own breakpoint. Only the map's framing depends on it, so a
    // first paint that guesses phone costs a re-fit and nothing visible.
    const media = window.matchMedia('(min-width: 900px)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const headerElement = header.current
    const panelElement = panel.current
    if (!headerElement || !panelElement) return

    const measure = () =>
      setBox({
        header: headerElement.offsetHeight,
        panelWidth: panelElement.offsetWidth,
        panelHeight: panelElement.offsetHeight,
      })

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(headerElement)
    observer.observe(panelElement)
    return () => observer.disconnect()
  }, [header, panel])

  return isDesktop
    ? { top: GUTTER, right: GUTTER, bottom: GUTTER, left: box.panelWidth + GUTTER * 2 }
    : {
        top: box.header + GUTTER * 2,
        right: GUTTER,
        bottom: box.panelHeight + GUTTER,
        left: GUTTER,
      }
}
