'use client'

import { useEffect, useRef, useState } from 'react'
import type { Layer, Map as LeafletMap } from 'leaflet'
import { cx } from '@/lib/cx'
import { legColor } from './leg-colors'

/**
 * The map.
 *
 * Leaflet is imported at runtime rather than bundled, because it and its CSS
 * are the single largest thing this app could ship and most sessions never open
 * a map at all (NFR-P6).
 *
 * It draws two things and the caller decides which: the campus on its own, held
 * at a walking-distance zoom, or a route fitted to its legs. Both are the same
 * component because they are the same map — the commute screen moves between
 * them as a selection comes and goes, and tearing down a Leaflet instance to
 * swap one for the other would flash the tiles back to grey every time.
 *
 * When tiles fail — which on campus wifi is a matter of when, not if — the
 * caller renders the legs as a list and this component explains itself. That is
 * a designed state, not an error.
 */

export interface LatLng {
  lat: number
  lng: number
}

export interface MapLeg {
  ordinal: number
  mode: string
  from_label: string
  to_label: string
  /** A GeoJSON LineString of the real path, where a student has traced one. */
  geometry: unknown
  /** The stops themselves. Real coordinates even when the path between is not. */
  from_point?: LatLng | null
  to_point?: LatLng | null
}

/**
 * How much of each edge the caller has floating over the map.
 *
 * A route fitted to the whole container lands half-underneath a panel on a
 * map-first screen, which reads as the app having centred on the wrong thing.
 * Given the insets, the fit happens inside what is actually visible.
 */
export interface MapInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface RouteMapProps {
  legs: MapLeg[]
  className?: string
  /** A number is pixels. A string passes straight through, so a canvas can ask for `100%`. */
  height?: number | string
  /** Where the map sits when there is no route to fit. */
  center?: LatLng
  zoom?: number
  insets?: MapInsets
  zoomControl?: boolean
  rounded?: boolean
  /** Bumped by the caller to re-run the fit — how "recentre" works on a map that never unmounts. */
  focusNonce?: number
}

export const TUP_MANILA: LatLng = { lat: 14.5876, lng: 120.9847 }

const DEFAULT_INSETS: MapInsets = { top: 28, right: 28, bottom: 28, left: 28 }

