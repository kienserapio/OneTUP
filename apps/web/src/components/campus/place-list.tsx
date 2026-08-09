'use client'

import type { CampusPlace } from '@onetup/core'
import { describeFreshness, formatPeso, freshnessOf } from '@onetup/core'
import { Badge, ListGroup } from '@/components/ui/surfaces'

/**
 * The list of places.
 *
 * It is not a fallback for the map — it is the other half of it. A map answers
 * "where", a list answers "what is there and is it open", and on a 320px screen
 * the list is usually the faster of the two. It is also the only part of this
 * screen a screen reader or a keyboard can work with, which is why selecting a
 * place happens here and the map follows.
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
  onSelect: (id: string) => void
}) {
  // Rows are siblings rather than list items on purpose: the inset hairline
  // between them is drawn by an adjacent-sibling rule, and wrapping each row in
  // an <li> silently removes every separator.
  return (
    <ListGroup>
      {places.map((place) => (
        <PlaceRow
          key={place.id}
          place={place}
          selected={place.id === selectedId}
          onSelect={() => onSelect(place.id)}
        />
      ))}
    </ListGroup>
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

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="list-row"
      // `.list-row` is unlayered CSS and therefore outranks every Tailwind
      // utility; alignment and the selected tint have to be set inline to land.
      style={{
        alignItems: 'flex-start',
        paddingBlock: 'var(--space-3)',
        background: selected ? 'var(--accent-subtle)' : undefined,
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="type-headline block">{place.name}</span>

        <span className="type-caption-1 mt-[2px] block" style={{ color: 'var(--label)' }}>
          {meta.join(' · ')}
        </span>

        {place.description && (
          <span className="type-subheadline mt-[var(--space-2)] block">{place.description}</span>
        )}

        {showTrading && (
          <span className="mt-[var(--space-2)] flex flex-wrap items-center gap-[var(--space-2)]">
            {price ? (
              <span className="type-data type-footnote">{price}</span>
            ) : (
              // Nobody has told us, so nobody is told a number. An invented
              // price is worse than no price (PRD §8.5).
              <Badge tone="stale">Price not confirmed yet</Badge>
            )}
            {hours.length > 0 ? (
              hours.map((line) => (
                <span key={line} className="type-footnote">
                  {line}
                </span>
              ))
            ) : (
              <Badge tone="stale">Hours not confirmed yet</Badge>
            )}
          </span>
        )}

        {place.contact_phone && (
          <span className="type-footnote type-data mt-[var(--space-2)] block">
            {place.contact_phone}
          </span>
        )}

        {(price || hours.length > 0) && (
          <span className="type-caption-1 mt-[var(--space-2)] block">
            {describeFreshness(freshnessOf(place.last_verified_at))}
          </span>
        )}
      </span>
    </button>
  )
}
