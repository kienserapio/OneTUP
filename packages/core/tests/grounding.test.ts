import { describe, expect, it } from 'vitest'
import { unsupportedNumbers } from '../src/text/grounding'

/**
 * The guard that makes tool use safe.
 *
 * ADR-007 says a model may phrase a number and never produce one. That was free
 * while the assistant returned one template's sentence verbatim. The moment it
 * is allowed to compose two results, it can also quietly add a third figure
 * that nothing computed — and a fabricated cut count reads exactly like a real
 * one, in the same typeface, on the screen a student plans a semester from.
 */

describe('unsupportedNumbers', () => {
  it('passes an answer with no numbers at all', () => {
    expect(unsupportedNumbers('You are fine on attendance.', [])).toEqual([])
  })

  it('passes figures that came from the lookups', () => {
    const sources = ['You have 2 absences left out of 9 in CS 2103.']
    expect(unsupportedNumbers('Two left — 2 of 9 used in CS 2103.', sources)).toEqual([])
  })

  it('passes a figure the student themselves supplied', () => {
    const sources = ['Your GWA is 1.85.', 'What do I need to reach 1.75?']
    expect(unsupportedNumbers('To reach 1.75 from 1.85 you need better marks.', sources)).toEqual([])
  })

  /** The failure this whole file exists for. */
  it('catches a figure nothing computed', () => {
    const sources = ['You have 2 absences left out of 9.']
    expect(unsupportedNumbers('You have 2 left, so you can miss 4 more weeks.', sources)).toEqual([4])
  })

  it('catches an invented figure among supported ones', () => {
    const sources = ['You have 2 absences left out of 9.', 'Your next class is CS 2103 at 08:00.']
    const invented = unsupportedNumbers(
      'You have 2 of 9 used and CS 2103 is at 08:00, which is 30 minutes from now.',
      sources,
    )
    expect(invented).toEqual([30])
  })

  /**
   * A rounding the student did not ask for, on a figure they may act on. 1.8 is
   * not 1.75 — and the app states the number it computed.
   */
  it('catches a rounded figure as unsupported', () => {
    expect(unsupportedNumbers('Your GWA is about 1.8.', ['Your GWA is 1.75.'])).toEqual([1.8])
  })

  it('treats trailing zeros as the same claim', () => {
    expect(unsupportedNumbers('That is ₱24.00.', ['fare_student: 24'])).toEqual([])
    expect(unsupportedNumbers('Your GWA is 2.5.', ['gwa: 2.50'])).toEqual([])
  })

  it('reads a number written with thousands separators', () => {
    expect(unsupportedNumbers('That is 1,200 pesos.', ['total: 1200'])).toEqual([])
  })

  it('reads figures out of a JSON blob of values', () => {
    const sources = [JSON.stringify({ remaining: 2, allowed: 9, used: 7 })]
    expect(unsupportedNumbers('7 of your 9 are used, so 2 are left.', sources)).toEqual([])
  })

  it('reports each invented figure once', () => {
    const invented = unsupportedNumbers('It is 5 and 5 and 5.', ['nothing here'])
    expect(invented).toEqual([5])
  })

  it('handles a percentage and a peso sign without tripping on the symbols', () => {
    expect(unsupportedNumbers('That is 85% for ₱24.00.', ['score 85', 'fare 24'])).toEqual([])
  })

  it('catches a course code whose number appears nowhere in the lookups', () => {
    expect(unsupportedNumbers('MATH 2103 is fine.', ['CS 1101 is fine.'])).toEqual([2103])
  })

  /**
   * A known limit, written down rather than left to be discovered.
   *
   * This checks quantities, not words. "MATH 2103" against a lookup about "CS
   * 2103" passes, because 2103 is present — the subject was swapped, not the
   * number. Catching that needs entity checking, which is a different and much
   * larger problem; what this guarantees is narrower and worth more: no figure
   * in the answer was conjured out of nothing.
   */
  it('does not catch a swapped subject that shares a course number', () => {
    expect(unsupportedNumbers('MATH 2103 is fine.', ['CS 2103 is fine.'])).toEqual([])
  })

  it('handles a negative figure', () => {
    expect(unsupportedNumbers('You are 3 over the limit.', ['over_by: -3'])).toEqual([3])
    expect(unsupportedNumbers('You are -3 over.', ['over_by: -3'])).toEqual([])
  })

  it('does not fall over on an empty answer or empty sources', () => {
    expect(unsupportedNumbers('', ['1 2 3'])).toEqual([])
    expect(unsupportedNumbers('There are 4.', [])).toEqual([4])
  })

  /**
   * Deliberately permissive in one direction: a number that appears anywhere in
   * the sources counts. Proving a model rearranged figures *correctly* is a far
   * harder problem than proving it did not invent one, and inventing one is the
   * failure that matters.
   */
  it('does not attempt to check that figures were used in the right place', () => {
    const sources = ['You have 2 absences left out of 9.']
    expect(unsupportedNumbers('You have 9 absences left out of 2.', sources)).toEqual([])
  })
})
