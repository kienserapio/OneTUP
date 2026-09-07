import { describe, expect, it } from 'vitest'
import { ADVISORY_SCOPES, advisoryForToday } from '../src/suspensions/advisory'

/**
 * Which notice reaches the screen.
 *
 * The failure being pinned down is a stack of three cards about one typhoon —
 * the national announcement, the NCR one and the city's — which makes one true
 * fact look like three separate emergencies on the morning a student is least
 * able to read carefully.
 */

const advisory = (scope: string, effective_on: string, created_at = '2026-09-07T05:40:00Z') => ({
  scope,
  effective_on,
  created_at,
})

describe('advisoryForToday', () => {
  it('returns nothing when nothing was announced', () => {
    expect(advisoryForToday([], '2026-09-07')).toBeNull()
  })

  it('shows an advisory on the day it applies', () => {
    const today = advisory('city', '2026-09-07')
    expect(advisoryForToday([today], '2026-09-07')).toBe(today)
  })

  /* A notice about yesterday is history. The card would be claiming the present
   * tense about a day that is over. */
  it('ignores yesterday', () => {
    expect(advisoryForToday([advisory('city', '2026-09-06')], '2026-09-07')).toBeNull()
  })

  /* And tomorrow's is withheld for the mirror reason: a student who acts on it
   * a day early marks the wrong sessions cancelled. */
  it('ignores tomorrow', () => {
    expect(advisoryForToday([advisory('city', '2026-09-08')], '2026-09-07')).toBeNull()
  })

  describe('when several apply to the same day', () => {
    it('shows exactly one', () => {
      const result = advisoryForToday(
        [
          advisory('national', '2026-09-07'),
          advisory('ncr', '2026-09-07'),
          advisory('city', '2026-09-07'),
        ],
        '2026-09-07',
      )
      expect(result).not.toBeNull()
      expect(result?.scope).toBe('city')
    })

    it('lets the university outrank every civil authority', () => {
      const result = advisoryForToday(
        [
          advisory('city', '2026-09-07'),
          advisory('university', '2026-09-07'),
          advisory('national', '2026-09-07'),
        ],
        '2026-09-07',
      )
      expect(result?.scope).toBe('university')
    })

    it('prefers the narrowest scope regardless of input order', () => {
      const rows = ADVISORY_SCOPES.map((scope) => advisory(scope, '2026-09-07'))
      expect(advisoryForToday(rows, '2026-09-07')?.scope).toBe('university')
      expect(advisoryForToday([...rows].reverse(), '2026-09-07')?.scope).toBe('university')
    })

    it('takes the latest word when two share a scope', () => {
      const early = advisory('city', '2026-09-07', '2026-09-07T05:00:00Z')
      const late = advisory('city', '2026-09-07', '2026-09-07T09:30:00Z')
      expect(advisoryForToday([early, late], '2026-09-07')).toBe(late)
      expect(advisoryForToday([late, early], '2026-09-07')).toBe(late)
    })

    it('does not choke on a scope it has never heard of', () => {
      const known = advisory('city', '2026-09-07')
      const strange = advisory('barangay', '2026-09-07')
      expect(advisoryForToday([strange, known], '2026-09-07')).toBe(known)
      // And an unknown scope alone is still better than showing nothing.
      expect(advisoryForToday([strange], '2026-09-07')).toBe(strange)
    })
  })

  it('does not mutate what it was handed', () => {
    const rows = [advisory('national', '2026-09-07'), advisory('university', '2026-09-07')]
    advisoryForToday(rows, '2026-09-07')
    expect(rows.map((r) => r.scope)).toEqual(['national', 'university'])
  })
})
