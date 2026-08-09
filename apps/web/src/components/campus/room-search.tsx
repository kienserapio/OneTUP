'use client'

import { useId, useState } from 'react'
import { motion } from 'motion/react'
import type { CampusPlace } from '@onetup/core'
import { spring, transition } from '@/design/motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/surfaces'

/**
 * Room lookup.
 *
 * The question a first-year asks on day one is "where is 312", and the honest
 * answer has a strength attached: a room recorded exactly is a different claim
 * from a room that falls inside a range someone typed in, which is different
 * again from a digit that happens to match. All three are answered; which one
 * was found is shown rather than flattened into one confident sentence.
 *
 * It asks `/api/campus/rooms/:number` first, because that route is the public
 * contract and it may know more than this page was given. When that answer does
 * not arrive — offline, or a signed-out visitor whose request the session
 * middleware bounces to the sign-in page — the same match runs against the
 * places already rendered into this page, which is why the search still works
 * with no account and no connection. The two implementations agree by
 * construction: same three passes, same order.
 *
 * Where the building it lands on has a 360° scene, the answer offers to walk
 * you there. "Third floor of the CAFA building" means very little to someone who
 * has never seen the CAFA building.
 */

export interface RoomAnswer {
  room: string
  building: { code: string | null; name: string }
  floor: string | null
  nearest_gate: { name: string; walk_minutes: number } | null
  confidence: 'exact' | 'range_match' | 'prefix_guess'
}

const CONFIDENCE_NOTE: Record<RoomAnswer['confidence'], string> = {
  exact: 'Recorded for this building',
  range_match: 'Falls inside a room range a student recorded',
  prefix_guess: 'A guess from the room number — worth checking at the gate',
}

type State =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'found'; answer: RoomAnswer; place: CampusPlace | null }
  | { kind: 'missing'; message: string }

/* --- The same three passes the route makes -------------------------------- */

function asInteger(value: string | null | undefined): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function sharedPrefixLength(a: string, b: string): number {
  let index = 0
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1
  return index
}

function metresBetween(a: CampusPlace, b: CampusPlace): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng) * Math.cos(toRad((a.lat + b.lat) / 2))
  return Math.hypot(dLat, dLng) * 6_371_000
}

export function matchRoomLocally(
  room: string,
  places: CampusPlace[],
): { answer: RoomAnswer; place: CampusPlace } | null {
  const target = room.trim().toUpperCase()
  if (!target) return null

  const bearing = places.filter(
    (place) => place.room_range_start || place.room_range_end || place.building_code,
  )

  let found: { place: CampusPlace; confidence: RoomAnswer['confidence'] } | null = null

  const exact = bearing.find(
    (place) =>
      place.room_range_start?.trim().toUpperCase() === target ||
      place.room_range_end?.trim().toUpperCase() === target ||
      place.building_code?.trim().toUpperCase() === target,
  )
  if (exact) found = { place: exact, confidence: 'exact' }

  if (!found) {
    const targetNumber = asInteger(target)
    if (targetNumber !== null) {
      const contained = bearing.find((place) => {
        const start = asInteger(place.room_range_start)
        const end = asInteger(place.room_range_end)
        if (start === null || end === null) return false
        return targetNumber >= Math.min(start, end) && targetNumber <= Math.max(start, end)
      })
      if (contained) found = { place: contained, confidence: 'range_match' }
    }
  }

  if (!found) {
    let best: { place: CampusPlace; score: number } | null = null
    for (const place of bearing) {
      for (const candidate of [place.building_code, place.room_range_start, place.room_range_end]) {
        if (!candidate) continue
        const score = sharedPrefixLength(target, candidate.trim().toUpperCase())
        if (score > 0 && (!best || score > best.score)) best = { place, score }
      }
    }
    if (best) found = { place: best.place, confidence: 'prefix_guess' }
  }

  if (!found) return null

  const gates = places.filter((place) => place.category === 'gate')
  const nearest = gates.reduce<{ place: CampusPlace; metres: number } | null>((best, gate) => {
    const metres = metresBetween(found!.place, gate)
    return !best || metres < best.metres ? { place: gate, metres } : best
  }, null)

  return {
    place: found.place,
    answer: {
      room,
      building: { code: found.place.building_code, name: found.place.name },
      floor: found.place.floor ?? (/^\d{3,}$/.test(room) ? room[0] : null),
      nearest_gate: nearest
        ? {
            name: nearest.place.name,
            walk_minutes: Math.max(1, Math.round(nearest.metres / 75)),
          }
        : null,
      confidence: found.confidence,
    },
  }
}

