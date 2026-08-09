import type { Metadata } from 'next'
import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { Card, EmptyState, ListGroup, ListRow } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import { IconCampus } from '@/components/ui/icon'

export const metadata: Metadata = {
  title: 'Virtual tour',
  description: 'Walk the TUP Manila campus before you have to find the room for real.',
}

/**
 * The 360° tour.
 *
 * Public like the rest of `/campus`, and reachable from inside the app as well —
 * a student who already has an account still has to find a building they have
 * never been to, and an incoming freshman has no account at all.
 *
 * The tour is TUPniverse's work hosted on Panoee, so it is credited wherever it
 * appears and the base URL is configuration: with nothing set, this page says so
 * rather than rendering a broken frame (PRD Q5).
 */
export default async function CampusTourPage({
  searchParams,
}: {
  searchParams: Promise<{ scene?: string }>
}) {
  const { scene } = await searchParams
  const base = process.env.NEXT_PUBLIC_CAMPUS_TOUR_URL

  const supabase = await supabaseServer()
  const { data: places } = await supabase
    .from('campus_places')
    .select('id, name, category, tour_scene_url')
    .eq('status', 'approved')
    .not('tour_scene_url', 'is', null)
    .order('category')
    .order('name')

  const linked = places ?? []
  // A scene id from the query string is only honoured when it is one we linked,
  // so the page cannot be used to frame arbitrary third-party content.
  const known = new Set(linked.map((place) => place.tour_scene_url))
  const startScene = scene && known.has(scene) ? scene : (linked[0]?.tour_scene_url ?? null)
  const current = linked.find((place) => place.tour_scene_url === startScene)

  const embedUrl = base && startScene ? `${base.replace(/\/$/, '')}/${startScene}` : base

  return (
    <main id="main" className="min-h-dvh pb-16">
      <div className="app-container pt-6 safe-top">
        <p className="type-section-header">Open to everyone</p>
        <h1 className="type-large-title mt-2">Walk the campus</h1>
        <p className="type-body mt-3 max-w-[52ch]">
          Look around before you have to find the room for real. Drag to turn, tap an arrow to walk
          on.
        </p>
      </div>

      <div className="app-container mt-6 space-y-5">
        {embedUrl ? (
          <>
            <div
              className="squircle overflow-hidden"
              style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)' }}
            >
              <iframe
                key={embedUrl}
                src={embedUrl}
                title={
                  current ? `Virtual tour — ${current.name}` : 'TUP Manila virtual tour'
                }
                // A 360° view needs the motion sensors. It gets those and
                // nothing else.
                allow="accelerometer; gyroscope; magnetometer; xr-spatial-tracking; fullscreen"
                referrerPolicy="no-referrer"
                loading="lazy"
                className="block h-[68dvh] w-full border-0"
              />
            </div>

            {current && (
              <p className="type-subheadline text-[var(--label-secondary)]">
                Showing <span className="text-[var(--label)]">{current.name}</span>.
              </p>
            )}

            <section>
              <h2 className="type-section-header px-1 pb-2">Jump to</h2>
              <ListGroup>
                {linked.map((place) => (
                  <ListRow
                    key={place.id}
                    href={`/campus/tour?scene=${place.tour_scene_url}`}
                    title={place.name}
                    subtitle={place.category}
                  />
                ))}
              </ListGroup>
            </section>
          </>
        ) : (
          <Card>
            <EmptyState
              icon={<IconCampus size={30} />}
              title="The virtual tour isn't connected yet. The map has every building, gate and room in the meantime."
              action={
                <ButtonLink href="/campus" variant="accent">
                  Open the campus map
                </ButtonLink>
              }
            />
          </Card>
        )}

        <p className="type-footnote text-[var(--label-secondary)]">
          Tour by{' '}
          <a
            href="https://github.com/smnthegr/TUPniverse"
            className="text-[var(--accent)]"
            rel="noreferrer noopener"
            target="_blank"
          >
            TUPniverse
          </a>
          . Looking for a specific room?{' '}
          <Link href="/campus" className="text-[var(--accent)]">
            Search it on the map
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
