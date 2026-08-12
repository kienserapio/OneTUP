/**
 * The per-leg palette, in one place.
 *
 * The map draws leg three in the same colour the written breakdown gives it,
 * and correlating the two is the whole reason the breakdown sits beside the map
 * rather than under it. Kept out of both components so the two can never drift
 * apart — they did, once, and a route read as four legs on the map and five in
 * the list.
 *
 * Drawn from the iOS system palette already in the tokens.
 */
export const LEG_COLORS = [
  'var(--ios-blue)',
  'var(--ios-orange)',
  'var(--ios-green)',
  'var(--ios-purple)',
  'var(--ios-teal)',
  'var(--ios-pink)',
] as const

/** Wraps rather than running out, because nothing caps how many legs a route has. */
export function legColor(index: number): string {
  return LEG_COLORS[index % LEG_COLORS.length]
}
