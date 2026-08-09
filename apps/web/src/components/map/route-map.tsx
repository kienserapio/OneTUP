'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Polyline } from 'leaflet'
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

export interface MapLeg {
  ordinal: number
  mode: string
  from_label: string
  to_label: string
  geometry: unknown
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
    })()

    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (!map.current || legs.length === 0) return

    void (async () => {
      const L = await import('leaflet')
      const instance = map.current
      if (!instance) return

      const drawn: Polyline[] = []
      const bounds = L.latLngBounds([])

      legs.forEach((leg, index) => {
        const coordinates = coordinatesOf(leg.geometry)
        if (coordinates.length < 2) return

        const line = L.polyline(coordinates, {
          color: LEG_COLORS[index % LEG_COLORS.length],
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
        })
          .addTo(instance)
          .bindTooltip(`${index + 1}. ${leg.from_label} → ${leg.to_label}`, { sticky: true })

        drawn.push(line)
        coordinates.forEach((point) => bounds.extend(point))
      })

      if (bounds.isValid()) instance.fitBounds(bounds, { padding: [28, 28] })

      return () => drawn.forEach((line) => line.remove())
    })()
  }, [legs])

  return (
    <div className={cx('relative overflow-hidden rounded-[var(--radius-lg)]', className)}>
      <div ref={container} style={{ height }} className="w-full" role="presentation" />

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
