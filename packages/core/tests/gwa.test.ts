import { describe, expect, it } from 'vitest'
import {
  GRADE_HIGHEST,
  GRADE_LOWEST,
  GRADE_SCALE,
  computeComponentStanding,
  computeGwa,
  evaluateThreshold,
  formatGwa,
  isPassing,
  isValidGrade,
  maximumAllowableGrade,
  planWhatIf,
  shouldNotifyThreshold,
  snapToScale,
} from '@onetup/core'
import type { GradedCourse, Threshold } from '@onetup/core'

function graded(code: string, units: number, value: number | null, mark?: 'INC' | 'DRP' | 'W'): GradedCourse {
  return { enrollmentId: `e-${code}`, code, units, value, mark: mark ?? null }
}

/**
 * The TUP scale is INVERTED: 1.00 is the highest mark and 5.00 is failing, with
 * 3.00 the passing threshold. Every comparison below reads the opposite way to
 * a 4.0 GPA — "reaching a target" means landing at or *below* it.
 */
describe('the grade scale', () => {
  it('runs 1.00 to 5.00 in 0.25 steps', () => {
    expect(GRADE_SCALE[0]).toBe(1.0)
    expect(GRADE_SCALE[GRADE_SCALE.length - 1]).toBe(5.0)
    expect(GRADE_SCALE).toHaveLength(17)
    expect(GRADE_SCALE).toContain(1.75)
    expect(GRADE_SCALE).not.toContain(1.1)
  })

  it('validates only real grades', () => {
    expect(isValidGrade(1.0)).toBe(true)
    expect(isValidGrade(2.75)).toBe(true)
    expect(isValidGrade(5.0)).toBe(true)
    expect(isValidGrade(0.75)).toBe(false)
    expect(isValidGrade(5.25)).toBe(false)
    expect(isValidGrade(1.1)).toBe(false)
    expect(isValidGrade(Number.NaN)).toBe(false)
  })

  it('snaps to the nearest real grade and clamps to the ends', () => {
    expect(snapToScale(1.8)).toBe(1.75)
    expect(snapToScale(1.9)).toBe(2.0)
    expect(snapToScale(0.2)).toBe(1.0)
    expect(snapToScale(9)).toBe(5.0)
  })

  it('treats a lower number as better when deciding a pass', () => {
    expect(isPassing(1.0)).toBe(true)
    expect(isPassing(3.0)).toBe(true)
    expect(isPassing(3.25)).toBe(false)
    expect(isPassing(5.0)).toBe(false)
  })
})

