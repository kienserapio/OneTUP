'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'

/**
 * The map itself.
 *
 * Loaded only through `next/dynamic` with `ssr: false`, because Leaflet touches
 * `window` at import time and because nobody reading the landing page should
 * pay to download a mapping library.
 *
 * Two deliberate restraints:
 *
 * 1. Markers are neutral. A campus map is not a status display, and painting
 *    seven categories in seven saturated colours would spend the one colour
 *    this product reserves for meaning. Category is expressed by the filter and
 *    the list; the map expresses only "here", "you picked this one", and — in
 *    the one case where colour is genuinely information — "this is where you go
 *    when something is wrong".
 * 2. Every path colour, radius and surface comes from a token, applied through
 *    a stylesheet rather than through Leaflet's inline path attributes, so the
 *    map follows the theme the way the rest of the app does.
 */

export interface MapPlace {
  id: string
  name: string
  lat: number
  lng: number
  category: string
  description: string | null
  is_emergency: boolean
}

export interface CampusMapProps {
  places: MapPlace[]
  center: [number, number]
  zoom: number
  selectedId: string | null
  onSelect: (id: string) => void
  /** Called once when it is clear the tiles are not going to arrive. */
  onTilesUnavailable: () => void
}

const STYLES = `
.campus-map.leaflet-container {
  height: 100%;
  width: 100%;
  background: var(--bg-grouped-tertiary);
  font-family: var(--font-text);
  outline-offset: 3px;
}

/* OSM's raster tiles are drawn for a white page. Dimming beats inverting:
   an inverted map is unreadable to anyone who knows the real one. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .campus-map .leaflet-tile {
    filter: brightness(0.7) contrast(1.06) saturate(0.8);
  }
}
[data-theme='dark'] .campus-map .leaflet-tile {
  filter: brightness(0.7) contrast(1.06) saturate(0.8);
}

.campus-pin {
  fill: var(--label);
  fill-opacity: 0.82;
  stroke: var(--bg-grouped-secondary);
  stroke-width: 2.5;
}
.campus-pin-emergency {
  fill: var(--danger);
  fill-opacity: 0.92;
}
.campus-pin-selected {
  fill: var(--accent);
  fill-opacity: 1;
  stroke-width: 3;
}

.campus-map .leaflet-popup-content-wrapper {
  background: var(--bg-grouped-secondary);
  color: var(--label);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-float);
}
.campus-map .leaflet-popup-tip {
  background: var(--bg-grouped-secondary);
  box-shadow: none;
}
.campus-map .leaflet-popup-content {
  margin: var(--space-3) var(--space-4);
}
.campus-map .leaflet-popup-close-button {
  color: var(--label-secondary);
  width: var(--target-min);
  height: var(--target-min);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

/* The tile terms require the attribution to stay legible, so it gets a real
   material rather than a translucent afterthought. */
.campus-map .leaflet-control-attribution {
  background: var(--material-thick);
  -webkit-backdrop-filter: blur(var(--material-blur-small));
  backdrop-filter: blur(var(--material-blur-small));
  color: var(--label-secondary);
  font-family: var(--font-text);
  font-size: 0.6875rem;
  padding: 2px var(--space-2);
  border-top-left-radius: var(--radius-xs);
}
.campus-map .leaflet-control-attribution a {
  color: var(--label);
  text-decoration: underline;
}

.campus-map .leaflet-bar,
.campus-map .leaflet-bar a {
  background: var(--material-thick);
  color: var(--label);
  border-color: var(--material-hairline);
}
.campus-map .leaflet-bar a:hover {
  background: var(--fill-quaternary);
}
`

/** Keeps the viewport with the selection made in the list beside it. */
function PanTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.setView(target, Math.max(map.getZoom(), 18), { animate: !reduce })
  }, [map, target])
  return null
}

export default function CampusMap({
  places,
  center,
  zoom,
  selectedId,
  onSelect,
  onTilesUnavailable,
}: CampusMapProps) {
  const loadedOnce = useRef(false)
  const failures = useRef(0)
  const reported = useRef(false)
  const report = useRef(() => {})

  report.current = () => {
    if (reported.current || loadedOnce.current) return
    reported.current = true
    onTilesUnavailable()
  }

  useEffect(() => {
    // A tile server that never answers produces no error event at all, so the
    // silence has to be given a deadline of its own.
    const timer = setTimeout(() => report.current(), 9000)
    return () => clearTimeout(timer)
  }, [])

  const selected = places.find((place) => place.id === selectedId) ?? null

  return (
    <>
      <style href="onetup-campus-map" precedence="default">
        {STYLES}
      </style>

      <MapContainer
        className="campus-map"
        center={center}
        zoom={zoom}
        // A finger dragging past the map should scroll the page, not pan; the
        // wheel belongs to the page for the same reason.
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
          eventHandlers={{
            tileload: () => {
              loadedOnce.current = true
            },
            tileerror: () => {
              failures.current += 1
              if (failures.current >= 4) report.current()
            },
          }}
        />

        {places.map((place) => {
          const isSelected = place.id === selectedId
          return (
            <CircleMarker
              key={place.id}
              center={[place.lat, place.lng]}
              radius={isSelected ? 11 : 7}
              pathOptions={{
                className: [
                  'campus-pin',
                  place.is_emergency && 'campus-pin-emergency',
                  isSelected && 'campus-pin-selected',
                ]
                  .filter(Boolean)
                  .join(' '),
              }}
              eventHandlers={{ click: () => onSelect(place.id) }}
            >
              <Popup>
                <span className="type-headline block">{place.name}</span>
                {place.description && (
                  <span className="type-footnote mt-1 block">{place.description}</span>
                )}
              </Popup>
            </CircleMarker>
          )
        })}

        <PanTo target={selected ? [selected.lat, selected.lng] : null} />
      </MapContainer>
    </>
  )
}
