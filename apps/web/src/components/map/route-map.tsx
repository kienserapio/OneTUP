'use client'

import { useEffect, useRef, useState } from 'react'
import type { Layer, Map as LeafletMap } from 'leaflet'
import { cx } from '@/lib/cx'

/**
 * The map.
 *
 * Leaflet is imported at runtime rather than bundled, because it and its CSS
 * are the single largest thing this app could ship and most sessions never open
 * a map at all (NFR-P6).
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

export interface RouteMapProps {
  legs: MapLeg[]
  className?: string
  height?: number
}

/** Distinct per leg, drawn from the iOS system palette already in the tokens. */
const LEG_COLORS = [
  'var(--ios-blue)',
  'var(--ios-orange)',
  'var(--ios-green)',
  'var(--ios-purple)',
  'var(--ios-teal)',
  'var(--ios-pink)',
]

const TUP = { lat: 14.5876, lng: 120.9847 }

export function RouteMap({ legs, className, height = 280 }: RouteMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [approximate, setApproximate] = useState(false)
  // The ready map is state, not just the ref, because Leaflet is imported at
  // runtime and the legs are always in hand before it lands. A ref cannot wake
  // the drawing effect, so keying off one alone left the map permanently blank.
  const [ready, setReady] = useState<LeafletMap | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !container.current || map.current) return

      const instance = L.map(container.current, {
        center: [TUP.lat, TUP.lng],
        zoom: 13,
        zoomControl: true,
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

  useEffect(() => {
    if (!ready || legs.length === 0) return

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

      legs.forEach((leg, index) => {
        const color = LEG_COLORS[index % LEG_COLORS.length]
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

      if (bounds.isValid()) instance.fitBounds(bounds, { padding: [28, 28] })
      if (!cancelled) setApproximate(approximated)
    })()

    return () => {
      cancelled = true
      drawn.forEach((layer) => layer.remove())
    }
  }, [ready, legs])

  return (
    <div className={cx('relative overflow-hidden rounded-[var(--radius-lg)]', className)}>
      <div ref={container} style={{ height }} className="w-full" role="presentation" />

      {/* Said plainly rather than left to be inferred from a dashed line: the
          app never shows a path it does not have and call it a route. */}
      {approximate && !failed && (
        <p
          className="type-caption-2 absolute inset-x-0 bottom-0 z-[400] px-3 py-1.5 text-[var(--label-secondary)]"
          style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)' }}
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
            The map can&rsquo;t load right now. The steps below still have everything you need.
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
