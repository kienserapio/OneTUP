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
  IconCommute,
  IconFare,
  IconRoute,
  IconCar,
  IconTrain,
  IconTricycle,
  IconWalk,
  IconWarning,
  type IconProps,
} from '@/components/ui/icon'
import { IconTile, type Tone } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
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

/**
 * Each mode as an icon tile. Walking has its own glyph; every vehicle shares
 * the bus until the icon set grows a train and a car, and the tone is what
 * tells them apart at a glance.
 */
const MODE_TILE: Record<string, { Icon: React.ComponentType<IconProps>; tone: Tone }> = {
  walk: { Icon: IconWalk, tone: 'gray' },
  jeep: { Icon: IconCommute, tone: 'crimson' },
  bus: { Icon: IconCommute, tone: 'blue' },
  uv_express: { Icon: IconCommute, tone: 'green' },
  rail: { Icon: IconTrain, tone: 'gray' },
  tricycle: { Icon: IconTricycle, tone: 'crimson' },
  taxi: { Icon: IconCar, tone: 'gray' },
  tnvs: { Icon: IconCar, tone: 'gray' },
}

const tileFor = (mode: string) => MODE_TILE[mode] ?? { Icon: IconCommute, tone: 'gray' as Tone }

/**
 * Whether a leg has a path someone actually traced. The same test the map uses
 * to decide between a solid line and a dashed one between the two stops — so
 * the list and the map always agree about which legs are approximate.
 */