describe('computeGwa', () => {
  it('matches a hand computation to four decimals', () => {
    // 1.25×3 = 3.75, 2.00×3 = 6.00, 1.75×2 = 3.50, 3.00×1 = 3.00
    //   Σ points = 16.25 over Σ units = 9  →  1.805555…
    const result = computeGwa([
      graded('CS 3105', 3, 1.25),
      graded('MATH 101', 3, 2.0),
      graded('PE 2', 2, 1.75),
      graded('NSTP 1', 1, 3.0),
    ])

    expect(result.gwa).not.toBeNull()
    expect((result.gwa as number).toFixed(4)).toBe('1.8056')
    expect(result.gwa).toBeCloseTo(1.8056, 4)
    expect(result.gradedUnits).toBe(9)
    expect(result.gradedCourses).toBe(4)
    expect(formatGwa(result.gwa)).toBe('1.81')
  })

  it('leaves non-numeric marks out of both the numerator and the denominator', () => {
    const result = computeGwa([
      graded('CS 3105', 3, 1.25),
      graded('MATH 101', 3, 2.0),
      graded('PE 2', 2, 1.75),
      graded('NSTP 1', 1, 3.0),
      graded('CS 3199', 3, null, 'INC'),
    ])

    // Identical to the hand computation above: the INC changes nothing.
    expect((result.gwa as number).toFixed(4)).toBe('1.8056')
    expect(result.gradedUnits).toBe(9)
    expect(result.excludedCourses).toEqual([{ code: 'CS 3199', mark: 'INC' }])
  })

  it('reports null rather than zero when every course is INC', () => {
    const result = computeGwa([
      graded('CS 3105', 3, null, 'INC'),
      graded('MATH 101', 3, null, 'INC'),
      graded('PE 2', 2, null, 'INC'),
    ])

    // null, never 0 — a zero on an inverted scale would read as better than
    // perfect, and 0/0 would surface as NaN.
    expect(result.gwa).toBeNull()
    expect(Number.isNaN(result.gwa as unknown as number)).toBe(false)
    expect(result.gradedUnits).toBe(0)
    expect(result.gradedCourses).toBe(0)
    expect(result.excludedCourses).toEqual([
      { code: 'CS 3105', mark: 'INC' },
      { code: 'MATH 101', mark: 'INC' },
      { code: 'PE 2', mark: 'INC' },
    ])
    expect(formatGwa(result.gwa)).toBe('—')
  })

  it('returns null for an empty term', () => {
    const result = computeGwa([])
    expect(result.gwa).toBeNull()
    expect(result.excludedCourses).toEqual([])
  })

  it('equals the grade itself when there is a single course', () => {
    expect(computeGwa([graded('CS 3105', 3, 2.25)]).gwa).toBe(2.25)
    expect(computeGwa([graded('CS 3105', 1, 1.0)]).gwa).toBe(1.0)
    expect(computeGwa([graded('CS 3105', 6, 5.0)]).gwa).toBe(5.0)
  })

  it('reports when a projection is mixed in', () => {
    const withProjection = computeGwa([
      graded('CS 3105', 3, 1.25),
      { ...graded('MATH 101', 3, 2.0), isProjected: true },
    ])
    expect(withProjection.includesProjection).toBe(true)
    expect(computeGwa([graded('CS 3105', 3, 1.25)]).includesProjection).toBe(false)
  })
})

