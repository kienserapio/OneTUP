/**
 * GWA arithmetic and the what-if planner.
 *
 * TUP grades run 1.00 (highest) to 5.00 (failing) in 0.25 steps, with 3.00 as
 * the passing threshold. That inversion matters everywhere below: a *lower*
 * GWA is better, so "reaching a target" means getting the weighted average at
 * or below it, and a required grade below 1.00 is impossible rather than easy.
 *
 * Non-numeric marks (INC, DRP, W) leave both the numerator and the denominator.
 * The caller is expected to say so in the interface, because a denominator that
 * does not match a student's unit load is otherwise alarming.
 */

export const GRADE_HIGHEST = 1.0
export const GRADE_LOWEST = 5.0
export const GRADE_PASSING = 3.0
export const GRADE_STEP = 0.25

export type NonNumericMark = 'INC' | 'DRP' | 'W' | 'P' | 'NP'

export interface GradedCourse {
  enrollmentId: string
  code: string
  units: number
  /** null when the course carries a non-numeric mark or no grade yet. */
  value: number | null
  mark?: NonNumericMark | null
  isProjected?: boolean
}

export interface GwaResult {
  /** null when nothing is graded — never 0, which would read as a perfect score. */
  gwa: number | null
  gradedUnits: number
  gradedCourses: number
  excludedCourses: { code: string; mark: NonNumericMark }[]
  includesProjection: boolean
}

/** The valid grades on the TUP scale, highest first. */
export const GRADE_SCALE: number[] = (() => {
  const values: number[] = []
  for (let g = GRADE_HIGHEST; g <= GRADE_LOWEST + 1e-9; g += GRADE_STEP) {
    values.push(Number(g.toFixed(2)))
  }
  return values
})()

export function isValidGrade(value: number): boolean {
  if (!Number.isFinite(value)) return false
  if (value < GRADE_HIGHEST || value > GRADE_LOWEST) return false
  return Math.abs(value / GRADE_STEP - Math.round(value / GRADE_STEP)) < 1e-9
}

/** Rounds to the nearest real grade on the scale. Never invents a value. */
export function snapToScale(value: number): number {
  const clamped = Math.min(GRADE_LOWEST, Math.max(GRADE_HIGHEST, value))
  return Number((Math.round(clamped / GRADE_STEP) * GRADE_STEP).toFixed(2))
}

export function isPassing(value: number): boolean {
  return value <= GRADE_PASSING
}

/** `GWA = Σ(grade × units) / Σ(units)` over numerically graded courses. */
export function computeGwa(courses: readonly GradedCourse[]): GwaResult {
  let points = 0
  let units = 0
  let count = 0
  let includesProjection = false
  const excluded: { code: string; mark: NonNumericMark }[] = []

  for (const course of courses) {
    if (course.value === null || course.value === undefined) {
      if (course.mark) excluded.push({ code: course.code, mark: course.mark })
      continue
    }
    points += course.value * course.units
    units += course.units
    count += 1
    if (course.isProjected) includesProjection = true
  }

  return {
    gwa: units > 0 ? points / units : null,
    gradedUnits: units,
    gradedCourses: count,
    excludedCourses: excluded,
    includesProjection,
  }
}

/** Two decimals for display; full precision is kept everywhere else. */
export function formatGwa(gwa: number | null): string {
  return gwa === null ? '—' : gwa.toFixed(2)
}

// --- What-if planner ------------------------------------------------------

export interface WhatIfInput {
  target: number
  graded: readonly GradedCourse[]
  /** Courses with no grade yet. `pinnedValue` fixes an expected grade. */
  ungraded: readonly { enrollmentId: string; code: string; units: number; pinnedValue?: number | null }[]
}

export type WhatIfVerdict =
  | 'reachable'
  | 'already_met'
  /** Needs better than 1.00 — arithmetically impossible. */
  | 'unreachable'
  /** Clears even with failing grades everywhere; worth saying plainly. */
  | 'guaranteed'
  /** A pinned grade is what makes the target impossible. */
  | 'blocked_by_pin'
  | 'nothing_left'

export interface WhatIfResult {
  verdict: WhatIfVerdict
  /** The uniform grade needed in every unpinned remaining course. */
  requiredUniform: number | null
  /** Snapped to the nearest achievable grade on the scale. */
  requiredAchievable: number | null
  /** Best GWA still possible, i.e. 1.00 in everything remaining. */
  bestPossible: number | null
  /** GWA if every remaining course is failed at 5.00. */
  worstPossible: number | null
  currentGwa: number | null
  /** Codes of pins that make the target unreachable, when that is the cause. */
  blockingPins: string[]
  explanation: string
}

