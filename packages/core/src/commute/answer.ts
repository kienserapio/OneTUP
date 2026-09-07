/**
 * Turning route rows into the answer to a commute question.
 *
 * Every number here arrives already computed — `v_route_summary` sums the leg
 * durations and applies the fare rules, and `peakPenaltyAt` adds what the hour
 * costs. Nothing in this file produces a figure; it decides which routes are
 * worth mentioning and how honest the answer has to be about them (ADR-007).
 *
 * That last part is the point. A route nobody has confirmed in three months
 * should say so in words, not only as a badge on a screen the student is not
 * looking at.
 */

export interface RouteOption {
  routeId: string
  label: string | null
  /** Sum of the leg durations, before any peak penalty. */
  baseMinutes: number
  /** What the chosen departure hour adds. Zero off-peak. */
  peakMinutes: number
  fareStudent: number
  fareRegular: number
  transfers: number
  verifiedCount: number
  lastVerifiedAt: string | null
}

export type CommutePreference = 'fastest' | 'cheapest' | 'fewest_transfers'

export function totalMinutes(option: RouteOption): number {
  return option.baseMinutes + option.peakMinutes
}

/**
 * The one to lead with, and the one worth mentioning beside it.
 *
 * A commute screen exists to make one comparison — is the fast one worth the
 * money — so an answer that names only the fastest route has withheld the thing
 * the student came for. The alternative is offered **only when it is genuinely
 * different**: when the cheapest route is also the fastest, saying so twice is
 * noise.
 *
 * A stated preference decides which one leads. With no preference, the fastest
 * leads, because that is what "how do I get to TUP" usually means.
 */
export function chooseOptions(
  routes: readonly RouteOption[],
  preference: CommutePreference | null,
): { primary: RouteOption; alternative: RouteOption | null } | null {
  if (routes.length === 0) return null

  const fastest = [...routes].sort((a, b) => totalMinutes(a) - totalMinutes(b))[0]
  const cheapest = [...routes].sort((a, b) => a.fareStudent - b.fareStudent)[0]
  const simplest = [...routes].sort(
    (a, b) => a.transfers - b.transfers || totalMinutes(a) - totalMinutes(b),
  )[0]

  const primary =
    preference === 'cheapest' ? cheapest : preference === 'fewest_transfers' ? simplest : fastest

  /* The comparison is always fastest-against-cheapest, whichever leads. If the
   * student asked for cheapest, the interesting counterpart is how much time
   * that costs them — and the other way round. */
  const counterpart = primary.routeId === cheapest.routeId ? fastest : cheapest

  const worthSaying =
    counterpart.routeId !== primary.routeId &&
    (Math.abs(counterpart.fareStudent - primary.fareStudent) >= MEANINGFUL_PESOS ||
      Math.abs(totalMinutes(counterpart) - totalMinutes(primary)) >= MEANINGFUL_MINUTES)

  return { primary, alternative: worthSaying ? counterpart : null }
}

/** Below these, two routes are the same answer wearing different labels. */
const MEANINGFUL_PESOS = 5
const MEANINGFUL_MINUTES = 8

/** How stale a route may get before the answer says so out loud. */
export const STALE_AFTER_DAYS = 90

/**
 * What the answer owes the student about how much to trust it.
 *
 * Returns null when the route is recently confirmed and there is nothing worth
 * saying — the common case, and silence is the right output for it.
 */
export function verificationNote(option: RouteOption, now: Date): string | null {
  if (option.verifiedCount === 0) {
    return 'Nobody has confirmed this one yet, so treat it as a starting point.'
  }

  if (!option.lastVerifiedAt) return null

  const days = Math.floor((now.getTime() - Date.parse(option.lastVerifiedAt)) / 86_400_000)
  if (!Number.isFinite(days) || days < STALE_AFTER_DAYS) return null

  const months = Math.floor(days / 30)
  return `Last confirmed ${months} month${months === 1 ? '' : 's'} ago — fares and routes change, so check before you rely on it.`
}

/** "₱25.00" — the peso figure as the answer states it. */
export function peso(amount: number): string {
  return `₱${amount.toFixed(2)}`
}

/**
 * The sentence, assembled.
 *
 * Kept here rather than in the route handler so the wording is testable and so
 * there is one place that decides what a commute answer says. The model never
 * sees any of this: it extracted an origin and an hour, and that is all it did.
 */
export function describeCommute(
  choice: { primary: RouteOption; alternative: RouteOption | null },
  context: { originArea: string; departureTime: string | null; now: Date },
): string {
  const { primary, alternative } = choice
  const sentences: string[] = []

  const when = context.departureTime ? ` leaving at ${friendlyTime(context.departureTime)}` : ''
  const name = primary.label ?? `The route from ${context.originArea}`

  sentences.push(
    `${name} takes about ${totalMinutes(primary)} minutes${when} for ${peso(primary.fareStudent)} with your student discount.`,
  )

  /* Stated separately rather than folded into the figure, so a student can see
   * that the extra twenty minutes is the hour they picked and not the route. */
  if (primary.peakMinutes > 0) {
    sentences.push(
      `That includes ${primary.peakMinutes} minutes of rush-hour traffic on the way.`,
    )
  }

  if (alternative) {
    const fasterBy = totalMinutes(primary) - totalMinutes(alternative)
    const cheaperBy = primary.fareStudent - alternative.fareStudent
    const altName = alternative.label ?? 'another route'

    if (fasterBy > 0) {
      sentences.push(
        `${altName} is ${fasterBy} minutes quicker at ${peso(alternative.fareStudent)}.`,
      )
    } else if (cheaperBy > 0) {
      sentences.push(
        `${altName} costs ${peso(alternative.fareStudent)} but takes ${-fasterBy} minutes longer.`,
      )
    } else {
      sentences.push(`${altName} is the other option at ${peso(alternative.fareStudent)}.`)
    }
  }

  const note = verificationNote(primary, context.now)
  if (note) sentences.push(note)

  return sentences.join(' ')
}

/** "21:00" → "9pm", "06:30" → "6:30am". The answer is prose, not a timetable. */
export function friendlyTime(time: string): string {
  const [rawHour, rawMinute] = time.split(':').map(Number)
  if (!Number.isFinite(rawHour)) return time
  const suffix = rawHour < 12 ? 'am' : 'pm'
  const hour = rawHour % 12 === 0 ? 12 : rawHour % 12
  return rawMinute === 0 ? `${hour}${suffix}` : `${hour}:${String(rawMinute).padStart(2, '0')}${suffix}`
}
