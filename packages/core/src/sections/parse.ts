/**
 * Block-section codes.
 *
 * `BSCS 4B-M`, `bscs-4b m`, `BSCS‑4B‑M` and `BSCS-4B-M` are one section typed
 * four ways. Free text here produces four classrooms and the feature fails on
 * day one, so every code entering the database goes through this module first
 * and is stored in exactly one form.
 *
 * Two decisions carry the whole thing:
 *
 *   1. **The campus letter is required.** Manila's `BSCS-4B-M` and Taguig's
 *      `BSCS-4B-T` are different cohorts who must never land in the same
 *      classroom. A code without it is not under-specified, it is wrong, so it
 *      is rejected rather than defaulted.
 *   2. **Nothing is guessed.** Anything that does not match returns `null`.
 *      A near-miss silently corrected into a real section is how a student ends
 *      up reading another class's deadlines.
 *
 * Pure, dependency-free, and shared by the create form, the join screen and the
 * migration that canonicalises `profiles.section_label`.
 */

/** M Manila, T Taguig, C Cavite, V Visayas. A closed set, deliberately. */
export const CAMPUSES = ['M', 'T', 'C', 'V'] as const

export type Campus = (typeof CAMPUSES)[number]

export const CAMPUS_LABEL: Record<Campus, string> = {
  M: 'Manila',
  T: 'Taguig',
  C: 'Cavite',
  V: 'Visayas',
}

export interface SectionCode {
  /** 'BSCS' — the program, always letters. */
  program: string
  /** 1–6. A seventh year is a typo, not a year level. */
  year: number
  /** 'B' — one character, letter or digit, because TUP writes both. */
  block: string
  campus: Campus
  /** 'BSCS-4B-M' — the only form ever written to the database. */
  canonical: string
}

/**
 * Program, year, block, and optionally campus, with every separator gone.
 *
 * The year being numeric and the campus being a closed set is what makes this
 * unambiguous without separators: `BSCS4BM` can only split one way.
 */
const COMPACT = /^([A-Z]{2,10})([1-6])([A-Z0-9])([MTCV])?$/

/** Uppercase, and strip everything that is not a letter or a digit. */
function compact(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** What a code says, with the campus left null when it does not say. */
export interface SectionParts {
  program: string
  year: number
  block: string
  campus: Campus | null
}

/**
 * The lenient read, for pre-filling a form.
 *
 * `profiles.section_label` predates this feature and was free text, so most of
 * the ones already stored read `BSCS 4-B` with no campus at all. Refusing to
 * read them would leave a student retyping a section the app already knows —
 * so the parts are recovered here, and the campus comes from their profile.
 *
 * Nothing is stored from this. A code only reaches the database through
 * `parseSectionCode`, which still insists on the campus letter.
 */
export function parseSectionParts(raw: string): SectionParts | null {
  if (!raw) return null

  const match = COMPACT.exec(compact(raw))
  if (!match) return null

  const [, program, year, block, campus] = match

  return {
    program,
    year: Number(year),
    block,
    campus: (campus as Campus | undefined) ?? null,
  }
}

/** The strict read: a code with no campus letter is not a section. */
export function parseSectionCode(raw: string): SectionCode | null {
  const parts = parseSectionParts(raw)
  if (!parts || !parts.campus) return null

  return {
    program: parts.program,
    year: parts.year,
    block: parts.block,
    campus: parts.campus,
    canonical: `${parts.program}-${parts.year}${parts.block}-${parts.campus}`,
  }
}

export function formatSectionCode(parsed: SectionCode): string {
  return `${parsed.program}-${parsed.year}${parsed.block}-${parsed.campus}`
}

/**
 * The campus letter for a `profiles.campus` value.
 *
 * That column holds a word (`'manila'`, defaulted in `003`) while a section
 * code holds a letter, and the create form has to pre-fill one from the other.
 * A letter is accepted too, so a caller does not have to know which shape it is
 * holding.
 */
export function campusOf(raw: string | null | undefined): Campus | null {
  if (!raw) return null

  const value = raw.trim().toUpperCase()
  if ((CAMPUSES as readonly string[]).includes(value)) return value as Campus

  for (const letter of CAMPUSES) {
    if (CAMPUS_LABEL[letter].toUpperCase() === value) return letter
  }
  return null
}
