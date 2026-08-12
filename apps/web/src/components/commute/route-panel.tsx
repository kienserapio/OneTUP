'use client'

import {
  describeFreshness,
  formatPeso,
  type Freshness,
  type RouteRank,
} from '@onetup/core'
import { legColor } from '@/components/map/leg-colors'
import { Button, ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/surfaces'
import {
  IconChevronDown,
  IconCheck,
  IconClock,
  IconFare,
  IconRoute,
  IconWarning,
} from '@/components/ui/icon'
import { cx } from '@/lib/cx'

/**
 * Everything the commute canvas floats over the map.
 *
 * The three things a student actually trades off — time, money, and how many
 * times they have to get on and off something — are chips at the top of the
 * panel, so the trade-off is read before anything is opened. The list below
 * re-ranks in place; ranking is a pure function over rows already in hand, so
 * switching it costs nothing and never refetches.
 *
 * Both fares are always shown. That is not decoration — it is how a student
 * notices when a discount is being denied to them at the door (ADR-011).
 *
 * On a phone this is a sheet with two heights: the summary and the actions are
 * always up, and the list and the leg-by-leg breakdown are what expanding
 * reveals. A panel that covered the map by default would undo the point of a
 * map-first screen.
 */

export interface Leg {
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

export interface RouteRow {
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
export type Route = RouteRow & { freshness: Freshness }

export const RANKS: { value: RouteRank; label: string }[] = [
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

const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: 'Confirmed recently',
  aging: 'Over a month old',
  stale: 'Over three months old',
  unverified: 'Never confirmed',
}

export interface RoutePanelProps {
  /** Already ranked by the caller. */
  routes: Route[]
  best: Record<RouteRank, Route | null>
  rank: RouteRank
  onRank: (rank: RouteRank) => void
  selected: Route | null
  defaultRouteId: string | null
  onSelect: (id: string) => void
  onConfirm: () => void
  onMakeDefault: () => void
  /** Only means anything below the shell breakpoint; the rail shows everything. */
  expanded: boolean
  onExpanded: (next: boolean) => void
}

export function RoutePanel({
  routes,
  best,
  rank,
  onRank,
  selected,
  defaultRouteId,
  onSelect,
  onConfirm,
  onMakeDefault,
  expanded,
  onExpanded,
}: RoutePanelProps) {
  const isDefault = selected != null && selected.id === defaultRouteId

  return (
    <section
      aria-label="Routes to campus"
      className="card squircle pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden min-[900px]:h-full"
      style={{ boxShadow: 'var(--shadow-float)' }}
    >
      {/* The grabber is the toggle. A phone reads that shape as "this sheet
          moves" before it reads any label, so the label rides along with it
          rather than being a separate control to find. */}
      <button
        type="button"
        onClick={() => onExpanded(!expanded)}
        aria-expanded={expanded}
        className="mobile-only flex w-full flex-col items-center px-[var(--space-4)] pb-[var(--space-1)] pt-[var(--space-2)]"
      >
        <span
          aria-hidden
          className="mx-auto block h-1 w-9 rounded-[var(--radius-pill)]"
          style={{ background: 'var(--fill-tertiary)' }}
        />
        <span className="type-caption-1 mt-[var(--space-2)] flex w-full items-center justify-center gap-[var(--space-1)] text-[var(--label-secondary)]">
          {expanded
            ? 'Hide the details'
            : routes.length > 1
              ? `All ${routes.length} ways and the stops`
              : 'The stops on the way'}
          <IconChevronDown
            size={14}
            style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
          />
        </span>
      </button>

      <header className="px-[var(--space-4)] pb-[var(--space-3)] pt-[var(--space-3)]">
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-[var(--space-2)]">
              <h2 className="type-headline min-w-0 flex-1 truncate">
                {selected.label ?? 'Route'}
              </h2>
              <Badge tone={selected.freshness === 'fresh' ? 'verified' : 'stale'}>
                {(selected.freshness === 'stale' || selected.freshness === 'unverified') && (
                  <IconWarning size={11} />
                )}
                {FRESHNESS_LABEL[selected.freshness]}
              </Badge>
            </div>

            <StatChips route={selected} />

            <div className="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
              <Button size="sm" onClick={onConfirm} leading={<IconCheck size={15} />}>
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
              <ButtonLink href="/commute/plan" variant="plain" size="sm">
                When to leave
              </ButtonLink>
            </div>
          </>
        ) : (
          <p className="type-subheadline text-[var(--label-secondary)]">
            Pick a route below and it draws on the map.
          </p>
        )}
      </header>

      <div
        className={cx(
          'min-h-0 overflow-y-auto overscroll-contain px-[var(--space-4)] pb-[var(--space-4)]',
          'max-h-[46dvh] min-[900px]:max-h-none min-[900px]:flex-1',
          // Collapsed is a phone state only: above the breakpoint the rail has
          // the height to show the whole thing and nothing to gain by hiding it.
          !expanded && 'hidden min-[900px]:block',
        )}
        style={{ borderTop: '1px solid var(--separator)' }}
      >
        {routes.length > 1 && (
          <div
            className="segmented my-[var(--space-3)] flex w-full"
            role="group"
            aria-label="Rank routes by"
          >
            {RANKS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                aria-pressed={rank === entry.value}
                data-selected={rank === entry.value}
                onClick={() => onRank(entry.value)}
                className="segmented-item flex-1"
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}

        <ul className="mt-[var(--space-3)] flex list-none flex-col gap-[var(--space-2)]">
          {routes.map((route) => (
            <li key={route.id}>
              <RouteCard
                route={route}
                // With one route on file every claim is trivially true, so the
                // badges would say nothing.
                claims={routes.length > 1 ? claimsFor(route, best) : []}
                isSelected={route.id === selected?.id}
                isDefault={route.id === defaultRouteId}
                onSelect={() => onSelect(route.id)}
              />
            </li>
          ))}
        </ul>

        {selected && (
          <>
            <h3 className="type-section-header mt-[var(--space-5)] pb-[var(--space-2)]">
              The way there
            </h3>
            <LegList legs={selected.legs} />

            <p className="type-caption-1 mt-[var(--space-3)] text-[var(--label-tertiary)]">
              {describeFreshness(selected.freshness)}
              {selected.verifiedCount > 0 &&
                ` · ${selected.verifiedCount} confirmation${selected.verifiedCount === 1 ? '' : 's'}`}
              . Routes and fares come from students — confirm one after you ride it so the next
              person gets it right.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

/**
 * The headline numbers, sized to be read from arm's length. Fare is the one
 * that carries two values, because the struck-through price beside the student
 * one is what a student holds up at the door.
 */
function StatChips({ route }: { route: Route }) {
  const discounted = route.totalFareRegular > route.totalFareStudent

  return (
    <dl className="mt-[var(--space-3)] grid grid-cols-3 gap-[var(--space-2)]">
      <Chip icon={<IconClock size={13} />} label="Time">
        {route.totalMinutes}
        <span className="type-footnote ml-0.5 text-[var(--label-secondary)]">min</span>
      </Chip>

      <Chip icon={<IconFare size={13} />} label="Student fare">
        {formatPeso(route.totalFareStudent)}
        {discounted && (
          <span className="type-data type-caption-1 ml-1 align-middle text-[var(--label-tertiary)] line-through">
            {formatPeso(route.totalFareRegular)}
          </span>
        )}
      </Chip>

      <Chip icon={<IconRoute size={13} />} label="Rides">
        {route.transfers}
      </Chip>
    </dl>
  )
}

function Chip({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      className="min-w-0 rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)]"
      style={{ background: 'var(--surface-sunken)', border: '1px solid var(--separator)' }}
    >
      {/* Weight and tracking are inline because the type scale is unlayered CSS
          and therefore outranks anything in Tailwind's utilities. */}
      <dt
        className="type-caption-2 flex items-center gap-1 uppercase text-[var(--label-tertiary)]"
        style={{ fontWeight: 600, letterSpacing: '0.06em' }}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="type-data type-title-3 mt-0.5 truncate">{children}</dd>
    </div>
  )
}

function claimsFor(route: Route, best: Record<RouteRank, Route | null>): { label: string }[] {
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

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className="squircle block w-full rounded-[var(--radius-sm)] p-[var(--space-3)] text-left"
      style={{
        background: isSelected ? 'var(--accent-subtle)' : 'var(--surface-sunken)',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--separator)'}`,
        transition: 'border-color var(--duration-fast) var(--ease-standard)',
      }}
    >
      <div className="flex items-baseline gap-[var(--space-2)]">
        <span className="type-subheadline min-w-0 flex-1 truncate" style={{ fontWeight: 600 }}>
          {route.label ?? 'Route'}
        </span>
        <span className="type-data type-subheadline shrink-0">{route.totalMinutes} min</span>
      </div>

      <p className="type-data type-footnote mt-0.5 text-[var(--label-secondary)]">
        {formatPeso(route.totalFareStudent)}
        {discounted && (
          <span className="ml-1 text-[var(--label-tertiary)] line-through">
            {formatPeso(route.totalFareRegular)}
          </span>
        )}
        {' · '}
        {route.transfers} ride{route.transfers === 1 ? '' : 's'}
      </p>

      {(claims.length > 0 || isDefault) && (
        <div className="mt-[var(--space-2)] flex flex-wrap items-center gap-1.5">
          {claims.map((claim) => (
            <Badge key={claim.label} tone="official">
              {claim.label}
            </Badge>
          ))}
          {isDefault && <Badge tone="verified">Your route</Badge>}
        </div>
      )}
    </button>
  )
}

/** The legs, dotted in the same colours the polylines are drawn in. */
function LegList({ legs }: { legs: Leg[] }) {
  return (
    <ol className="list-none">
      {legs.map((leg, index) => {
        const last = index === legs.length - 1
        return (
          <li key={leg.ordinal} className="flex gap-[var(--space-3)]">
            <span aria-hidden className="flex w-3 flex-none flex-col items-center">
              <span
                className="mt-1.5 block size-3 flex-none rounded-full"
                style={{ background: legColor(index) }}
              />
              {!last && (
                <span className="block w-[2px] flex-1" style={{ background: 'var(--separator)' }} />
              )}
            </span>

            <div className={cx('min-w-0 flex-1', last ? 'pb-0' : 'pb-[var(--space-4)]')}>
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
  )
}