describe('planWhatIf', () => {
  it('reports a target below the best possible as unreachable, with the best possible', () => {
    const plan = planWhatIf({
      target: 1.0,
      graded: [graded('CS 3105', 3, 3.0)],
      ungraded: [{ enrollmentId: 'e2', code: 'MATH 101', units: 3 }],
    })

    // 3.00 is already banked over 3 units; 1.00 in the remaining 3 units gives
    // (9 + 3) / 6 = 2.00 at best, so a 1.00 target cannot be reached.
    expect(plan.verdict).toBe('unreachable')
    expect(plan.bestPossible).toBeCloseTo(2.0, 10)
    expect(plan.requiredUniform).toBeCloseTo(-1.0, 10)
    expect(plan.requiredAchievable).toBeNull()
    expect(plan.blockingPins).toEqual([])
    expect(plan.explanation).toContain('2.00')
  })

  it('reports a target reachable even while failing everything as guaranteed', () => {
    const plan = planWhatIf({
      target: 3.0,
      graded: [graded('CS 3105', 3, 1.0)],
      ungraded: [{ enrollmentId: 'e2', code: 'MATH 101', units: 3 }],
    })

    // Worst case is (3 + 15) / 6 = 3.00, which still clears the 3.00 target.
    expect(plan.verdict).toBe('guaranteed')
    expect(plan.worstPossible).toBeCloseTo(3.0, 10)
    expect(plan.requiredAchievable).toBe(GRADE_LOWEST)
    expect(plan.explanation).toContain('no matter what')
  })

  it('stays guaranteed with room to spare', () => {
    const plan = planWhatIf({
      target: 3.5,
      graded: [graded('CS 3105', 3, 1.0)],
      ungraded: [{ enrollmentId: 'e2', code: 'MATH 101', units: 3 }],
    })
    expect(plan.verdict).toBe('guaranteed')
    expect(plan.worstPossible as number).toBeLessThan(3.5)
  })

  it('names the pin responsible when a pinned grade is what makes the target impossible', () => {
    const plan = planWhatIf({
      target: 2.0,
      graded: [graded('CS 3105', 3, 1.5)],
      ungraded: [
        { enrollmentId: 'e2', code: 'PHYS 101', units: 3, pinnedValue: 4.0 },
        { enrollmentId: 'e3', code: 'MATH 101', units: 3 },
      ],
    })

    // Needed uniform is 0.50 — below 1.00, so impossible. Released from the
    // 4.00 pin the same target needs only 2.25, so the pin is the cause.
    expect(plan.verdict).toBe('blocked_by_pin')
    expect(plan.blockingPins).toEqual(['PHYS 101'])
    expect(plan.requiredUniform).toBeCloseTo(0.5, 10)
    expect(plan.explanation).toContain('PHYS 101')
    expect(plan.explanation).toContain('2.25')
  })

  it('is reachable once that pin is released', () => {
    const plan = planWhatIf({
      target: 2.0,
      graded: [graded('CS 3105', 3, 1.5)],
      ungraded: [
        { enrollmentId: 'e2', code: 'PHYS 101', units: 3 },
        { enrollmentId: 'e3', code: 'MATH 101', units: 3 },
      ],
    })

    // (2.00 × 9 − 4.5) / 6 = 2.25 in each of the two remaining subjects.
    expect(plan.verdict).toBe('reachable')
    expect(plan.requiredUniform).toBeCloseTo(2.25, 10)
    expect(plan.requiredAchievable).toBe(2.25)
    expect(plan.blockingPins).toEqual([])
    expect(plan.explanation).toContain('2.25')
  })

  it('blames no pin when the graded courses alone put the target out of reach', () => {
    const plan = planWhatIf({
      target: 1.0,
      graded: [graded('CS 3105', 3, 3.0)],
      ungraded: [
        { enrollmentId: 'e2', code: 'PHYS 101', units: 3, pinnedValue: 1.0 },
        { enrollmentId: 'e3', code: 'MATH 101', units: 3 },
      ],
    })
    expect(plan.verdict).toBe('unreachable')
    expect(plan.blockingPins).toEqual([])
  })

  it('names every blocking pin when there is more than one', () => {
    const plan = planWhatIf({
      target: 2.0,
      graded: [graded('CS 3105', 3, 1.5)],
      ungraded: [
        { enrollmentId: 'e2', code: 'PHYS 101', units: 3, pinnedValue: 4.0 },
        { enrollmentId: 'e3', code: 'CHEM 101', units: 3, pinnedValue: 4.0 },
        { enrollmentId: 'e4', code: 'MATH 101', units: 3 },
      ],
    })
    expect(plan.verdict).toBe('blocked_by_pin')
    expect(plan.blockingPins).toEqual(['PHYS 101', 'CHEM 101'])
    expect(plan.explanation).toContain('PHYS 101 and CHEM 101')
  })

  it('rounds the requirement down to a grade that actually exists', () => {
    const plan = planWhatIf({
      target: 1.9,
      graded: [graded('CS 3105', 3, 1.5)],
      ungraded: [{ enrollmentId: 'e2', code: 'MATH 101', units: 3 }],
    })
    // (1.90 × 6 − 4.5) / 3 = 2.30, but 2.30 is not on the scale; the achievable
    // grade must be the next better one, never a rounded-up 2.50.
    expect(plan.requiredUniform).toBeCloseTo(2.3, 10)
    expect(plan.requiredAchievable).toBe(2.25)
  })

  it('settles the verdict from the pins alone when nothing is left open', () => {
    const met = planWhatIf({
      target: 2.0,
      graded: [graded('CS 3105', 3, 1.5)],
      ungraded: [{ enrollmentId: 'e2', code: 'MATH 101', units: 3, pinnedValue: 2.0 }],
    })
    expect(met.verdict).toBe('already_met')
    expect(met.blockingPins).toEqual([])
    expect(met.explanation).toContain('1.75')

    const missed = planWhatIf({
      target: 1.5,
      graded: [graded('CS 3105', 3, 1.5)],
      ungraded: [{ enrollmentId: 'e2', code: 'MATH 101', units: 3, pinnedValue: 3.0 }],
    })
    expect(missed.verdict).toBe('blocked_by_pin')
    expect(missed.blockingPins).toEqual(['MATH 101'])
  })

  it('says there is nothing to plan against when there are no units at all', () => {
    const plan = planWhatIf({ target: 2.0, graded: [], ungraded: [] })
    expect(plan.verdict).toBe('nothing_left')
    expect(plan.requiredUniform).toBeNull()
    expect(plan.bestPossible).toBeNull()
    expect(plan.currentGwa).toBeNull()
  })

  it('brackets every outcome between the best and the worst possible', () => {
    const plan = planWhatIf({
      target: 2.0,
      graded: [graded('CS 3105', 3, 1.5)],
      ungraded: [{ enrollmentId: 'e2', code: 'MATH 101', units: 3 }],
    })
    expect(plan.bestPossible as number).toBeLessThan(plan.worstPossible as number)
    expect(plan.bestPossible).toBeGreaterThanOrEqual(GRADE_HIGHEST)
    expect(plan.worstPossible).toBeLessThanOrEqual(GRADE_LOWEST)
  })
})

