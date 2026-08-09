'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { CampusPlace } from '@onetup/core'
import { SiteHeader } from '@/components/landing/site-header'
import { RepoLink, SiteFooter } from '@/components/landing/site-footer'
import { ListGroup } from '@/components/ui/surfaces'
import { IconCampus, IconOffline, IconWarning } from '@/components/ui/icon'
import { RoomSearch } from './room-search'
import { CATEGORY_LABEL, PlaceList } from './place-list'

/**
 * The public campus map.
 *
 * No account, no sign-in wall, no "continue in the app". A visitor might be a
 * parent on enrolment day standing at the wrong gate, and the whole value of
 * this screen is that it answers them before they would ever have made an
 * account (ADR-012).
 *
 * The map is a picture of data that is shown in full underneath it. That
 * ordering is deliberate: if the tiles never arrive — a blocked host, a campus
 * wifi captive portal, no signal at all — the screen still answers the
 * question, and says plainly what the empty rectangle would have shown.
 */

/* Leaflet touches `window` on import and weighs more than everything else on
 * this page put together, so it is never part of the first payload. */
const CampusMap = dynamic(() => import('./campus-map'), {
  ssr: false,
  loading: () => <div className="skeleton size-full" role="status" aria-label="Loading the map" />,
})

const TUP_MANILA_CENTER: [number, number] = [14.5876, 120.9847]
const TUP_MANILA_ZOOM = 17

const CATEGORY_ORDER = [
  'building',
  'gate',
  'printing',
  'food',
  'study',
  'service',
  'landmark',
] as const

type MapState = 'pending' | 'ready' | 'unreachable' | 'offline'