export function RouteMap({
  legs,
  className,
  height = 280,
  center = TUP_MANILA,
  zoom = 13,
  insets = DEFAULT_INSETS,
  zoomControl = true,
  rounded = true,
  focusNonce = 0,
}: RouteMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [approximate, setApproximate] = useState(false)
  // The ready map is state, not just the ref, because Leaflet is imported at
  // runtime and the legs are always in hand before it lands. A ref cannot wake
  // the drawing effect, so keying off one alone left the map permanently blank.
  const [ready, setReady] = useState<LeafletMap | null>(null)

  // The map is built once; from then on the view belongs to the fit effect
  // below, so only the first values of these ever apply.
  const initial = useRef({ center, zoom, zoomControl })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !container.current || map.current) return

      const start = initial.current

      const instance = L.map(container.current, {
        center: [start.center.lat, start.center.lng],
        zoom: start.zoom,
        zoomControl: start.zoomControl,
        attributionControl: true,
      })

      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        // Required by the tile usage terms.
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      })

      tiles.on('tileerror', () => setFailed(true))
      tiles.addTo(instance)

      map.current = instance
      setReady(instance)
    })()

    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      setReady(null)
    }
  }, [])

  // Spread into primitives so a caller writing the insets inline does not
  // redraw the whole map on every render it happens to do.
  const { top, right, bottom, left } = insets
  const { lat: centerLat, lng: centerLng } = center

  useEffect(() => {
    if (!ready) return

    // Collected outside the async body so the cleanup React actually receives
    // can reach them. Returning a cleanup from inside the IIFE returns it to
    // nothing, and every route switch would stack another set of lines on the
    // map on top of the last.
    const drawn: Layer[] = []
    let cancelled = false
    let approximated = false

    void (async () => {
      const L = await import('leaflet')
      const instance = ready
      if (cancelled) return

      const bounds = L.latLngBounds([])

      // Campus is on the map whether or not a route is: a map of Manila with
      // nothing marked on it does not answer the question this screen is for.
      // Its label is permanent only while it is the only thing here — with a
      // route drawn, the route's own stops are what want naming.
      drawn.push(
        L.circleMarker([TUP_MANILA.lat, TUP_MANILA.lng], {
          radius: 7,
          color: 'var(--bg)',
          weight: 3,
          fillColor: 'var(--accent)',
          fillOpacity: 1,
        })
          .addTo(instance)
          .bindTooltip('TUP Manila', {
            permanent: legs.length === 0,
            direction: 'top',
            offset: [0, -8],
          }),
      )

      legs.forEach((leg, index) => {
        const color = legColor(index)
        const traced = coordinatesOf(leg.geometry)
        const endpoints = endpointsOf(leg)

        // A traced path is the truth. Failing that the two stops are still
        // real, and a straight line between them is drawn dashed so it reads
        // as "these two places" rather than as a claim about the road.
        const coordinates = traced.length >= 2 ? traced : endpoints

        // One known stop still belongs on the map: it places part of the trip
        // even though nothing can be drawn between it and the next one.
        endpoints.forEach((point) => {
          drawn.push(
            L.circleMarker(point, {
              radius: 4,
              color: 'var(--bg)',
              weight: 2,
              fillColor: color,
              fillOpacity: 1,
            })
              .addTo(instance)
              .bindTooltip(`${leg.from_label} → ${leg.to_label}`, { sticky: true }),
          )
          bounds.extend(point)
        })

        if (coordinates.length < 2) {
          approximated = true
          return
        }

        const isApproximate = traced.length < 2
        if (isApproximate) approximated = true

        const line = L.polyline(coordinates, {
          color,
          weight: isApproximate ? 3 : 5,
          opacity: isApproximate ? 0.65 : 0.9,
          dashArray: isApproximate ? '2 8' : undefined,
          lineCap: 'round',
        })
          .addTo(instance)
          .bindTooltip(
            `${index + 1}. ${leg.from_label} → ${leg.to_label}` +
              (isApproximate ? ' (stops only)' : ''),
            { sticky: true },
          )

        drawn.push(line)
        coordinates.forEach((point) => bounds.extend(point))
      })

      // A panel taller than the map would ask Leaflet to fit a route into no
      // space at all, so the insets are only ever allowed to claim part of it.
      const size = instance.getSize()
      const clampX = (value: number) => Math.max(0, Math.min(value, size.x * 0.4))
      const clampY = (value: number) => Math.max(0, Math.min(value, size.y * 0.4))

      if (bounds.isValid()) {
        instance.fitBounds(bounds, {
          paddingTopLeft: [clampX(left), clampY(top)],
          paddingBottomRight: [clampX(right), clampY(bottom)],
        })
      } else {
        // Nothing to fit, so hold the campus at the asked-for zoom — then shove
        // it out from under the panels, which is the closest a plain `setView`
        // gets to the padding `fitBounds` takes.
        instance.setView([centerLat, centerLng], zoom, { animate: false })
        instance.panBy([(clampX(right) - clampX(left)) / 2, (clampY(bottom) - clampY(top)) / 2], {
          animate: false,
        })
      }

      if (!cancelled) setApproximate(approximated)
    })()

    return () => {
      cancelled = true
      drawn.forEach((layer) => layer.remove())
    }
  }, [ready, legs, top, right, bottom, left, centerLat, centerLng, zoom, focusNonce])

  return (
    <div
      className={cx(
        'relative overflow-hidden',
        rounded && 'rounded-[var(--radius-lg)]',
        className,
      )}
    >
      <div ref={container} style={{ height }} className="w-full" role="presentation" />

      {/* Said plainly rather than left to be inferred from a dashed line: the
          app never shows a path it does not have and call it a route. It rides
          the same insets the fit does, so on a map-first screen it lands in
          front of the student rather than behind a panel. */}
      {approximate && !failed && (
        <p
          className="type-caption-2 pointer-events-none absolute z-[400] px-3 py-1.5 text-[var(--label-secondary)]"
          style={{
            left: Math.max(left, 8),
            right: Math.max(right, 8),
            bottom: Math.max(bottom, 8),
            borderRadius: 'var(--radius-sm)',
            background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
          }}
        >
          Dashed lines join the stops. Nobody has traced the roads between them
          yet.
        </p>
      )}

      {failed && (
        <div
          className="absolute inset-0 grid place-items-center px-6 text-center"
          style={{ background: 'var(--bg-grouped-secondary)' }}
        >
          <p className="type-subheadline text-[var(--label-secondary)]">
            The map can&rsquo;t load right now. The steps beside it still have everything you need.
          </p>
        </div>
      )}
    </div>
  )
}

/** The leg's two stops, in Leaflet order, when both are known. */
function endpointsOf(leg: MapLeg): [number, number][] {
  const points: [number, number][] = []
  for (const point of [leg.from_point, leg.to_point]) {
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      points.push([point.lat, point.lng])
    }
  }
  return points
}

/** GeoJSON LineString, tolerated loosely because the geometry is crowdsourced. */
function coordinatesOf(geometry: unknown): [number, number][] {
  if (!geometry || typeof geometry !== 'object') return []
  const shape = geometry as { type?: string; coordinates?: unknown }
  if (shape.type !== 'LineString' || !Array.isArray(shape.coordinates)) return []

  return (shape.coordinates as unknown[])
    .filter(
      (point): point is [number, number] =>
        Array.isArray(point) && point.length >= 2 && point.every((n) => typeof n === 'number'),
    )
    // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
    .map(([lng, lat]) => [lat, lng] as [number, number])
}
