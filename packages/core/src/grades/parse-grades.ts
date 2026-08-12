import type { NonNumericMark } from './gwa'

/**
 * Reading the TUP ERS grades page.
 *
 * This parser is written against the real page rather than against a guess at
 * it, which is the whole reason it can be this direct. The page stacks every
 * semester the student has ever taken, newest first, and each one is the same
 * five things:
 *
 *     SCHOOL YEAR   2526        Term   Second
 *     Admission Status          Scholastic Status   Irregular
 *     Course Code   BSCS        Course Description  Bachelor of Science …
 *     GPA (excludes NSTP and subjects with non-numeric ratings)   1.52
 *     #  Subject Code  Description  Faculty Name  Units  Section  FINAL GRADE  Grade Status
 *     1  CC303-M       Methods of …  MONTESINES…    3     BSCS-3B-M  1.25      Passed
 *
 * Three things about that are worth knowing before reading the code:
 *
 * 1. **The columns are named.** So they are read by name, from the header row,
 *    not by position — the one form of robustness that costs nothing and
 *    survives a column being inserted.
 *
 * 2. **The current term has no grades yet.** Its grade column is headed
 *    `AVERAGE` rather than `FINAL GRADE` and every cell reads `PLEASE EVALUATE
 *    FIRST` until the student completes the faculty evaluation. Those rows are
 *    subjects, not failures, and they are kept as pending rather than dropped.
 *
 * 3. **The page states its own GPA per semester, and it is not a plain
 *    average.** It excludes NSTP and any non-numeric rating, as its own label
 *    says. Verified against all six of a real student's semesters: including
 *    NSTP gives 1.82 and 1.75 where the page says 1.89 and 1.82. That rule is
 *    encoded in `computeTermGpa`, and the page's own figure is carried through
 *    besides, so the two can be checked against each other rather than trusted.
 */

export const GRADE_PARSER_VERSION = 'ers-grades-2.0.0'

export interface GradeParserConfig {
  version: string
  /** A data row carries at least a number, a code, a title and a grade. */
  minimumCells: number
}

export const DEFAULT_GRADE_PARSER_CONFIG: GradeParserConfig = {
  version: GRADE_PARSER_VERSION,
  minimumCells: 6,
}

export interface ParsedGrade {
  code: string
  title: string
  faculty: string | null
  section: string | null
  units: number | null
  /** null when the row carries a non-numeric rating instead of a number. */
  value: number | null
  mark: NonNumericMark | null
  /**
   * True when ERS is withholding the grade until the faculty evaluation is
   * done. Not a mark and not a failure — the subject is enrolled and ungraded.
   */
  pending: boolean
  /** What the grade cell actually said, when it was not a number. */
  rawGrade: string | null
  /** `Passed`, `Failed`, or whatever the page printed in Grade Status. */
  status: string | null
  termLabel: string | null
  /** `2025-2026-2`, derived from `SCHOOL YEAR 2526` + `Term Second`. */
  termCode: string | null
  cells: string[]
}

export type GradeRowReason = 'row_short' | 'no_course_code' | 'no_columns' | 'no_term'

export interface UnparsedGradeRow {
  cells: string[]
  reason: GradeRowReason
}

export interface ParsedTerm {
  code: string | null
  label: string
  /** `2526` exactly as the page prints it. */
  schoolYear: string | null
  /** `First`, `Second`, `Summer`. */
  term: string | null
  courseCount: number
  /** The GPA the page printed for this semester, or null if it printed none. */
  statedGpa: number | null
  /** The same figure recomputed from the rows, by the page's own stated rule. */
  computedGpa: number | null
  /** True when the semester's grades are still behind the faculty evaluation. */
  pending: boolean
}

export interface GradeParseResult {
  parserVersion: string
  courses: ParsedGrade[]
  unparsed: UnparsedGradeRow[]
  warnings: string[]
  terms: ParsedTerm[]
}

// --- Cells ----------------------------------------------------------------

