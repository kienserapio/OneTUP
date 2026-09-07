import { describe, expect, it } from 'vitest'
import {
  CAMPUSES,
  CAMPUS_LABEL,
  campusOf,
  formatSectionCode,
  parseSectionCode,
  parseSectionParts,
} from '@onetup/core'

describe('parseSectionCode — the four spellings', () => {
  /**
   * The reason this module exists. A section typed four ways by four students
   * must produce one classroom, or the first day of the feature creates four.
   */
  const spellings = ['BSCS-4B-M', 'BSCS 4B-M', 'bscs-4b m', 'BSCS4B M']

  it.each(spellings)('canonicalises %s to BSCS-4B-M', (raw) => {
    expect(parseSectionCode(raw)?.canonical).toBe('BSCS-4B-M')
  })

  it('agrees on every field, not merely on the canonical string', () => {
    const parsed = spellings.map((raw) => parseSectionCode(raw))
    for (const one of parsed) {
      expect(one).toEqual({
        program: 'BSCS',
        year: 4,
        block: 'B',
        campus: 'M',
        canonical: 'BSCS-4B-M',
      })
    }
  })

  it('reads a unicode hyphen the same as an ASCII one', () => {
    // U+2011, which is what a phone keyboard and a pasted PDF both produce.
    expect(parseSectionCode('BSCS‑4B‑M')?.canonical).toBe('BSCS-4B-M')
  })

  it('ignores leading and trailing space', () => {
    expect(parseSectionCode('   BSCS-4B-M  ')?.canonical).toBe('BSCS-4B-M')
  })
})

describe('parseSectionCode — the campus letter', () => {
  it.each(CAMPUSES)('accepts %s', (campus) => {
    const parsed = parseSectionCode(`BSCS-4B-${campus}`)
    expect(parsed?.campus).toBe(campus)
    expect(parsed?.canonical).toBe(`BSCS-4B-${campus}`)
  })

  it('rejects a fifth campus letter rather than guessing at it', () => {
    expect(parseSectionCode('BSCS-4B-X')).toBeNull()
  })

  /**
   * Without the letter there is no way to tell Manila's BSCS-4B from Taguig's,
   * and merging them is the one mistake this feature cannot recover from.
   */
  it('rejects a code with no campus at all', () => {
    expect(parseSectionCode('BSCS-4B')).toBeNull()
  })
})

describe('parseSectionCode — what it refuses', () => {
  it('rejects a missing block', () => {
    expect(parseSectionCode('BSCS-4-M')).toBeNull()
  })

  it('rejects a year outside 1 to 6', () => {
    expect(parseSectionCode('BSCS-8B-M')).toBeNull()
    expect(parseSectionCode('BSCS-0B-M')).toBeNull()
  })

  it('rejects a two-character block rather than dropping one of them', () => {
    expect(parseSectionCode('BSCS-4B1-M')).toBeNull()
  })

  it.each(['', '   ', 'hello', '4B-M', 'B-4B-M', '1234', 'BSCS'])(
    'returns null for %j rather than a guess',
    (junk) => {
      expect(parseSectionCode(junk)).toBeNull()
    },
  )
})

describe('parseSectionCode — the shapes TUP actually writes', () => {
  it('reads a numeric block', () => {
    expect(parseSectionCode('BSIT-3-1-M')?.canonical).toBe('BSIT-31-M')
  })

  it('reads a long program code', () => {
    expect(parseSectionCode('BTVTED-2A-T')).toEqual({
      program: 'BTVTED',
      year: 2,
      block: 'A',
      campus: 'T',
      canonical: 'BTVTED-2A-T',
    })
  })
})

describe('formatSectionCode', () => {
  it('round-trips a parsed code', () => {
    const parsed = parseSectionCode('bscs 4b m')!
    expect(formatSectionCode(parsed)).toBe(parsed.canonical)
    expect(parseSectionCode(formatSectionCode(parsed))).toEqual(parsed)
  })
})

describe('campusOf', () => {
  it('maps the profiles.campus word to a letter', () => {
    expect(campusOf('manila')).toBe('M')
    expect(campusOf('Taguig')).toBe('T')
  })

  it('passes a letter straight through', () => {
    expect(campusOf('V')).toBe('V')
  })

  it('returns null for an unknown campus rather than defaulting to Manila', () => {
    expect(campusOf('quezon city')).toBeNull()
    expect(campusOf(null)).toBeNull()
    expect(campusOf('')).toBeNull()
  })

  it('has a label for every campus in the enum', () => {
    for (const campus of CAMPUSES) {
      expect(CAMPUS_LABEL[campus]).toBeTruthy()
    }
  })
})

describe('parseSectionParts — the lenient read, for pre-filling a form', () => {
  /**
   * `profiles.section_label` was free text long before classrooms existed, and
   * almost none of the values already stored carry a campus letter. Refusing to
   * read them would make every returning student retype a section the app has
   * had on file all along.
   */
  it('reads a label with no campus, which is what most profiles hold', () => {
    expect(parseSectionParts('BSCS 4-B')).toEqual({
      program: 'BSCS',
      year: 4,
      block: 'B',
      campus: null,
    })
  })

  it('still reads the campus when the label has one', () => {
    expect(parseSectionParts('BSCS-4B-M')?.campus).toBe('M')
  })

  it('is the same reader underneath, so junk is still junk', () => {
    expect(parseSectionParts('hello')).toBeNull()
    expect(parseSectionParts('BSCS-8B')).toBeNull()
  })

  it('does not let a campus-less label become a stored code', () => {
    expect(parseSectionParts('BSCS 4-B')).not.toBeNull()
    expect(parseSectionCode('BSCS 4-B')).toBeNull()
  })
})
