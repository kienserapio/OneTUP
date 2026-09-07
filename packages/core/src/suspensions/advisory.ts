import type { SuspensionAdvisory } from '../db'

/**
 * Which suspension advisory, if any, a student is shown today.
 *
 * The rule this whole feature turns on lives one layer up — an advisory is a
 * notice and never cancels a class by itself (15-SUSPENSIONS-PLAN.md §1). What
 * is decided here is narrower and purely about presentation: of everything
 * announced, which single notice is the one worth a card.
 */

/**
 * Narrowest first. A typhoon produces a national announcement, an NCR one and
 * the city's, all saying the same thing; stacking three cards would make one
 * true fact look like three separate emergencies. The university's own word
 * outranks all of them, because that is the one that actually decides whether
 * TUP holds classes.
 */
export const ADVISORY_SCOPES = ['university', 'city', 'ncr', 'national'] as const

export type AdvisoryScope = (typeof ADVISORY_SCOPES)[number]

function rankOf(scope: string): number {
  const index = ADVISORY_SCOPES.indexOf(scope as AdvisoryScope)
  return index === -1 ? ADVISORY_SCOPES.length : index
}

/**
 * The advisory in force on `today`, or null.
 *
 * Only `effective_on = today`. An advisory is a notice about a day, and a
 * notice about yesterday is history — the card would be lying about the present
 * tense the moment the clock rolls over. Tomorrow's is withheld for the mirror
 * reason: a student who acts on it a day early marks the wrong sessions.
 */
export function advisoryForToday<T extends Pick<SuspensionAdvisory, 'scope' | 'effective_on' | 'created_at'>>(
  advisories: readonly T[],
  today: string,
): T | null {
  const applicable = advisories.filter((advisory) => advisory.effective_on === today)
  if (applicable.length === 0) return null

  return [...applicable].sort((a, b) => {
    if (rankOf(a.scope) !== rankOf(b.scope)) return rankOf(a.scope) - rankOf(b.scope)
    // Same scope: the most recently announced is the current word on it.
    return a.created_at < b.created_at ? 1 : -1
  })[0]
}