/**
 * Given a target GWA, what grade is needed in each remaining course?
 *
 *   required_total   = target × (Σ graded units + Σ ungraded units)
 *   achieved_points  = Σ(grade × units) over graded
 *   needed_points    = required_total − achieved_points − pinned points
 *   uniform_required = needed_points / Σ units of unpinned remaining
 */
export function planWhatIf(input: WhatIfInput): WhatIfResult {
  const current = computeGwa(input.graded)

  const gradedUnits = current.gradedUnits
  const achievedPoints = input.graded.reduce(
    (sum, c) => (c.value === null || c.value === undefined ? sum : sum + c.value * c.units),
    0,
  )

  const pinned = input.ungraded.filter(
    (c) => c.pinnedValue !== null && c.pinnedValue !== undefined,
  )
  const open = input.ungraded.filter((c) => c.pinnedValue === null || c.pinnedValue === undefined)

  const pinnedUnits = pinned.reduce((s, c) => s + c.units, 0)
  const pinnedPoints = pinned.reduce((s, c) => s + (c.pinnedValue as number) * c.units, 0)
  const openUnits = open.reduce((s, c) => s + c.units, 0)

  const totalUnits = gradedUnits + pinnedUnits + openUnits

  if (totalUnits === 0) {
    return {
      verdict: 'nothing_left',
      requiredUniform: null,
      requiredAchievable: null,
      bestPossible: null,
      worstPossible: null,
      currentGwa: current.gwa,
      blockingPins: [],
      explanation: 'There are no graded or remaining courses to plan against yet.',
    }
  }

  const bestPossible =
    (achievedPoints + pinnedPoints + openUnits * GRADE_HIGHEST) / totalUnits
  const worstPossible =
    (achievedPoints + pinnedPoints + openUnits * GRADE_LOWEST) / totalUnits

  if (openUnits === 0) {
    const finalGwa = (achievedPoints + pinnedPoints) / totalUnits
    const met = finalGwa <= input.target + 1e-9
    return {
      verdict: met ? 'already_met' : 'blocked_by_pin',
      requiredUniform: null,
      requiredAchievable: null,
      bestPossible,
      worstPossible,
      currentGwa: current.gwa,
      blockingPins: met ? [] : pinned.map((c) => c.code),
      explanation: met
        ? `With every grade set, your GWA comes to ${finalGwa.toFixed(2)} — that clears ${input.target.toFixed(2)}.`
        : `With every grade set, your GWA comes to ${finalGwa.toFixed(2)}, which misses ${input.target.toFixed(2)}.`,
    }
  }

  const requiredTotal = input.target * totalUnits
  const neededPoints = requiredTotal - achievedPoints - pinnedPoints
  const requiredUniform = neededPoints / openUnits

  // Lower is better, so a requirement above 5.00 means the target is already
  // safe, and one below 1.00 means it cannot be reached.
  if (requiredUniform >= GRADE_LOWEST - 1e-9) {
    return {
      verdict: 'guaranteed',
      requiredUniform,
      requiredAchievable: GRADE_LOWEST,
      bestPossible,
      worstPossible,
      currentGwa: current.gwa,
      blockingPins: [],
      explanation: `You clear ${input.target.toFixed(2)} no matter what you get in the remaining ${open.length === 1 ? 'subject' : 'subjects'}.`,
    }
  }

  if (requiredUniform < GRADE_HIGHEST - 1e-9) {
    const blockingPins = pinned
      .filter((c) => (c.pinnedValue as number) > input.target)
      .map((c) => c.code)

    // Would the target be reachable if the pins were released?
    const withoutPins =
      (input.target * totalUnits - achievedPoints) / (openUnits + pinnedUnits)
    const pinsAreTheCause = blockingPins.length > 0 && withoutPins >= GRADE_HIGHEST - 1e-9

    return {
      verdict: pinsAreTheCause ? 'blocked_by_pin' : 'unreachable',
      requiredUniform,
      requiredAchievable: null,
      bestPossible,
      worstPossible,
      currentGwa: current.gwa,
      blockingPins: pinsAreTheCause ? blockingPins : [],
      explanation: pinsAreTheCause
        ? `${formatList(blockingPins)} at the grade you pinned puts ${input.target.toFixed(2)} out of reach. Without ${blockingPins.length === 1 ? 'that pin' : 'those pins'} you would need ${withoutPins.toFixed(2)}.`
        : `${input.target.toFixed(2)} is no longer reachable. The best you can finish with is ${bestPossible.toFixed(2)}, which needs 1.00 in everything left.`,
    }
  }

  const achievable = snapToScale(Math.floor(requiredUniform / GRADE_STEP) * GRADE_STEP)

  // Everything above has ruled out the impossible and the guaranteed, so the
  // requirement is a real grade somewhere on the scale.
  return {
    verdict: 'reachable',
    requiredUniform,
    requiredAchievable: achievable,
    bestPossible,
    worstPossible,
    currentGwa: current.gwa,
    blockingPins: [],
    explanation: `You need ${achievable.toFixed(2)} in ${open.length === 1 ? 'your remaining subject' : `each of your ${open.length} remaining subjects`} to reach ${input.target.toFixed(2)}.`,
  }
}

