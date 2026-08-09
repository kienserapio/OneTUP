/**
 * Motion.
 *
 * Apple describes springs with two designer-facing numbers rather than the
 * physics triplet:
 *
 *   damping ratio — 1.0 settles with no overshoot, below 1.0 bounces
 *   response      — how quickly the value reaches the target, in seconds
 *
 * Motion's spring API takes `bounce` and `duration`, which map across almost
 * directly: `bounce ≈ 1 − damping`, `duration ≈ response`.
 *
 * House rule: critically damped by default. Overshoot is reserved for motion a
 * gesture actually carried — a flick, a throw, a drag release. A menu that just
 * faded in has no momentum to express, and bouncing it reads as decoration.
 */

export interface SpringConfig {
  type: 'spring'
  bounce: number
  duration: number
}

export const spring = {
  /** Default for anything a finger touches. damping 1.0, response 0.4. */
  ui: { type: 'spring', bounce: 0, duration: 0.4 },

  /** Repositioning an element — a card moving, a picture-in-picture panel. */
  move: { type: 'spring', bounce: 0, duration: 0.4 },

  /** Sheets and drawers. damping ~0.8, response 0.3. */
  sheet: { type: 'spring', bounce: 0.2, duration: 0.3 },

  /** After a flick or a throw, where the momentum justifies the overshoot. */
  flick: { type: 'spring', bounce: 0.2, duration: 0.4 },

  /** Snappier variant for small controls: toggles, chips, tab indicators. */
  snap: { type: 'spring', bounce: 0, duration: 0.28 },
} as const satisfies Record<string, SpringConfig>

/** Cross-fade replacements used when the student has asked for less motion. */
export const reducedMotionTransition = { duration: 0.2, ease: 'linear' } as const

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Resolves a spring against the student's motion preference. Reduced motion
 * gets a short cross-fade rather than nothing at all — feedback still has to
 * arrive, it just must not travel.
 */
export function transition(config: SpringConfig = spring.ui) {
  return prefersReducedMotion() ? reducedMotionTransition : config
}

// --- Momentum -------------------------------------------------------------

/**
 * Where a flick would come to rest, using the same exponential decay as scroll
 * deceleration. Snapping to the nearest point from the *release* position makes
 * a throw feel like a nudge; projecting first is what makes it feel thrown.
 *
 * From Apple's Designing Fluid Interfaces sample code. Note this is not the
 * textbook v²/(2a) — the exponential form is what iOS actually ships.
 */
export function project(initialVelocity: number, decelerationRate = 0.998): number {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** The snap point nearest a projected endpoint. */
export function nearestSnapPoint(projected: number, points: readonly number[]): number {
  return points.reduce((best, point) =>
    Math.abs(point - projected) < Math.abs(best - projected) ? point : best,
  )
}

/**
 * Progressive resistance past a boundary. A hard stop reads as frozen;
 * continuous resistance reads as responsive with nothing more to reach.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

// --- Gesture tracking -----------------------------------------------------

export interface PointerSample {
  value: number
  time: number
}

/**
 * Velocity from a short history of pointer positions rather than the last two
 * points, which is noisy enough to make a slow drag register as a flick.
 *
 * Returns pixels per second.
 */
export class VelocityTracker {
  private samples: PointerSample[] = []

  constructor(private readonly windowMs = 100) {}

  add(value: number, time = performance.now()): void {
    this.samples.push({ value, time })
    const cutoff = time - this.windowMs * 2
    while (this.samples.length > 2 && this.samples[0].time < cutoff) {
      this.samples.shift()
    }
  }

  velocity(now = performance.now()): number {
    const recent = this.samples.filter((s) => now - s.time <= this.windowMs)
    if (recent.length < 2) return 0
    const first = recent[0]
    const last = recent[recent.length - 1]
    const elapsed = last.time - first.time
    if (elapsed <= 0) return 0
    return ((last.value - first.value) / elapsed) * 1000
  }

  reset(): void {
    this.samples = []
  }
}

/**
 * Movement before a drag commits to a direction. Without it, a tap that moves
 * two pixels registers as a drag and the tap never fires.
 */
export const DRAG_THRESHOLD_PX = 10

/**
 * Decides whether a released gesture commits or springs back.
 *
 * Velocity sign wins over position: a student who flicks a sheet downward has
 * expressed intent to dismiss even if they only moved it 20% of the way, and
 * pulling it back because it failed a distance test feels like being argued
 * with.
 */
export function shouldCommit(
  progress: number,
  velocity: number,
  { threshold = 0.5, velocityThreshold = 300 } = {},
): boolean {
  if (Math.abs(velocity) > velocityThreshold) return velocity > 0
  return progress > threshold
}
