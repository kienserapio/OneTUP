import { redirect } from 'next/navigation'

/**
 * `/campus/tour` used to be a second screen: a map at `/campus`, a 360° tour
 * one level down. They were never two things — the tour is the campus map — so
 * the two were merged into `/campus` and this route stays only to keep the
 * links that already exist working. The scene, if one was asked for, comes with
 * it; `/campus` is where it gets validated.
 */
export default async function CampusTourPage({
  searchParams,
}: {
  searchParams: Promise<{ scene?: string }>
}) {
  const { scene } = await searchParams
  redirect(scene ? `/campus?scene=${encodeURIComponent(scene)}` : '/campus')
}