describe('maximumAllowableGrade', () => {
  it('is the worst grade that still clears the target', () => {
    expect(
      maximumAllowableGrade({
        target: 2.0,
        graded: [graded('CS 3105', 3, 1.5)],
        ungraded: [
          { enrollmentId: 'e2', code: 'PHYS 101', units: 3 },
          { enrollmentId: 'e3', code: 'MATH 101', units: 3 },
        ],
      }),
    ).toBe(2.25)
  })

  it('is 5.00 when the target cannot be missed and null when it cannot be met', () => {
    expect(
      maximumAllowableGrade({
        target: 3.5,
        graded: [graded('CS 3105', 3, 1.0)],
        ungraded: [{ enrollmentId: 'e2', code: 'MATH 101', units: 3 }],
      }),
    ).toBe(5.0)

    expect(
      maximumAllowableGrade({
        target: 1.0,
        graded: [graded('CS 3105', 3, 3.0)],
        ungraded: [{ enrollmentId: 'e2', code: 'MATH 101', units: 3 }],
      }),
    ).toBeNull()
  })
})

describe('computeComponentStanding', () => {
  const components = [
    { label: 'Quizzes', weightPct: 30, scorePct: 70, isComplete: true },
    { label: 'Midterm', weightPct: 30, scorePct: 60, isComplete: true },
    { label: 'Finals', weightPct: 40, scorePct: null, isComplete: false },
  ]

  it('averages over completed weight only', () => {
    // (70×30 + 60×30) / 60 = 3900 / 60 = 65
    const standing = computeComponentStanding(components, null)
    expect(standing.currentStanding).toBeCloseTo(65, 10)
    expect(standing.completedWeight).toBe(60)
    expect(standing.remainingWeight).toBe(40)
    expect(standing.weightsSumTo).toBe(100)
    expect(standing.requiredOnRemaining).toBeNull()
    expect(standing.requiresImpossibleScore).toBe(false)
  })

  it('computes what the remaining weight has to carry', () => {
    // (75×100 − 3900) / 40 = 3600 / 40 = 90
    const standing = computeComponentStanding(components, 75)
    expect(standing.requiredOnRemaining).toBeCloseTo(90, 10)
    expect(standing.requiresImpossibleScore).toBe(false)
  })

  it('flags a target that needs more than 100% on what remains', () => {
    // (90×100 − 3900) / 40 = 5100 / 40 = 127.5
    const standing = computeComponentStanding(components, 90)
    expect(standing.requiredOnRemaining).toBeCloseTo(127.5, 10)
    expect(standing.requiresImpossibleScore).toBe(true)
  })

  it('does not divide by zero when nothing is complete', () => {
    const standing = computeComponentStanding(
      [{ label: 'Finals', weightPct: 100, scorePct: null, isComplete: false }],
      80,
    )
    expect(standing.currentStanding).toBeNull()
    expect(standing.completedWeight).toBe(0)
    expect(standing.requiredOnRemaining).toBeCloseTo(80, 10)
  })

  it('does not divide by zero when nothing remains', () => {
    const standing = computeComponentStanding(
      [{ label: 'Finals', weightPct: 100, scorePct: 88, isComplete: true }],
      80,
    )
    expect(standing.remainingWeight).toBe(0)
    expect(standing.requiredOnRemaining).toBeNull()
    expect(standing.requiresImpossibleScore).toBe(false)
    expect(standing.currentStanding).toBeCloseTo(88, 10)
  })

  it('reports weights that do not add up to 100 rather than normalising them', () => {
    const standing = computeComponentStanding(
      [
        { label: 'Quizzes', weightPct: 30, scorePct: 80, isComplete: true },
        { label: 'Midterm', weightPct: 40, scorePct: null, isComplete: false },
      ],
      null,
    )
    expect(standing.weightsSumTo).toBe(70)
  })

  it('carries a bonus score above 100 straight through', () => {
    const standing = computeComponentStanding(
      [{ label: 'Quizzes', weightPct: 100, scorePct: 105, isComplete: true }],
      null,
    )
    expect(standing.currentStanding).toBeCloseTo(105, 10)
  })
})