function clean(cell: string | undefined): string {
  return (cell ?? '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** TUP grades run 1.00 (highest) to 5.00 (failing), in quarter steps. */
const GRADE_VALUE = /^[1-5](?:\.\d{1,2})?$/

export function gradeValueOf(cell: string): number | null {
  const text = clean(cell)
  if (!GRADE_VALUE.test(text)) return null
  const value = Number(text)
  return value >= 1 && value <= 5 ? value : null
}

const MARKS: Record<string, NonNumericMark> = {
  INC: 'INC',
  DRP: 'DRP',
  DROPPED: 'DRP',
  W: 'W',
  WITHDRAWN: 'W',
  P: 'P',
  PASSED: 'P',
  NP: 'NP',
  FAILED: 'NP',
}

export function markOf(cell: string): NonNumericMark | null {
  const text = clean(cell).toUpperCase().replace(/[.\s]+$/, '')
  return MARKS[text] ?? null
}

/** ERS withholds a grade behind the faculty evaluation with this exact phrase. */
const PENDING = /please\s+evaluate/i

export function isPending(cell: string): boolean {
  return PENDING.test(clean(cell))
}

/**
 * NSTP is excluded from the GPA by the page's own rule, and the rule is applied
 * on the *code* rather than the title because the title varies ("National
 * Service Training Program 1", "NSTP 1") while `NSTP1-M` does not.
 */
export function isExcludedFromGpa(code: string): boolean {
  return /^NSTP/i.test(clean(code))
}

// --- The header row -------------------------------------------------------

export interface GradeColumns {
  index: number | null
  code: number
  title: number | null
  faculty: number | null
  units: number | null
  section: number | null
  grade: number
  status: number | null
}

/**
 * Column positions, read from the header row by name.
 *
 * `FINAL GRADE` on a finished semester and `AVERAGE` on the current one are the
 * same column wearing two labels, so both are accepted — and so is a bare
 * `GRADE`, which is what a third variant would most likely be called.
 */
export function detectGradeColumns(cells: string[]): GradeColumns | null {
  const headers = cells.map((cell) => clean(cell).toLowerCase())
  const find = (test: (header: string) => boolean): number | null => {
    const index = headers.findIndex(test)
    return index === -1 ? null : index
  }

  const code = find((header) => header === 'subject code' || header === 'code')
  const grade = find(
    (header) =>
      header === 'final grade' || header === 'average' || header === 'grade' || header === 'rating',
  )

  // Without these two the row cannot be read at all; everything else is detail.
  if (code === null || grade === null) return null

  return {
    index: find((header) => header === '#' || header === 'no' || header === 'no.'),
    code,
    title: find((header) => header === 'description' || header === 'subject description'),
    faculty: find((header) => header.includes('faculty') || header === 'instructor'),
    units: find((header) => header === 'units' || header === 'unit'),
    section: find((header) => header === 'section'),
    grade,
    status: find((header) => header.includes('status')),
  }
}

// --- The term heading -----------------------------------------------------

export interface TermHeading {
  schoolYear: string
  term: string
  label: string
  code: string | null
}

const TERM_ORDINAL: Record<string, number> = {
  FIRST: 1,
  '1ST': 1,
  SECOND: 2,
  '2ND': 2,
  THIRD: 3,
  '3RD': 3,
  SUMMER: 3,
  MIDYEAR: 3,
  'MID-YEAR': 3,
}

const TERM_NAME: Record<number, string> = { 1: '1st Semester', 2: '2nd Semester', 3: 'Summer' }

/**
 * `SCHOOL YEAR 2526 Term Second` → `2025-2026-2`.
 *
 * The portal writes a school year as the last two digits of each side stuck
 * together, so `2526` is 2025-2026 and `2627` is 2026-2027. Reading it as a
 * single number would put a student's second year in the year 2526.
 */
export function parseTermHeading(cells: string[]): TermHeading | null {
  const text = cells.map(clean).join(' ')
  if (!/school\s*year/i.test(text)) return null

  /* The four-digit-pair form is tried first, and the order is the whole point:
   * `\d{4}` matches the front of `2022-2023` and yields 2020-2021, which is a
   * plausible-looking school year two years off. */
  const year = /school\s*year\s*:?\s*(\d{4}\s*-\s*\d{4}|\d{4})/i.exec(text)
  const term = /\bterm\s*:?\s*([A-Za-z-]+)/i.exec(text)
  if (!year) return null

  const schoolYear = year[1].replace(/\s/g, '')
  const termWord = clean(term?.[1] ?? '')
  const ordinal = TERM_ORDINAL[termWord.toUpperCase()] ?? null

  let startYear: number | null = null
  if (/^\d{4}-\d{4}$/.test(schoolYear)) {
    startYear = Number(schoolYear.slice(0, 4))
  } else if (/^\d{4}$/.test(schoolYear)) {
    // `2526` — two two-digit years, not one four-digit one.
    startYear = 2000 + Number(schoolYear.slice(0, 2))
  }

  const code =
    startYear !== null && ordinal !== null ? `${startYear}-${startYear + 1}-${ordinal}` : null

  const label =
    startYear !== null && ordinal !== null
      ? `${TERM_NAME[ordinal]} AY ${startYear}-${startYear + 1}`
      : `School year ${schoolYear}${termWord ? ` · ${termWord}` : ''}`

  return { schoolYear, term: termWord || null, label, code } as TermHeading
}

/** `GPA (excludes NSTP and subjects with non-numeric ratings)  1.52` */
export function parseGpaRow(cells: string[]): number | null {
  const text = cells.map(clean).join(' ')
  if (!/\bgpa\b|general\s+(weighted\s+)?average/i.test(text)) return null

  // The label itself contains no digits, so the first number after it is the
  // figure — except 0.00, which is what an ungraded semester prints.
  const value = /(\d+\.\d{1,2})\s*$|\b(\d+\.\d{1,2})\b/.exec(text.replace(/non-numeric/i, ''))
  const found = Number(value?.[1] ?? value?.[2])
  return Number.isFinite(found) ? found : null
}

/**
 * The page's own rule, encoded: unit-weighted, NSTP excluded, non-numeric
 * ratings excluded, rounded to two places.
 *
 * Verified against six real semesters — including two where the NSTP exclusion
 * is the difference between agreeing with the page and being 0.07 out.
 */
export function computeTermGpa(courses: readonly ParsedGrade[]): number | null {
  let units = 0
  let weighted = 0

  for (const course of courses) {
    if (course.value === null || course.units === null) continue
    if (isExcludedFromGpa(course.code)) continue
    units += course.units
    weighted += course.units * course.value
  }

  if (units === 0) return null
  return Math.round((weighted / units) * 100) / 100
}

// --- The page -------------------------------------------------------------

const HEADER_WORDS = /^(admission status|scholastic status|course code|course description)$/i

export function parseGradeTable(
  rows: readonly string[][],
  config: GradeParserConfig = DEFAULT_GRADE_PARSER_CONFIG,
): GradeParseResult {
  const courses: ParsedGrade[] = []
  const unparsed: UnparsedGradeRow[] = []
  const warnings: string[] = []
  const terms: ParsedTerm[] = []

  let heading: TermHeading | null = null
  let columns: GradeColumns | null = null
  let current: ParsedTerm | null = null

  for (const raw of rows) {
    const cells = raw.map(clean)
    const joined = cells.join(' ').trim()
    if (joined === '') continue

    const nextHeading = parseTermHeading(cells)
    if (nextHeading) {
      heading = nextHeading
      // Each semester brings its own table, and the current one is headed
      // differently from the rest — so the mapping goes with the heading.
      columns = null
      current = {
        code: nextHeading.code,
        label: nextHeading.label,
        schoolYear: nextHeading.schoolYear,
        term: nextHeading.term,
        courseCount: 0,
        statedGpa: null,
        computedGpa: null,
        pending: false,
      }
      terms.push(current)
      continue
    }

    const gpa = parseGpaRow(cells)
    if (gpa !== null) {
      if (current) current.statedGpa = gpa
      continue
    }

    const detected = detectGradeColumns(cells)
    if (detected) {
      columns = detected
      continue
    }

    // The metadata lines between the heading and the table.
    if (cells.some((cell) => HEADER_WORDS.test(cell))) continue

    if (cells.length < config.minimumCells) {
      // Short rows here are layout, not data: section links, spacers, the
      // "Curriculum/Evaluation" and "Student's Rating Slip" links.
      continue
    }

    if (!columns) {
      unparsed.push({ cells, reason: 'no_columns' })
      continue
    }

    const code = cells[columns.code] ?? ''
    if (!code || /^\d+$/.test(code)) {
      unparsed.push({ cells, reason: 'no_course_code' })
      continue
    }

    if (!current) {
      unparsed.push({ cells, reason: 'no_term' })
      continue
    }

    const gradeCell = cells[columns.grade] ?? ''
    const value = gradeValueOf(gradeCell)
    const mark = value === null ? markOf(gradeCell) : null
    const pending = value === null && mark === null && isPending(gradeCell)

    const unitsCell = columns.units === null ? '' : (cells[columns.units] ?? '')
    const units = /^\d{1,2}(?:\.\d)?$/.test(unitsCell) ? Number(unitsCell) : null

    courses.push({
      code,
      title: columns.title === null ? '' : (cells[columns.title] ?? ''),
      faculty: columns.faculty === null ? null : (cells[columns.faculty] ?? '') || null,
      section: columns.section === null ? null : (cells[columns.section] ?? '') || null,
      units,
      value,
      mark,
      pending,
      rawGrade: value === null ? gradeCell || null : null,
      status: columns.status === null ? null : (cells[columns.status] ?? '') || null,
      termLabel: heading?.label ?? null,
      termCode: heading?.code ?? null,
      cells,
    })
    current.courseCount += 1
    if (pending) current.pending = true
  }

  for (const term of terms) {
    term.computedGpa = computeTermGpa(courses.filter((course) => course.termLabel === term.label))
  }

  if (terms.length === 0 && courses.length === 0) {
    warnings.push(
      'Nothing on that page looked like a semester of grades. The raw rows are shown below so this can be fixed.',
    )
  }

  for (const term of terms) {
    if (term.statedGpa === null || term.computedGpa === null) continue
    if (Math.abs(term.statedGpa - term.computedGpa) > 0.005) {
      // Disagreement is reported rather than resolved: the page's figure is
      // authoritative, and a gap means this parser has read something wrongly.
      warnings.push(
        `${term.label}: ERS shows a GPA of ${term.statedGpa.toFixed(2)}, but the subjects read here work out to ${term.computedGpa.toFixed(2)}. Check the rows before saving.`,
      )
    }
  }

  const pendingTerms = terms.filter((term) => term.pending)
  if (pendingTerms.length > 0) {
    warnings.push(
      `${pendingTerms.map((term) => term.label).join(', ')}: ERS is holding these grades until the faculty evaluation is done, so they came through without a grade.`,
    )
  }

  return {
    parserVersion: config.version,
    courses,
    unparsed,
    warnings,
    terms,
  }
}
