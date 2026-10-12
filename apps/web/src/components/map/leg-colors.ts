/**
 * The per-leg palette, in one place.
 *
 * The map draws leg three in the same colour the written breakdown gives it,
 * and correlating the two is the whole reason the breakdown sits beside the map
 * rather than under it. Kept out of both components so the two can never drift
 * apart — they did, once, and a route read as four legs on the map and five in
 * the list.
 *
 * Drawn from the app's feature tones (design/app-theme.css), with the old iOS
 * system colour as the fallback wherever a map renders outside the app theme.
 */
export const LEG_COLORS = [
  'var(--tone-indigo, var(--ios-blue))',
  'var(--tone-orange, var(--ios-orange))',
  'var(--tone-green, var(--ios-green))',
  'var(--tone-crimson, var(--ios-purple))',
  'var(--tone-blue, var(--ios-teal))',
  'var(--tone-gray, var(--ios-pink))',
] as const

/** Wraps rather than running out, because nothing caps how many legs a route has. */
export function legColor(index: number): string {
  return LEG_COLORS[index % LEG_COLORS.length]
}