function isTraced(geometry: unknown): boolean {
  if (!geometry || typeof geometry !== 'object') return false
  const shape = geometry as { type?: string; coordinates?: unknown }
  if (shape.type !== 'LineString' || !Array.isArray(shape.coordinates)) return false
  return (
    (shape.coordinates as unknown[]).filter(
      (point) =>
        Array.isArray(point) && point.length >= 2 && point.every((n) => typeof n === 'number'),
    ).length >= 2
  )
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
      className="card pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius-xl)] min-[900px]:h-full"
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
          className="mx-auto block h-[5px] w-10 rounded-[var(--radius-pill)]"
          style={{ background: 'var(--label-quaternary)' }}
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
            <div className="flex items-center justify-between gap-[var(--space-2)]">
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

            <ModeStrip legs={selected.legs} />

            <StatChips route={selected} />

            <div className="mt-[var(--space-3)] grid grid-cols-2 gap-[var(--space-2)]">
              <Button
                size="sm"
                variant={isDefault ? 'glass' : 'accent'}
                onClick={onMakeDefault}
                disabled={isDefault}
                className="col-span-2"
              >
                {isDefault ? 'Saved as your route' : 'Use for my wake-up plan'}
              </Button>
              <Button size="sm" onClick={onConfirm} leading={<IconCheck size={15} />}>
                I rode this
              </Button>
              <ButtonLink href="/commute/plan" size="sm">
                When to leave
              </ButtonLink>
            </div>
          </>
        ) : (
          <p className="type-subheadline font-semibold text-[var(--label-secondary)]">
            Pick a route below
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
            <div className="mt-[var(--space-5)] flex items-center gap-1.5 pb-[var(--space-3)]">
              <h3 className="type-section-header">The way there</h3>
              <InfoTip title="Where this comes from">
                Routes and fares come from students — confirm one after you ride it so the next
                person gets it right.
              </InfoTip>
            </div>
            <LegList legs={selected.legs} />

            <p className="type-caption-1 mt-[var(--space-4)] text-[var(--label-tertiary)]">
              {describeFreshness(selected.freshness)}
              {selected.verifiedCount > 0 &&
                ` · ${selected.verifiedCount} confirmation${selected.verifiedCount === 1 ? '' : 's'}`}
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
    /* The fare gets the wide column: it is the longest figure, and on a phone
       an even three-way split cut it to "₱26.5…". */
    <dl className="mt-[var(--space-3)] grid grid-cols-[0.9fr_1.5fr_0.8fr] gap-[var(--space-2)]">
      <Chip icon={<IconClock size={13} />} label="Time">
        {route.totalMinutes}
        <span className="type-footnote ml-0.5 text-[var(--label-secondary)]">min</span>
      </Chip>

      <Chip icon={<IconFare size={13} />} label="Student fare">
        {formatPeso(route.totalFareStudent)}
        {discounted && (
          <span className="type-data type-caption-1 ml-1.5 align-middle text-[var(--label-tertiary)] line-through">
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
    <div className="min-w-0 py-[var(--space-1)]">
      {/* Weight is inline because the type scale is unlayered CSS and
          therefore outranks anything in Tailwind's utilities. */}
      <dt
        className="type-caption-2 flex items-center gap-1 text-[var(--label-tertiary)]"
        style={{ fontWeight: 600 }}
      >
        <span className="shrink-0 text-[var(--tone-green)]">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="type-data type-title-3 mt-0.5 whitespace-nowrap">{children}</dd>
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
      className="block w-full rounded-[var(--radius-lg)] p-[var(--space-3)] text-left transition-transform duration-150 active:scale-[0.98]"
      style={{
        background: isSelected ? 'var(--tone-green-tint)' : 'var(--surface-sunken)',
        boxShadow: isSelected ? 'inset 0 0 0 2px var(--tone-green)' : 'none',
        transition: 'background-color var(--duration-fast) var(--ease-standard)',
      }}
    >
      {/* Time first, like a departures board: it is the number a student
          compares down the list. */}
      <div className="flex items-center gap-[var(--space-3)]">
        <span className="w-14 shrink-0">
          <span className="type-data block text-[1.375rem] font-bold leading-none tracking-[-0.02em]">
            {route.totalMinutes}
          </span>
          <span className="text-[0.6875rem] font-semibold text-[var(--label-tertiary)]">min</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="type-subheadline block truncate" style={{ fontWeight: 600 }}>
            {route.label ?? 'Route'}
          </span>
          <ModeStrip legs={route.legs} size={22} />
        </span>
      </div>

      <p className="type-data type-footnote mt-[var(--space-2)] pl-[4.25rem] text-[var(--label-secondary)]">
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
        <div className="mt-[var(--space-2)] flex flex-wrap items-center gap-1.5 pl-[4.25rem]">
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

/**
 * The legs as a timeline: each mode's tile, a dotted connector to the next,
 * and a dot in the same colour the polyline is drawn in so the list and the
 * map can be read against each other. A leg with no traced path is labelled
 * the way the map draws it — dashed, between the stops, not a claim about the
 * road.
 */
function LegList({ legs }: { legs: Leg[] }) {
  return (
    <ol className="list-none">
      {legs.map((leg, index) => {
        const last = index === legs.length - 1
        const { Icon, tone } = tileFor(leg.mode)
        const traced = isTraced(leg.geometry)
        return (
          <li key={leg.ordinal} className="flex gap-[var(--space-3)]">
            <span aria-hidden className="flex w-9 flex-none flex-col items-center">
              <span className="relative">
                <IconTile Icon={Icon} tone={tone} size={36} />
                <span
                  className="absolute -bottom-0.5 -right-0.5 block size-3 rounded-full"
                  style={{ background: legColor(index), boxShadow: '0 0 0 2px var(--bg)' }}
                />
              </span>
              {!last && (
                <span
                  className="my-1 block flex-1 border-l-2 border-dotted"
                  style={{ borderColor: 'var(--label-quaternary)' }}
                />
              )}
            </span>

            <div className={cx('min-w-0 flex-1 pt-1', last ? 'pb-0' : 'pb-[var(--space-4)]')}>
              <p className="type-subheadline">
                <span className="font-semibold">{MODE_LABEL[leg.mode] ?? leg.mode}</span>{' '}
                {leg.from_label} → {leg.to_label}
              </p>
              <p className="type-data type-footnote flex flex-wrap items-center gap-x-1.5 text-[var(--label-secondary)]">
                <span>{leg.duration_minutes} min</span>
                {leg.fare_regular > 0 && (
                  <span>
                    · {formatPeso(leg.fare_student)}
                    {leg.discount_applied && (
                      <span className="ml-1 text-[var(--label-tertiary)] line-through">
                        {formatPeso(leg.fare_regular)}
                      </span>
                    )}
                  </span>
                )}
                {!traced && (
                  <span
                    className="rounded-full px-2 py-px text-[0.6875rem] font-semibold"
                    style={{ background: 'var(--tone-crimson-tint)', color: 'var(--tone-crimson-ink)' }}
                  >
                    Approximate line
                  </span>
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

/** A route at a glance: the mode of each leg, in order, as small tiles. */
function ModeStrip({ legs, size = 26 }: { legs: Leg[]; size?: number }) {
  return (
    <span
      className="mt-1 flex flex-wrap items-center gap-1"
      aria-label={legs.map((leg) => MODE_LABEL[leg.mode] ?? leg.mode).join(', then ')}
      role="img"
    >
      {legs.map((leg, index) => {
        const { Icon, tone } = tileFor(leg.mode)
        return (
          <span key={leg.ordinal} className="flex items-center gap-1">
            {index > 0 && (
              <span
                aria-hidden
                className="block w-2 border-t-2 border-dotted"
                style={{ borderColor: 'var(--label-quaternary)' }}
              />
            )}
            <IconTile Icon={Icon} tone={tone} size={size} />
          </span>
        )
      })}
    </span>
  )
}
