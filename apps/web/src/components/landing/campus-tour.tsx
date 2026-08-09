'use client'

import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'

/**
 * The tour, and the way in.
 *
 * The frame takes the whole section because a 360° view shown in a thumbnail is
 * a picture, not a tour. Everything else — the heading, the search, the scene
 * list — floats over it on glass: bottom on a phone, where a thumb reaches, and
 * to the side on a desktop, where it would otherwise cover the view.
 *
 * The tour is TUPniverse's work hosted on Panoee, credited wherever a scene
 * appears.
 */

export interface TourScene {
  sceneId: string
  name: string
  category: string
}

export function CampusTour({ base, scenes }: { base: string; scenes: TourScene[] }) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [activeScene, setActiveScene] = useState<string | null>(scenes[0]?.sceneId ?? null)

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return scenes
    return scenes.filter(
      (scene) =>
        scene.name.toLowerCase().includes(needle) || scene.category.toLowerCase().includes(needle),
    )
  }, [query, scenes])

  const current = scenes.find((scene) => scene.sceneId === activeScene)
  const src = activeScene ? `${base}/${activeScene}` : base

  return (
    <div className="absolute inset-0">
      <iframe
        // Keyed on the URL so swapping scenes replaces the frame rather than
        // pushing an entry onto the visitor's back history.
        key={src}
        src={src}
        title={current ? `Virtual tour — ${current.name}` : 'TUP Manila virtual tour'}
        // A 360° view needs the motion sensors. It gets those and nothing else.
        allow="accelerometer; gyroscope; magnetometer; xr-spatial-tracking; fullscreen"
        referrerPolicy="no-referrer"
        loading="lazy"
        className="block h-full w-full border-0"
      />

      <div
        className={cx(
          'material material-large squircle absolute overflow-hidden rounded-[var(--radius-xl)]',
          'inset-x-3 bottom-3 max-h-[62%] md:inset-auto md:left-6 md:top-1/2 md:w-[22rem] md:max-h-[80%] md:-translate-y-1/2',
        )}
        style={{ boxShadow: 'var(--shadow-float)' }}
      >
        <div className="flex max-h-full flex-col">
          <div className="px-5 pt-5">
            <p
              className="type-caption-2 font-semibold uppercase tracking-widest"
              style={{ color: 'var(--label)' }}
            >
              Open to everyone
            </p>
            <h2 className="mt-2 text-xl leading-[1.2] tracking-tight sm:text-2xl">
              The campus map needs no account
            </h2>
            <p className="type-footnote vibrant-secondary mt-2">
              Room numbers and which building they&rsquo;re in. Gates and which one is nearest the
              LRT walk. No sign-up. Works on any phone.
            </p>

            {scenes.length > 0 && (
              <div className="mt-4">
                <label htmlFor={searchId} className="sr-only">
                  Search the tour
                </label>
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search a building, gate or office"
                  className="field type-subheadline w-full"
                />
              </div>
            )}
          </div>

          {scenes.length > 0 && (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {matches.length === 0 ? (
                <p className="type-footnote px-2 py-3" style={{ color: 'var(--label-secondary)' }}>
                  Nothing here matches that. Try the building or the office name.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {matches.map((scene) => {
                    const isActive = scene.sceneId === activeScene
                    return (
                      <li key={scene.sceneId}>
                        <button
                          type="button"
                          onClick={() => setActiveScene(scene.sceneId)}
                          aria-current={isActive ? 'true' : undefined}
                          className="flex min-h-[var(--target-min)] w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors"
                          style={{
                            background: isActive ? 'var(--accent-subtle)' : 'transparent',
                            color: isActive ? 'var(--crimson-700)' : 'var(--label)',
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="type-subheadline block truncate font-semibold">
                              {scene.name}
                            </span>
                            <span
                              className="type-caption-1 block truncate capitalize"
                              style={{ color: 'var(--label-secondary)' }}
                            >
                              {scene.category}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          <div
            className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3"
            style={{ borderColor: 'var(--material-hairline)' }}
          >
            <p className="type-caption-1" style={{ color: 'var(--label-secondary)' }}>
              Tour by{' '}
              <a
                href="https://github.com/smnthegr/TUPniverse"
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: 'var(--accent)' }}
              >
                TUPniverse
              </a>
            </p>
            <Link
              href="/campus"
              className="type-caption-1 flex min-h-[var(--target-min)] items-center font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              Open the campus map
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
