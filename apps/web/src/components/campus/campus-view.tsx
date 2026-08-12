'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import type { CampusPlace } from '@onetup/core'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import { Badge, Card, EmptyState, ListGroup } from '@/components/ui/surfaces'
import { IconCampus, IconClose, IconWarning } from '@/components/ui/icon'
import { RoomSearch } from './room-search'
import { CATEGORY_LABEL, PlaceList } from './place-list'
import { ScenePicker, type SceneOption } from './scene-picker'
import { CorrectionForm, CorrectionSignedOut } from './correction-form'

/**
 * `/campus` — the campus, as one thing.
 *
 * There is no separate map. The 3D tour *is* the campus map: TUPniverse's 360°
 * capture, hosted on Panoee, filling the viewport with everything else floating
 * over it. A student who has never been to the building does not want a dot on
 * a street plan, they want to see the door they are looking for.
 *
 * No account, no sign-in wall, no "continue in the app". A visitor might be a
 * parent on enrolment day standing at the wrong gate, and the whole value of
 * this screen is that it answers them before they would ever have made an
 * account (ADR-012).
 *
 * Three restraints hold the layout together:
 *
 * 1. The frame owns the screen; every control is a floating pill or a card that
 *    can be dismissed, so nothing permanently covers the thing you came to see.
 * 2. The overlay is written before the frame in the DOM, so a keyboard reaches
 *    the controls without first having to tab through a third-party viewer.
 * 3. Everything that matters when something is wrong — gates, guards, phone
 *    numbers — is in the page's own HTML, so it survives the tour not loading
 *    at all.
 */

type PanelKey = 'room' | 'places' | 'help' | 'fix'

const PANEL_TITLE: Record<PanelKey, string> = {
  room: 'Find a room',
  places: 'Everything on campus',
  help: 'If something goes wrong',
  fix: 'Suggest a correction',
}

/* Shorter than the panel titles, because these have to survive a 320px screen
 * without the row turning into a scroll nobody notices. */
const TOOL_LABEL: Record<PanelKey, string> = {
  room: 'Find a room',
  places: 'Places',
  help: 'Emergency',
  fix: 'Fix a detail',
}

const CATEGORY_ORDER = [
  'building',
  'gate',
  'printing',
  'food',
  'study',
  'service',
  'landmark',
] as const

/* There is exactly one of these on the page, so the ids can be literals — which
 * is what lets a pill hand focus back to itself after the panel it opened
 * closes. The panel sits above the pills, and therefore before them in the DOM,
 * so tabbing on from a pill would walk past it: focus in and out of a panel is
 * moved deliberately rather than left to document order. */
const PANEL_ID = 'campus-panel'
const toolId = (key: PanelKey) => `campus-tool-${key}`

