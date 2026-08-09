import { supabaseServer } from '@/lib/supabase/server'
import { ButtonLink } from '@/components/ui/button'
import { IconCampus } from '@/components/ui/icon'
import { CampusTour, type TourScene } from './campus-tour'

/**
 * The virtual tour.
 *
 * Anonymous read is allowed on `campus_places`, so this renders for a visitor
 * with no account — which is the point of the section. The scene ids live in the
 * table and the tour's host lives in the environment, so moving the tour is a
 * config edit rather than a deploy of new code.
 *
 * With no tour configured the section says so and points at the map, rather than
 * rendering an empty frame that looks broken.
 */
async function loadScenes(): Promise<TourScene[]> {
  try {
    const supabase = await supabaseServer()
    const { data } = await supabase
      .from('campus_places')
      .select('name, category, tour_scene_url')
      .eq('status', 'approved')
      .not('tour_scene_url', 'is', null)
      .order('category')
      .order('name')

    return (data ?? []).flatMap((place) =>
      place.tour_scene_url
        ? [{ sceneId: place.tour_scene_url, name: place.name, category: place.category }]
        : [],
    )
  } catch {
    // A marketing page must not 500 because the database is unreachable. The
    // tour still loads on its default scene; only the jump list is lost.
    return []
  }
}

export async function CampusSection() {
  const base = process.env.NEXT_PUBLIC_CAMPUS_TOUR_URL?.replace(/\/+$/, '') ?? null
  const scenes = base ? await loadScenes() : []

  return (
    <section
      id="campus"
      className="relative scroll-mt-24 overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {base ? (
        <div className="relative h-svh min-h-[34rem]">
          <CampusTour base={base} scenes={scenes} />
        </div>
      ) : (
        <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-32">
          <p
            className="type-caption-2 font-semibold uppercase tracking-widest"
            style={{ color: 'var(--label)' }}
          >
            Open to everyone
          </p>
          <h2 className="mt-3 text-3xl leading-[1.15] tracking-tight sm:text-4xl">
            The campus map needs no account
          </h2>
          <p className="type-body mt-5" style={{ color: 'var(--label-secondary)' }}>
            Room numbers and which building they&rsquo;re in. Gates and which one is nearest the LRT
            walk. Printing spots with what they actually charge. Canteens, tambayan, the clinic, the
            registrar.
          </p>
          <p
            className="type-footnote mt-5 flex items-center justify-center gap-2"
            style={{ color: 'var(--label-secondary)' }}
          >
            <IconCampus size={17} className="shrink-0" />
            The virtual tour isn&rsquo;t connected yet. The map has every building, gate and room in
            the meantime.
          </p>
          <div className="mt-8 flex justify-center">
            <ButtonLink href="/campus" variant="accent">
              Open the campus map
            </ButtonLink>
          </div>
        </div>
      )}
    </section>
  )
}