describe('evaluateThreshold', () => {
  const threshold: Threshold = {
    id: 't1',
    label: 'Keep Latin honours in reach',
    comparator: '<=',
    value: 2.0,
    lastState: null,
  }

  it('is clear while both the current and the projected GWA sit at or below it', () => {
    expect(evaluateThreshold(threshold, 1.75, 1.9)).toBe('clear')
    // At exactly the value, an inverted-scale '<=' still clears.
    expect(evaluateThreshold(threshold, 2.0, 2.0)).toBe('clear')
    expect(evaluateThreshold(threshold, 1.75, null)).toBe('clear')
  })

  it('is at risk while it still clears but the projection does not', () => {
    // The moment worth telling a student about, because it is still fixable.
    expect(evaluateThreshold(threshold, 1.75, 2.3)).toBe('at_risk')
  })

  it('is breached once the current GWA misses it', () => {
    expect(evaluateThreshold(threshold, 2.25, 2.25)).toBe('breached')
    expect(evaluateThreshold(threshold, 2.25, 1.5)).toBe('breached')
  })

  it('is clear when there is nothing graded to judge yet', () => {
    expect(evaluateThreshold(threshold, null, 4.0)).toBe('clear')
  })

  it('reads a >= threshold the other way round', () => {
    const atLeast: Threshold = { ...threshold, comparator: '>=', value: 3.0 }
    expect(evaluateThreshold(atLeast, 3.5, 3.5)).toBe('clear')
    expect(evaluateThreshold(atLeast, 3.5, 2.5)).toBe('at_risk')
    expect(evaluateThreshold(atLeast, 2.5, 2.5)).toBe('breached')
  })
})

describe('shouldNotifyThreshold', () => {
  it('fires on a transition to a worse state', () => {
    expect(shouldNotifyThreshold(null, 'at_risk')).toBe(true)
    expect(shouldNotifyThreshold('clear', 'at_risk')).toBe(true)
    expect(shouldNotifyThreshold('clear', 'breached')).toBe(true)
    expect(shouldNotifyThreshold('at_risk', 'breached')).toBe(true)
  })

  it('stays quiet while the state holds steady', () => {
    expect(shouldNotifyThreshold('at_risk', 'at_risk')).toBe(false)
    expect(shouldNotifyThreshold('breached', 'breached')).toBe(false)
  })

  it('stays quiet on recovery', () => {
    expect(shouldNotifyThreshold('breached', 'at_risk')).toBe(false)
    expect(shouldNotifyThreshold('breached', 'clear')).toBe(false)
    expect(shouldNotifyThreshold('at_risk', 'clear')).toBe(false)
    expect(shouldNotifyThreshold(null, 'clear')).toBe(false)
  })

  it('fires exactly once across a run that crosses and then holds', () => {
    const timeline: Array<'clear' | 'at_risk' | 'breached'> = [
      'clear',
      'at_risk',
      'at_risk',
      'at_risk',
    ]
    let previous: 'clear' | 'at_risk' | 'breached' | null = null
    let fired = 0
    for (const state of timeline) {
      if (shouldNotifyThreshold(previous, state)) fired++
      previous = state
    }
    expect(fired).toBe(1)
  })
})
