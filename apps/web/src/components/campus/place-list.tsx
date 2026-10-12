'use client'

import type { CampusPlace } from '@onetup/core'
import { describeFreshness, formatPeso, freshnessOf } from '@onetup/core'
import { RowList, RowPill } from '@/components/ui/row'
import {
  IconCampus,
  IconCoin,
  IconDocs,
  IconInfo,
  IconMap,
  IconRoute,
  IconSubjects,
} from '@/components/ui/icon'

/**
 * The list of places.
 *
 * It is the other half of the tour. A 360° scene answers "what does it look
 * like"; a list answers "what is there, what does it cost and is it open" —
 * and on a 320px screen the list is usually the faster of the two. It is also
 * the part a screen reader and a keyboard can actually work with, which is why
 * choosing a place happens here and the tour follows.
 */

export const CATEGORY_LABEL: Record<string, string> = {
  building: 'Building',
  gate: 'Gate',
  printing: 'Printing',
  food: 'Food',
  study: 'Study spot',
  service: 'Service',
  landmark: 'Landmark',
}

/* A bare gray glyph per kind of place. Not a colour per category: the page keeps
 * crimson for the place you are standing at. */
const CATEGORY_ICON: Record<string, typeof IconMap> = {
  building: IconCampus,
  gate: IconRoute,
  printing: IconDocs,
  food: IconCoin,
  study: IconSubjects,
  service: IconInfo,
  landmark: IconMap,
}

const DAY_LABEL: Record<string, string> = {
  mon_fri: 'Mon–Fri',
  mon_sat: 'Mon–Sat',
  mon_thu: 'Mon–Thu',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  daily: 'Daily',
  sat: 'Sat',
  sun: 'Sun',
}

const UNIT_LABEL: Record<string, string> = {
  per_page: 'per page',
  per_hour: 'per hour',
  per_item: 'per item',
  per_copy: 'per copy',
}

/** `{ "mon_fri": "07:00-19:00" }` — the shape the API spec publishes. Anything
 * else is shown as it was stored rather than guessed at. */
export function formatHours(hours: unknown): string[] {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return []
  return Object.entries(hours as Record<string, unknown>)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => {
      const label = DAY_LABEL[key] ?? key.replace(/_/g, ' ')
      return `${label} ${String(value).replace('-', '–')}`
    })
}

export function formatPrice(place: CampusPlace): string | null {
  const { price_min: min, price_max: max, price_unit: unit } = place
  if (min == null && max == null) return null
  const unitLabel = unit ? (UNIT_LABEL[unit] ?? unit.replace(/_/g, ' ')) : null
  const amount =
    min != null && max != null && min !== max
      ? `${formatPeso(min)}–${formatPeso(max)}`
      : formatPeso((min ?? max) as number)
  return unitLabel ? `${amount} ${unitLabel}` : amount
}

/** Categories where a student is asking a question money and opening hours are
 * the answer to. */
function wantsPriceAndHours(category: string): boolean {
  return category === 'printing' || category === 'food'
}

export function PlaceList({
  places,
  selectedId,
  onSelect,
}: {
  places: CampusPlace[]
  selectedId: string | null
  onSelect: (place: CampusPlace) => void
}) {
  return (
    <RowList label="Places">
      {places.map((place) => (
        <PlaceRow
          key={place.id}
          place={place}
          selected={place.id === selectedId}
          onSelect={() => onSelect(place)}
        />
      ))}
    </RowList>
  )
}

function PlaceRow({
  place,
  selected,
  onSelect,
}: {
  place: CampusPlace
  selected: boolean
  onSelect: () => void
}) {
  const meta = [
    CATEGORY_LABEL[place.category] ?? place.category,
    place.building_code,
    place.floor ? `Floor ${place.floor}` : null,
    place.room_range_start && place.room_range_end
      ? `Rooms ${place.room_range_start}–${place.room_range_end}`
      : null,
  ].filter(Boolean)

  const price = formatPrice(place)
  const hours = formatHours(place.hours)
  const showTrading = wantsPriceAndHours(place.category)

  // Only a place with a scene has anywhere to go, so only that one is a
  // control. A button that does nothing when pressed is worse than plain text.
  const walkable = Boolean(place.tour_scene_url)

  const Icon = CATEGORY_ICON[place.category] ?? IconMap
  const classes = selected ? 'row campus-row-selected' : 'row'

  const body = (
    <>
      <span className="row-leading">
        <Icon size={22} className="campus-row-icon" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="row-title !whitespace-normal">{place.name}</span>
        <span className="row-detail !whitespace-normal">{meta.join(' · ')}</span>

        {place.description && <span className="campus-place-desc">{place.description}</span>}

        <span className="row-meta">
          {place.tour_scene_url && <RowPill tone="blue">In the tour</RowPill>}

          {showTrading &&
            (price ? (
              <RowPill>{price}</RowPill>
            ) : (
              // Nobody has told us, so nobody is told a number. An invented
              // price is worse than no price (PRD §8.5).
              <RowPill>Price not confirmed yet</RowPill>
            ))}
          {showTrading &&
            (hours.length > 0 ? (
              hours.map((line) => <RowPill key={line}>{line}</RowPill>)
            ) : (
              <RowPill>Hours not confirmed yet</RowPill>
            ))}

          {place.contact_phone && <RowPill>{place.contact_phone}</RowPill>}
        </span>

        {(price || hours.length > 0) && (
          <span className="campus-place-desc !mt-1.5 !text-[0.75rem] !text-[var(--label-tertiary)]">
            {describeFreshness(freshnessOf(place.last_verified_at))}
          </span>
        )}
      </span>
    </>
  )

  if (!walkable) {
    return (
      <li className="list-none">
        <div className={classes} style={{ alignItems: 'flex-start' }}>
          {body}
        </div>
      </li>
    )
  }

  return (
    <li className="list-none">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`${classes} row-interactive`}
        style={{ alignItems: 'flex-start' }}
      >
        {body}
      </button>
    </li>
  )
}