export function CampusView({
  places,
  loadFailed,
}: {
  places: CampusPlace[]
  loadFailed: boolean
}) {
  const [active, setActive] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mapState, setMapState] = useState<MapState>('pending')

  useEffect(() => {
    // Being offline is a known state, not a failure to be discovered nine
    // seconds later by a timer.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setMapState('offline')
  }, [])

  const counts = useMemo(() => {
    const tally: Record<string, number> = {}
    for (const place of places) tally[place.category] = (tally[place.category] ?? 0) + 1
    return tally
  }, [places])

  const visible = useMemo(
    () => (active.size === 0 ? places : places.filter((place) => active.has(place.category))),
    [places, active],
  )

  const emergency = useMemo(() => places.filter((place) => place.is_emergency), [places])

  function toggle(category: string) {
    setActive((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  /** A room lookup answers with a building, so the filters get out of its way
   * rather than hiding the pin the student just asked for. */
  function locate(placeId: string) {
    setActive(new Set())
    setSelectedId(placeId)
  }

  const mapUsable = mapState === 'pending' || mapState === 'ready'

  return (
    <>
      <SiteHeader current="campus" />

      <main id="main" style={{ background: 'var(--bg-grouped)' }}>
        <div
          className="mx-auto flex w-full flex-col gap-[var(--space-8)] px-[var(--space-4)] pb-[var(--space-16)] pt-[var(--space-6)]"
          style={{ maxWidth: '56rem' }}
        >
          <header>
            <p className="type-section-header" style={{ color: 'var(--label)' }}>
              Open to everyone
            </p>
            <h1 className="type-large-title mt-[var(--space-2)]">TUP Manila campus</h1>
            <p className="type-body mt-[var(--space-3)] max-w-[52ch]">
              Rooms and the buildings they are in, gates, printing, food, and where to go when
              something is wrong. No sign-up. Works on any phone.
            </p>
          </header>

          {loadFailed ? (
            <Notice
              icon={<IconWarning size={26} />}
              title="Campus data could not be loaded"
              body="The place list is served from the database and that request did not come back. Nothing here is cached yet, so there is nothing to show in the meantime. Reloading is worth a try."
            />
          ) : (
            <>
              <RoomSearch places={places} onLocate={locate} />

              <section aria-label="Filter by category">
                <h2 className="type-section-header">Show</h2>
                <ul className="no-scrollbar -mx-[var(--space-4)] mt-[var(--space-2)] flex list-none gap-[var(--space-2)] overflow-x-auto px-[var(--space-4)] pb-[var(--space-1)] [&>li]:shrink-0">
                  <li>
                    <FilterChip
                      selected={active.size === 0}
                      onClick={() => setActive(new Set())}
                      label="Everything"
                      count={places.length}
                    />
                  </li>
                  {CATEGORY_ORDER.map((category) => (
                    <li key={category}>
                      <FilterChip
                        selected={active.has(category)}
                        onClick={() => toggle(category)}
                        label={CATEGORY_LABEL[category]}
                        count={counts[category] ?? 0}
                      />
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-label="Map">
                <div
                  className="squircle overflow-hidden rounded-[var(--radius-lg)]"
                  style={{
                    height: 'min(60vh, 30rem)',
                    minHeight: '20rem',
                    background: 'var(--bg-grouped-tertiary)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  {mapUsable ? (
                    <CampusMap
                      places={visible.map((place) => ({
                        id: place.id,
                        name: place.name,
                        lat: place.lat,
                        lng: place.lng,
                        category: place.category,
                        description: place.description,
                        is_emergency: place.is_emergency,
                      }))}
                      center={TUP_MANILA_CENTER}
                      zoom={TUP_MANILA_ZOOM}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onTilesUnavailable={() => setMapState('unreachable')}
                    />
                  ) : (
                    <MapUnavailable offline={mapState === 'offline'} />
                  )}
                </div>

                <p className="type-caption-1 mt-[var(--space-2)]">
                  Map data © OpenStreetMap contributors.
                </p>
              </section>

              <section aria-label="Places">
                <h2 className="type-section-header">
                  {active.size === 0
                    ? `Everything on campus · ${visible.length}`
                    : `${visible.length} shown`}
                </h2>

                <div className="mt-[var(--space-2)]">
                  {visible.length > 0 ? (
                    <PlaceList places={visible} selectedId={selectedId} onSelect={setSelectedId} />
                  ) : (
                    <div
                      className="rounded-[var(--radius-md)] p-[var(--space-5)]"
                      style={{ background: 'var(--bg-grouped-secondary)' }}
                    >
                      <p className="type-callout max-w-[46ch]">
                        Nothing recorded in that category yet. Everything here was added by a
                        student, so this fills in as people add to it.
                      </p>
                      <p className="type-subheadline mt-[var(--space-3)]">
                        <RepoLink>Contribute a place</RepoLink>
                      </p>
                    </div>
                  )}
                </div>

                <p className="type-caption-1 mt-[var(--space-3)] max-w-[52ch]">
                  Community-maintained. Verify prices before relying on them.
                </p>
              </section>

              {emergency.length > 0 && (
                <section aria-labelledby="emergency-heading">
                  <h2 id="emergency-heading" className="type-section-header">
                    If something goes wrong
                  </h2>
                  <div className="mt-[var(--space-2)]">
                    <ListGroup>
                      {emergency.map((place) => (
                        <EmergencyRow key={place.id} place={place} />
                      ))}
                    </ListGroup>
                  </div>
                  <p className="type-caption-1 mt-[var(--space-3)] max-w-[52ch]">
                    Numbers here are only as current as the last student who checked them. In a real
                    emergency, the nearest gate guard is faster than any of this.
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

function FilterChip({
  selected,
  onClick,
  label,
  count,
}: {
  selected: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="type-subheadline flex min-h-[var(--target-min)] shrink-0 items-center gap-[var(--space-2)] whitespace-nowrap rounded-[var(--radius-pill)] px-[var(--space-4)] font-medium"
      style={
        selected
          ? { background: 'var(--label)', color: 'var(--bg-grouped-secondary)' }
          : { background: 'var(--fill-quaternary)', color: 'var(--label)' }
      }
    >
      {label}
      <span className="type-data type-caption-1" style={{ opacity: 0.7 }}>
        {count}
      </span>
    </button>
  )
}

/**
 * The designed state for a map that has no tiles.
 *
 * It says what is missing, why the rectangle is empty, and where the same
 * information lives instead. It is not an error dialog, because nothing has
 * gone wrong with the thing the visitor came for.
 */
function MapUnavailable({ offline }: { offline: boolean }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-[var(--space-3)] p-[var(--space-6)] text-center">
      <span style={{ color: 'var(--label-secondary)' }}>
        {offline ? <IconOffline size={30} /> : <IconCampus size={30} />}
      </span>
      <p className="type-headline">
        {offline ? 'No connection, so no map' : 'The map tiles did not load'}
      </p>
      <p className="type-subheadline max-w-[44ch]">
        {offline
          ? 'Street tiles come from OpenStreetMap and need a connection. Everything on campus is listed below — the building, the floor, the nearest gate — and that part is already here.'
          : 'The tiles that draw the streets come from OpenStreetMap and are not reachable from this network. Everything the map would have pinned is listed below, with the building, the floor and the nearest gate.'}
      </p>
    </div>
  )
}

function EmergencyRow({ place }: { place: CampusPlace }) {
  const body = (
    <span className="min-w-0 flex-1">
      <span className="type-headline block">{place.name}</span>
      {place.description && <span className="type-footnote block">{place.description}</span>}
      <span className="type-footnote mt-[2px] block">
        {place.contact_phone ? (
          <span className="type-data">{place.contact_phone}</span>
        ) : (
          'No number recorded yet'
        )}
      </span>
    </span>
  )

  if (place.contact_phone) {
    return (
      <a
        href={`tel:${place.contact_phone.replace(/\s+/g, '')}`}
        className="list-row"
        style={{ alignItems: 'flex-start' }}
      >
        {body}
      </a>
    )
  }

  return (
    <div className="list-row" style={{ alignItems: 'flex-start' }}>
      {body}
    </div>
  )
}

function Notice({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div
      className="card squircle flex flex-col items-start gap-[var(--space-3)] p-[var(--space-5)]"
      style={{ background: 'var(--bg-grouped-secondary)' }}
    >
      <span style={{ color: 'var(--warning)' }}>{icon}</span>
      <p className="type-headline">{title}</p>
      <p className="type-subheadline max-w-[48ch]">{body}</p>
    </div>
  )
}