function looksLikeAnswer(value: unknown): value is RoomAnswer {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RoomAnswer>
  return (
    typeof candidate.room === 'string' &&
    typeof candidate.confidence === 'string' &&
    typeof candidate.building?.name === 'string'
  )
}

/* --- The control ---------------------------------------------------------- */

export function RoomSearch({
  places,
  onOpenScene,
}: {
  places: CampusPlace[]
  /** Offered only when the building the room is in has a scene in the tour. */
  onOpenScene?: (place: CampusPlace) => void
}) {
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function search(event: React.FormEvent) {
    event.preventDefault()
    const room = query.trim()
    if (!room) return

    setState({ kind: 'searching' })

    const remote = await fetch(`/api/campus/rooms/${encodeURIComponent(room)}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)

    if (looksLikeAnswer(remote)) {
      const match = places.find((place) => place.name === remote.building.name) ?? null
      setState({ kind: 'found', answer: remote, place: match })
      return
    }

    const local = matchRoomLocally(room, places)
    if (local) {
      setState({ kind: 'found', answer: local.answer, place: local.place })
      return
    }

    setState({
      kind: 'missing',
      message: `No building has claimed room ${room} yet. Room ranges come from students, so this fills in as people add them.`,
    })
  }

  return (
    <section aria-labelledby={`${inputId}-label`}>
      <form onSubmit={search} className="flex flex-col gap-[var(--space-2)]">
        <label id={`${inputId}-label`} htmlFor={inputId} className="type-section-header">
          Room number
        </label>
        <div className="flex gap-[var(--space-2)]">
          <input
            id={inputId}
            name="room"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            inputMode="text"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Room number, like 312"
            className="field flex-1"
          />
          <Button
            type="submit"
            variant="accent"
            disabled={query.trim().length === 0 || state.kind === 'searching'}
          >
            {state.kind === 'searching' ? 'Looking' : 'Find'}
          </Button>
        </div>
      </form>

      <div aria-live="polite">
        {state.kind === 'found' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition(spring.snap)}
            className="card squircle mt-[var(--space-3)] p-[var(--space-4)]"
          >
            <p className="type-section-header" style={{ color: 'var(--label)' }}>
              Room {state.answer.room}
            </p>
            <p className="type-title-3 mt-[var(--space-1)]">
              {state.answer.building.name}
              {state.answer.building.code ? ` · ${state.answer.building.code}` : ''}
            </p>

            <dl className="mt-[var(--space-3)] flex flex-col gap-[var(--space-2)]">
              <div className="flex gap-[var(--space-2)]">
                <dt className="type-footnote w-[7.5rem] shrink-0">Floor</dt>
                <dd className="type-footnote type-data">{state.answer.floor ?? 'Not recorded'}</dd>
              </div>
              <div className="flex gap-[var(--space-2)]">
                <dt className="type-footnote w-[7.5rem] shrink-0">Nearest gate</dt>
                <dd className="type-footnote">
                  {state.answer.nearest_gate
                    ? `${state.answer.nearest_gate.name} · about ${state.answer.nearest_gate.walk_minutes} min walk`
                    : 'No gate recorded yet'}
                </dd>
              </div>
            </dl>

            <p className="mt-[var(--space-3)]">
              <Badge tone={state.answer.confidence === 'exact' ? 'verified' : 'stale'}>
                {CONFIDENCE_NOTE[state.answer.confidence]}
              </Badge>
            </p>

            {onOpenScene && state.place?.tour_scene_url && (
              <p className="mt-[var(--space-3)]">
                <Button
                  variant="accent"
                  onClick={() => {
                    if (state.place) onOpenScene(state.place)
                  }}
                >
                  Walk to {state.answer.building.name}
                </Button>
              </p>
            )}
          </motion.div>
        )}

        {state.kind === 'missing' && (
          <div
            className="mt-[var(--space-3)] rounded-[var(--radius-md)] p-[var(--space-4)]"
            style={{ background: 'var(--fill-quaternary)' }}
          >
            <p className="type-subheadline">{state.message}</p>
          </div>
        )}
      </div>
    </section>
  )
}