export function CampusView({
  places,
  loadFailed,
  signedIn,
  tourBaseUrl,
  startScene,
}: {
  places: CampusPlace[]
  loadFailed: boolean
  signedIn: boolean
  /** `NEXT_PUBLIC_CAMPUS_TOUR_URL`, or null when nobody has configured one. */
  tourBaseUrl: string | null
  /** Already checked against the linked scenes on the server. */
  startScene: string | null
}) {
  const [scene, setScene] = useState<string | null>(startScene)
  const [panel, setPanel] = useState<PanelKey | null>(null)
  const [filter, setFilter] = useState<Set<string>>(new Set())
  const [intro, setIntro] = useState(true)
  /* True once the visitor has driven the tour themselves, at which point the
   * scene on screen is no longer the one we last asked for. See `onBlur`. */
  const [wandered, setWandered] = useState(false)
  const [jump, setJump] = useState(0)
  const panelRef = useRef<HTMLElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const linked = useMemo(
    () => places.filter((place): place is CampusPlace & { tour_scene_url: string } =>
      Boolean(place.tour_scene_url),
    ),
    [places],
  )

  const options: SceneOption[] = useMemo(
    () =>
      linked.map((place) => ({
        id: place.id,
        name: place.name,
        category: place.category,
        scene: place.tour_scene_url,
      })),
    [linked],
  )

  /* The place we put the visitor at, which is only where they still are if they
   * have not moved since. */
  const placed = useMemo(
    () => linked.find((place) => place.tour_scene_url === scene) ?? null,
    [linked, scene],
  )
  const current = wandered ? null : placed

  const emergency = useMemo(
    () => places.filter((place) => place.is_emergency),
    [places],
  )

  const services = useMemo(
    () =>
      places.filter(
        (place) => !place.is_emergency && place.contact_phone && place.category === 'service',
      ),
    [places],
  )

  const counts = useMemo(() => {
    const tally: Record<string, number> = {}
    for (const place of places) tally[place.category] = (tally[place.category] ?? 0) + 1
    return tally
  }, [places])

  const visible = useMemo(
    () => (filter.size === 0 ? places : places.filter((place) => filter.has(place.category))),
    [places, filter],
  )

  /* The URL keeps up with the tour so a scene can be sent to somebody, without
   * a server round trip that would reload the viewer underneath it. */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (scene) url.searchParams.set('scene', scene)
    else url.searchParams.delete('scene')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [scene])

  // Opening a panel moves focus into it; closing one hands focus back to the
  // pill that opened it, so a keyboard never loses its place.
  useEffect(() => {
    if (panel) panelRef.current?.focus()
  }, [panel])

  /**
   * Whether the label below still describes what is on screen.
   *
   * The tour is a third-party viewer on another origin: it broadcasts nothing,
   * its URL cannot be read from here, and it publishes no embed API — so there
   * is no way to be *told* which scene the visitor walked to using its own
   * arrows and thumbnails. What can be detected is the moment they take the
   * wheel, because clicking or tabbing into an iframe blurs the parent window
   * and leaves the frame as the active element.
   *
   * So the label is dynamic in the only direction that is honest: it names the
   * place while we are the ones who put the visitor there, and it stops naming
   * one the moment they start moving themselves. Jumping from our own controls
   * re-anchors it. Claiming "College of Architecture" while somebody is three
   * buildings away is worse than claiming nothing.
   */
  useEffect(() => {
    const onBlur = () => {
      // activeElement is only updated after the blur has been dispatched.
      window.setTimeout(() => {
        if (document.activeElement === frameRef.current) setWandered(true)
      }, 0)
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  const closePanel = useCallback((returnFocusTo: PanelKey | null) => {
    setPanel(null)
    if (returnFocusTo) document.getElementById(toolId(returnFocusTo))?.focus()
  }, [])

  function jumpTo(nextScene: string) {
    setScene(nextScene)
    setWandered(false)
    setPanel(null)
    // Bumped on every jump, not only on a change of scene: asking to go back to
    // the place you started from has to actually take you back there, and the
    // frame only reloads if its key moves.
    setJump((value) => value + 1)
  }

  const embedUrl = tourBaseUrl
    ? scene
      ? `${tourBaseUrl.replace(/\/$/, '')}/${scene}`
      : tourBaseUrl
    : null

  return (
    <main
      id="main"
      className="relative isolate h-dvh w-full overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* The overlay comes first so a keyboard reaches it before the viewer. */}
      <div className="pointer-events-none relative z-10 flex h-full flex-col">
        <div className="safe-top flex shrink-0 items-start gap-[var(--space-2)] p-[var(--space-3)]">
          {/* The way back out. Signed in, that is the app; signed out, the page
              that explains what this is. */}
          <Link href={signedIn ? '/today' : '/'} className="glass pointer-events-auto shrink-0">
            <span className="type-subheadline font-semibold">OneTUP</span>
          </Link>

          <span className="flex-1" />

          <ScenePicker
            className="pointer-events-auto"
            options={options}
            /* Null once the visitor has wandered: the picker must not go on
               naming a place they have walked away from either. */
            value={current?.tour_scene_url ?? null}
            onChange={jumpTo}
          />
        </div>

        {/* What this page is, said once. Solid white rather than glass: it sits
            over a photograph of unknown brightness, and this is the one card on
            the screen that has to be readable before the visitor has decided to
            care about it. */}
        <AnimatePresence>
          {intro && (
            <motion.aside
              className="card squircle pointer-events-auto mx-[var(--space-3)] w-[min(26rem,calc(100%-var(--space-6)))] shrink-0 p-[var(--space-4)]"
              style={{ background: 'var(--bg)', boxShadow: 'var(--shadow-float)' }}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={transition(spring.sheet)}
            >
              <div className="flex items-start gap-[var(--space-3)]">
                <div className="min-w-0 flex-1">
                  <p
                    className="type-caption-2 font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--label)' }}
                  >
                    Open to everyone
                  </p>
                  <h1 className="type-title-3 mt-[var(--space-1)]">
                    The campus map needs no account
                  </h1>
                  <p
                    className="type-footnote mt-[var(--space-2)]"
                    style={{ color: 'var(--label-secondary)' }}
                  >
                    Room numbers and which building they&rsquo;re in. Gates, printing spots,
                    canteens and the clinic. Walk it in 360°, or use the tools below to look
                    something up.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIntro(false)}
                  aria-label="Hide this"
                  className="-mr-[var(--space-2)] -mt-[var(--space-2)] grid shrink-0 place-items-center rounded-full"
                  style={{
                    width: 'var(--target-min)',
                    height: 'var(--target-min)',
                    color: 'var(--label-secondary)',
                  }}
                >
                  <IconClose size={18} />
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <span className="flex-1" />

        {/* The tour draws its own scene strip and caption along the bottom of
            the frame, and our controls were landing on top of both. The extra
            bottom padding clears that chrome — a fixed offset, because it is
            someone else's UI and we cannot measure it through the iframe. */}
        <div
          className="safe-bottom flex flex-col items-center gap-[var(--space-2)] p-[var(--space-3)]"
          // Inline, because `.safe-bottom` is written as plain CSS and plain
          // CSS outranks anything in Tailwind's utilities layer — the class
          // form of this padding was silently dropped.
          style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}
        >
          {/* Deliberately not keyed on the panel: switching tools swaps the
              contents of one card rather than tearing it down and building
              another, which is both calmer to watch and what keeps the focus
              move below pointing at a node that actually exists. */}
          <AnimatePresence>
            {panel && (
              <motion.section
                id={PANEL_ID}
                ref={panelRef}
                tabIndex={-1}
                aria-label={PANEL_TITLE[panel]}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closePanel(panel)
                }}
                className="card squircle pointer-events-auto w-full max-w-[34rem] overflow-hidden"
                style={{ boxShadow: 'var(--shadow-float)' }}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 14 }}
                transition={transition(spring.sheet)}
              >
                <header
                  className="flex items-center justify-between gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)]"
                  style={{ borderBottom: '1px solid var(--separator)' }}
                >
                  <h2 className="type-headline">{PANEL_TITLE[panel]}</h2>
                  <button
                    type="button"
                    onClick={() => closePanel(panel)}
                    aria-label="Close"
                    className="grid shrink-0 place-items-center rounded-full"
                    style={{
                      width: 'var(--target-min)',
                      height: 'var(--target-min)',
                      color: 'var(--label-secondary)',
                    }}
                  >
                    <IconClose size={19} />
                  </button>
                </header>

                <div
                  className="overflow-y-auto overscroll-contain p-[var(--space-4)]"
                  // Shrinks with the viewport rather than clipping off the top
                  // of the screen on a short one — a phone held sideways.
                  style={{ maxHeight: 'clamp(7rem, calc(100dvh - 16rem), 26rem)' }}
                >
                  {panel === 'room' && (
                    <RoomSearch
                      places={places}
                      onOpenScene={(place) => {
                        if (place.tour_scene_url) jumpTo(place.tour_scene_url)
                      }}
                    />
                  )}

                  {panel === 'places' && (
                    <PlacesPanel
                      places={visible}
                      total={places.length}
                      counts={counts}
                      filter={filter}
                      onFilter={setFilter}
                      selectedId={placed?.id ?? null}
                      onSelect={(place) => {
                        if (place.tour_scene_url) jumpTo(place.tour_scene_url)
                      }}
                    />
                  )}

                  {panel === 'help' && <HelpPanel emergency={emergency} services={services} />}

                  {panel === 'fix' &&
                    (signedIn ? (
                      <CorrectionForm places={places} defaultPlaceId={placed?.id ?? null} />
                    ) : (
                      <CorrectionSignedOut />
                    ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {loadFailed && (
            <div
              className="card squircle pointer-events-auto flex w-full max-w-[34rem] items-start gap-[var(--space-3)] p-[var(--space-4)]"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <span className="shrink-0" style={{ color: 'var(--warning)' }}>
                <IconWarning size={22} />
              </span>
              <p className="type-subheadline">
                Campus data could not be loaded, so the place list, the contacts and the jump-to
                list are empty. The tour itself is unaffected. Reloading is worth a try.
              </p>
            </div>
          )}

          {/* Above the tools, not below them: underneath it landed on the
              tour's own caption row and became unreadable. The scrim is
              because the backdrop is a photograph of any brightness. */}
          <p
            className="type-caption-1 squircle w-full max-w-[34rem] text-balance px-[var(--space-3)] py-[var(--space-2)]"
            style={{
              color: 'var(--label-secondary)',
              background: 'color-mix(in srgb, var(--bg) 86%, transparent)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {current ? (
              <span style={{ color: 'var(--label)', fontWeight: 600 }}>Showing {current.name}. </span>
            ) : wandered ? (
              <span>You&rsquo;re walking the tour — its own header names the scene. </span>
            ) : null}
            {/* Credit stays, the link goes: sending someone who came here to
                find a room out to a source repository is not a destination
                anybody wanted from a map. */}
            Tour by TUPniverse. Rooms move between terms — check with the office if it matters.
          </p>

          <nav
            aria-label="Campus tools"
            className="no-scrollbar pointer-events-auto flex w-full max-w-[34rem] gap-[var(--space-2)] overflow-x-auto"
          >
            {(['room', 'places', 'help', 'fix'] as const).map((key) => (
              <ToolPill
                key={key}
                panelKey={key}
                active={panel === key}
                onClick={() => (panel === key ? closePanel(null) : setPanel(key))}
              >
                {TOOL_LABEL[key]}
              </ToolPill>
            ))}
          </nav>

        </div>
      </div>

      <div className="absolute inset-0 z-0">
        {embedUrl ? (
          <iframe
            ref={frameRef}
            key={`${embedUrl}#${jump}`}
            src={embedUrl}
            title={placed ? `Campus tour — ${placed.name}` : 'TUP Manila campus tour'}
            // A 360° view needs the motion sensors. It gets those and nothing else.
            allow="accelerometer; gyroscope; magnetometer; xr-spatial-tracking; fullscreen"
            referrerPolicy="no-referrer"
            className="block size-full border-0"
          />
        ) : (
          <TourNotConnected />
        )}
      </div>
    </main>
  )
}

/**
 * The designed state for a tour that has no address.
 *
 * `NEXT_PUBLIC_CAMPUS_TOUR_URL` being unset is a configuration fact, not an
 * error, and an empty frame pretending to load would be a lie. Everything else
 * on the screen still works, which is what this says (PRD Q5).
 */
function TourNotConnected() {
  return (
    <div className="grid size-full place-items-center p-[var(--space-4)]">
      <Card className="w-full max-w-[30rem]">
        <EmptyState
          icon={<IconCampus size={30} />}
          title="The 3D campus isn't connected yet. Room lookup, the place list and the emergency numbers all still work below."
        />
      </Card>
    </div>
  )
}

function ToolPill({
  panelKey,
  active,
  onClick,
  children,
}: {
  panelKey: PanelKey
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      id={toolId(panelKey)}
      type="button"
      onClick={onClick}
      aria-expanded={active}
      aria-controls={active ? PANEL_ID : undefined}
      className={cx('glass shrink-0 whitespace-nowrap', active && 'glass-accent')}
      style={{ paddingInline: 'var(--space-4)', fontSize: '0.9375rem' }}
    >
      {children}
    </button>
  )
}

function PlacesPanel({
  places,
  total,
  counts,
  filter,
  onFilter,
  selectedId,
  onSelect,
}: {
  places: CampusPlace[]
  total: number
  counts: Record<string, number>
  filter: Set<string>
  onFilter: (next: Set<string>) => void
  selectedId: string | null
  onSelect: (place: CampusPlace) => void
}) {
  function toggle(category: string) {
    const next = new Set(filter)
    if (next.has(category)) next.delete(category)
    else next.add(category)
    onFilter(next)
  }

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <ul
        aria-label="Filter by category"
        className="no-scrollbar -mx-[var(--space-1)] flex list-none gap-[var(--space-2)] overflow-x-auto px-[var(--space-1)] pb-[var(--space-1)] [&>li]:shrink-0"
      >
        <li>
          <FilterChip
            selected={filter.size === 0}
            onClick={() => onFilter(new Set())}
            label="Everything"
            count={total}
          />
        </li>
        {CATEGORY_ORDER.map((category) => (
          <li key={category}>
            <FilterChip
              selected={filter.has(category)}
              onClick={() => toggle(category)}
              label={CATEGORY_LABEL[category]}
              count={counts[category] ?? 0}
            />
          </li>
        ))}
      </ul>

      {places.length > 0 ? (
        <PlaceList places={places} selectedId={selectedId} onSelect={onSelect} />
      ) : (
        <p className="type-subheadline" style={{ color: 'var(--label-secondary)' }}>
          Nothing recorded in that category yet. Everything here was added by a student, so this
          fills in as people add to it.
        </p>
      )}
    </div>
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
 * The one panel that has to work when everything else has gone wrong, which is
 * why it is plain rows and `tel:` links and nothing clever.
 */
function HelpPanel({
  emergency,
  services,
}: {
  emergency: CampusPlace[]
  services: CampusPlace[]
}) {
  if (emergency.length === 0 && services.length === 0) {
    return (
      <p className="type-subheadline" style={{ color: 'var(--label-secondary)' }}>
        No contacts have been recorded yet. In a real emergency the nearest gate guard is faster
        than any list on a phone.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {emergency.length > 0 && (
        <section aria-label="Emergency">
          <ListGroup>
            {emergency.map((place) => (
              <ContactRow key={place.id} place={place} urgent />
            ))}
          </ListGroup>
        </section>
      )}

      {services.length > 0 && (
        <section aria-label="Services">
          <h3 className="type-section-header pb-[var(--space-2)]">Offices and services</h3>
          <ListGroup>
            {services.map((place) => (
              <ContactRow key={place.id} place={place} />
            ))}
          </ListGroup>
        </section>
      )}

      <p className="type-caption-1" style={{ color: 'var(--label-secondary)' }}>
        Numbers here are only as current as the last student who checked them. In a real
        emergency, the nearest gate guard is faster than any of this.
      </p>
    </div>
  )
}

function ContactRow({ place, urgent = false }: { place: CampusPlace; urgent?: boolean }) {
  const body = (
    <span className="min-w-0 flex-1">
      <span className="type-headline block">{place.name}</span>
      {place.description && <span className="type-footnote block">{place.description}</span>}
      <span className="type-footnote mt-[2px] block">
        {place.contact_phone ? (
          <span className="type-data" style={{ color: urgent ? 'var(--danger)' : undefined }}>
            {place.contact_phone}
          </span>
        ) : (
          'No number recorded yet'
        )}
      </span>
      {!place.contact_phone && (
        <span className="mt-[var(--space-2)] block">
          <Badge tone="stale">Unconfirmed</Badge>
        </span>
      )}
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