/**
 * Reverse mode: the *worst* grade the student can take in each remaining course
 * and still clear a threshold. Same arithmetic, read from the other end.
 */
export function maximumAllowableGrade(input: WhatIfInput): number | null {
  const plan = planWhatIf(input)
  if (plan.requiredUniform === null) return null
  if (plan.requiredUniform >= GRADE_LOWEST) return GRADE_LOWEST
  if (plan.requiredUniform < GRADE_HIGHEST) return null
  return snapToScale(Math.floor(plan.requiredUniform / GRADE_STEP) * GRADE_STEP)
}

function formatList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

// --- Component tracking ---------------------------------------------------

export interface GradeComponent {
  label: string
  weightPct: number
  /** Percentage score. May exceed 100 where bonus points exist. */
  scorePct: number | null
  isComplete: boolean
}

export interface ComponentStanding {
  /** Weighted average over completed components only. */
  currentStanding: number | null
  completedWeight: number
  remainingWeight: number
  /** Score needed across all remaining weight to hit `targetPct`. */
  requiredOnRemaining: number | null
  /** True when the target needs more than 100% on everything remaining. */
  requiresImpossibleScore: boolean
  weightsSumTo: number
}

export function computeComponentStanding(
  components: readonly GradeComponent[],
  targetPct: number | null,
): ComponentStanding {
  const weightsSumTo = components.reduce((s, c) => s + c.weightPct, 0)
  const completed = components.filter((c) => c.isComplete && c.scorePct !== null)

  const completedWeight = completed.reduce((s, c) => s + c.weightPct, 0)
  const earnedPoints = completed.reduce((s, c) => s + (c.scorePct as number) * c.weightPct, 0)

  const currentStanding = completedWeight > 0 ? earnedPoints / completedWeight : null
  const remainingWeight = Math.max(0, weightsSumTo - completedWeight)

  let requiredOnRemaining: number | null = null
  if (targetPct !== null && remainingWeight > 0) {
    requiredOnRemaining = (targetPct * weightsSumTo - earnedPoints) / remainingWeight
  }

  return {
    currentStanding,
    completedWeight,
    remainingWeight,
    requiredOnRemaining,
    requiresImpossibleScore: requiredOnRemaining !== null && requiredOnRemaining > 100,
    weightsSumTo,
  }
}

// --- Thresholds -----------------------------------------------------------

export type Comparator = '<=' | '>=' | '<' | '>'
export type ThresholdState = 'clear' | 'at_risk' | 'breached'

export interface Threshold {
  id: string
  label: string
  comparator: Comparator
  value: number
  lastState: ThresholdState | null
}

/**
 * Evaluates a threshold against the current and projected GWA.
 *
 * "At risk" means the student currently clears it but the projection does not —
 * which is exactly the moment worth telling them, while it is still fixable.
 */
export function evaluateThreshold(
  threshold: Threshold,
  currentGwa: number | null,
  projectedGwa: number | null,
): ThresholdState {
  if (currentGwa === null) return 'clear'
  const clearsNow = compare(currentGwa, threshold.comparator, threshold.value)
  if (!clearsNow) return 'breached'
  if (projectedGwa !== null && !compare(projectedGwa, threshold.comparator, threshold.value)) {
    return 'at_risk'
  }
  return 'clear'
}

function compare(value: number, comparator: Comparator, against: number): boolean {
  switch (comparator) {
    case '<=':
      return value <= against + 1e-9
    case '<':
      return value < against - 1e-9
    case '>=':
      return value >= against - 1e-9
    case '>':
      return value > against + 1e-9
  }
}

/** Fires only on a transition to a worse state, never on holding steady. */
export function shouldNotifyThreshold(
  previous: ThresholdState | null,
  current: ThresholdState,
): boolean {
  const order: Record<ThresholdState, number> = { clear: 0, at_risk: 1, breached: 2 }
  if (current === 'clear') return false
  return order[current] > order[previous ?? 'clear']
}
