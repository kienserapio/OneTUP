import { describe, expect, it } from 'vitest'
import {
  computeTermGpa,
  detectGradeColumns,
  gradeValueOf,
  isExcludedFromGpa,
  isPending,
  parseGpaRow,
  parseGradeTable,
  parseTermHeading,
} from '../src/grades/parse-grades'

/**
 * Written against a real capture of the ERS grades page, not against a guess at
 * one. The fixtures below are the exact cell contents of one student's page —
 * two finished semesters and the current ungraded one — with names left as they
 * appeared, because the faculty column is part of what has to survive the read.
 *
 * The six stated GPAs on that page are the sharpest test available: they are
 * the portal's own arithmetic, and any misreading of units or grades shows up
 * as a disagreement of a few hundredths.
 */

const HEADER = ['#', 'Subject Code', 'Description', 'Faculty Name', 'Units', 'Section', 'FINAL GRADE', 'Grade Status']

/** SY 2025-2026, second semester. The page states a GPA of 1.52. */
const TERM_2526_2: string[][] = [
  ['SCHOOL YEAR', '2526', 'Term', 'Second'],
  ['Admission Status', '', 'Scholastic Status', 'Irregular'],
  ['Course Code', 'BSCS', 'Course Description', 'Bachelor of Science in Computer Science'],
  ['GPA (excludes NSTP and subjects with non-numeric ratings)', '1.52', ''],
  HEADER,
  ['1', 'CC303-M', 'Methods of Research in Computing', 'MONTESINES, DOLORES L', '3', 'BSCS-3B-M', '1.25', 'Passed'],
  ['2', 'CS303-M', 'Automata Theory and Formal Language', 'AUSTRIA, RONN KEVIN J.', '3', 'BSCS-3B-M', '1.25', 'Passed'],
  ['3', 'CS321L-M', 'Artificial Intelligence, Laboratory', 'FABREGAS, VAL PATRICK F', '1', 'BSCS-3B-M', '1.00', 'Passed'],
  ['4', 'CS322-M', 'Artificial Intelligence, Lecture', 'FABREGAS, VAL PATRICK F', '2', 'BSCS-3B-M', '1.25', 'Passed'],
  ['5', 'CS343-M', 'Modeling and Simulation', 'LEE, JAN EILBERT LIM', '3', 'BSCS-3B-M', '2.00', 'Passed'],
  ['6', 'CS361L-M', 'Software Engineering 2, Laboratory', 'MONTESINES, DOLORES L', '1', 'BSCS-3B-M', '1.25', 'Passed'],
  ['7', 'CS362-M', 'Software Engineering 2, Lecture', 'MONTESINES, DOLORES L', '2', 'BSCS-3B-M', '1.25', 'Passed'],
  ['8', 'CSE3-M', 'CS Professional Elective 3', 'CRUZ, EDWARD N', '3', 'BSCS-3B-M', '1.25', 'Passed'],
  ['9', 'CSE4-M', 'CS Professional Elective 4', 'ONGCO, GIRALYN R.', '3', 'BSCS-3B-M', '2.50', 'Passed'],
]

/** SY 2023-2024, second semester — the one containing NSTP. Stated GPA 1.89. */
const TERM_2324_2: string[][] = [
  ['SCHOOL YEAR', '2324', 'Term', 'Second'],
  ['Admission Status', '', 'Scholastic Status', 'Regular'],
  ['Course Code', 'BSCS', 'Course Description', 'Bachelor of Science in Computer Science'],
  ['GPA (excludes NSTP and subjects with non-numeric ratings)', '1.89', ''],
  HEADER,
  ['1', 'CC103-M', 'Discrete Structures', 'DOÑO, HAZELETTE LEDESMA', '3', 'BSCS-1B-M', '2.25', 'Passed'],
  ['2', 'CC141L-M', 'Computer Programming 2, Laboratory', 'RENEGADO, FERNANDO LACBAYO', '1', 'BSCS-1B-M', '2.50', 'Passed'],
  ['3', 'CC142-M', 'Computer Programming 2, Lecture', 'RENEGADO, FERNANDO LACBAYO', '2', 'BSCS-1B-M', '2.50', 'Passed'],
  ['4', 'CS123--M', 'Linear Algebra', 'MANDI, MA. TERESA FELIX', '3', 'BSCS-1B-M', '1.25', 'Passed'],
  ['5', 'GEC2-M', 'Readings in Philippine History', 'VALDEZ, GENEMOORE BALUYUT', '3', 'BSCS-1B-M', '1.50', 'Passed'],
  ['6', 'GEC3-M', 'The Contemporary World', 'DIANO, JOCELYN AMBOS', '3', 'BSCS-1B-M', '1.00', 'Passed'],
  ['7', 'GEC5-M', 'Purposive Communication', 'BONSOL, GISELDA ABUGA-A', '3', 'BSCS-1B-M', '2.50', 'Passed'],
  ['8', 'MATHA35-M', 'Differential and Integral Calculus', 'PACER, MELCHOR GUANZON', '5', 'BSCS-1B-M', '1.75', 'Passed'],
  ['9', 'NSTP2-M', 'National Service Training Program 2', 'PARAYAN, EFREN INTAL', '3', 'BS-ES-1A-M', '1.25', 'Passed'],
  ['10', 'PATHFIT2-M', 'Physical Activities Toward Health and Fitness 2', 'BETOY, DANICA G', '2', 'BSCS-1B-M', '2.75', 'Passed'],
]

/** The current semester: headed AVERAGE, and every grade withheld. */
const TERM_2627_1: string[][] = [
  ['SCHOOL YEAR', '2627', 'Term', 'First'],
  ['Admission Status', '', 'Scholastic Status', 'Irregular'],
  ['Course Code', 'BSCS', 'Course Description', 'Bachelor of Science in Computer Science'],
  ['GPA (excludes NSTP and subjects with non-numeric ratings)', '0.00', ''],
  ['#', 'Subject Code', 'Description', 'Faculty Name', 'Units', 'Section', 'AVERAGE', 'Grade Status'],
  ['1', 'CS413-M', 'Thesis Writing 1', 'MONTESINES, DOLORES L', '3', 'BSCS-4B-M', 'PLEASE EVALUATE FIRST', 'PLEASE EVALUATE FIRST'],
  ['2', 'CS433-M', 'Social and Professional Issues', 'CABALLERO, JONATHAN MANLANGIT', '3', 'BSCS-4B-M', 'PLEASE EVALUATE FIRST', 'PLEASE EVALUATE FIRST'],
  ['3', 'GEM14-M', 'Life and Works of Rizal', '', '3', 'BSCS-4B-M', 'PLEASE EVALUATE FIRST', 'PLEASE EVALUATE FIRST'],
]

describe('cell readers', () => {
  it('reads a grade only inside the TUP scale', () => {
    expect(gradeValueOf('1.25')).toBe(1.25)
    expect(gradeValueOf('5.00')).toBe(5)
    expect(gradeValueOf('0.00')).toBeNull()
    expect(gradeValueOf('BSCS-3B-M')).toBeNull()
    expect(gradeValueOf('')).toBeNull()
  })

  it('recognises the evaluation gate', () => {
    expect(isPending('PLEASE EVALUATE FIRST')).toBe(true)
    expect(isPending('Passed')).toBe(false)
  })

  it('excludes NSTP by code, not by title', () => {
    expect(isExcludedFromGpa('NSTP1-M')).toBe(true)
    expect(isExcludedFromGpa('NSTP2-M')).toBe(true)
    expect(isExcludedFromGpa('PATHFIT2-M')).toBe(false)
    expect(isExcludedFromGpa('CS303-M')).toBe(false)
  })
})

describe('term headings', () => {
  it('reads a two-digit-pair school year as two years', () => {
    expect(parseTermHeading(['SCHOOL YEAR', '2526', 'Term', 'Second'])).toMatchObject({
      schoolYear: '2526',
      term: 'Second',
      code: '2025-2026-2',
      label: '2nd Semester AY 2025-2026',
    })
  })

  it('handles the first semester and the current year', () => {
    expect(parseTermHeading(['SCHOOL YEAR', '2627', 'Term', 'First'])).toMatchObject({
      code: '2026-2027-1',
      label: '1st Semester AY 2026-2027',
    })
  })

  it('maps summer to a third ordinal', () => {
    expect(parseTermHeading(['SCHOOL YEAR', '2425', 'Term', 'Summer'])?.code).toBe('2024-2025-3')
  })

  it('ignores rows that are not headings', () => {
    expect(parseTermHeading(['Course Code', 'BSCS'])).toBeNull()
  })
})

describe('the GPA row', () => {
  it('reads the figure past a label that mentions non-numeric ratings', () => {
    expect(parseGpaRow(['GPA (excludes NSTP and subjects with non-numeric ratings)', '1.52', ''])).toBe(1.52)
  })

  it('reads an ungraded semester as zero rather than nothing', () => {
    expect(parseGpaRow(['GPA (excludes NSTP and subjects with non-numeric ratings)', '0.00', ''])).toBe(0)
  })
})

describe('columns', () => {
  it('reads them by name', () => {
    expect(detectGradeColumns(HEADER)).toEqual({
      index: 0,
      code: 1,
      title: 2,
      faculty: 3,
      units: 4,
      section: 5,
      grade: 6,
      status: 7,
    })
  })

  it('accepts AVERAGE as the grade column on the current term', () => {
    const columns = detectGradeColumns([...HEADER.slice(0, 6), 'AVERAGE', 'Grade Status'])
    expect(columns?.grade).toBe(6)
  })

  it('refuses a row that is not a header', () => {
    expect(detectGradeColumns(['1', 'CC303-M', 'Methods of Research'])).toBeNull()
  })
})

describe('parsing a page', () => {
  it('reads a finished semester in full', () => {
    const result = parseGradeTable(TERM_2526_2)

    expect(result.courses).toHaveLength(9)
    expect(result.unparsed).toHaveLength(0)
    expect(result.courses[0]).toMatchObject({
      code: 'CC303-M',
      title: 'Methods of Research in Computing',
      faculty: 'MONTESINES, DOLORES L',
      section: 'BSCS-3B-M',
      units: 3,
      value: 1.25,
      status: 'Passed',
      termCode: '2025-2026-2',
      pending: false,
    })
  })

  it('agrees with the GPA the page states', () => {
    const result = parseGradeTable(TERM_2526_2)
    expect(result.terms).toHaveLength(1)
    expect(result.terms[0].statedGpa).toBe(1.52)
    expect(result.terms[0].computedGpa).toBe(1.52)
    expect(result.warnings).toHaveLength(0)
  })

  it('excludes NSTP, which is the difference between 1.89 and 1.82', () => {
    const result = parseGradeTable(TERM_2324_2)

    expect(result.terms[0].statedGpa).toBe(1.89)
    expect(result.terms[0].computedGpa).toBe(1.89)

    // The NSTP row is still imported — it is a subject the student took.
    expect(result.courses.find((course) => course.code === 'NSTP2-M')).toMatchObject({
      units: 3,
      value: 1.25,
    })

    // …and including it would have produced the wrong figure.
    expect(computeTermGpa(result.courses.filter((c) => !/^NSTP/.test(c.code)))).toBe(1.89)
  })

  it('keeps ungraded subjects as pending rather than dropping or failing them', () => {
    const result = parseGradeTable(TERM_2627_1)

    expect(result.courses).toHaveLength(3)
    for (const course of result.courses) {
      expect(course.pending).toBe(true)
      expect(course.value).toBeNull()
      expect(course.mark).toBeNull()
      expect(course.rawGrade).toBe('PLEASE EVALUATE FIRST')
      expect(course.units).not.toBeNull()
    }
    expect(result.terms[0].pending).toBe(true)
    expect(result.terms[0].computedGpa).toBeNull()
    expect(result.warnings.join(' ')).toMatch(/faculty evaluation/i)
  })

  it('keeps every semester on the page separate and in order', () => {
    const result = parseGradeTable([...TERM_2627_1, ...TERM_2526_2, ...TERM_2324_2])

    expect(result.terms.map((term) => term.code)).toEqual([
      '2026-2027-1',
      '2025-2026-2',
      '2023-2024-2',
    ])
    expect(result.terms.map((term) => term.courseCount)).toEqual([3, 9, 10])
    expect(result.courses).toHaveLength(22)

    const rizal = result.courses.find((course) => course.code === 'GEM14-M')
    expect(rizal?.termCode).toBe('2026-2027-1')
    const discrete = result.courses.find((course) => course.code === 'CC103-M')
    expect(discrete?.termCode).toBe('2023-2024-2')
  })

  it('warns rather than silently disagreeing with the page', () => {
    const tampered = TERM_2526_2.map((row) =>
      row[1] === 'CS343-M' ? [...row.slice(0, 6), '5.00', 'Passed'] : row,
    )
    const result = parseGradeTable(tampered)

    expect(result.terms[0].statedGpa).toBe(1.52)
    expect(result.terms[0].computedGpa).not.toBe(1.52)
    expect(result.warnings.join(' ')).toMatch(/ERS shows a GPA of 1\.52/)
  })

  it('reports nothing recognisable rather than inventing a term', () => {
    const result = parseGradeTable([['Powered by AIMS from Pinnacle Technologies, Inc.']])
    expect(result.courses).toHaveLength(0)
    expect(result.terms).toHaveLength(0)
    expect(result.warnings.join(' ')).toMatch(/Nothing on that page/)
  })
})

/**
 * The cases the real capture could not cover.
 *
 * One student's page only proves what that student's record contains: theirs
 * was six semesters of numeric grades, all passed, no summer term and no
 * withdrawal. Everything below is invented — deliberately, so the fixtures that
 * exercise the awkward paths carry nobody's actual academic record.
 */
describe('cases the one real page did not contain', () => {
  const header = ['#', 'Subject Code', 'Description', 'Faculty Name', 'Units', 'Section', 'FINAL GRADE', 'Grade Status']

  it('reads INC, DRP and W as marks rather than as missing grades', () => {
    const result = parseGradeTable([
      ['SCHOOL YEAR', '2223', 'Term', 'First'],
      ['GPA (excludes NSTP and subjects with non-numeric ratings)', '1.75', ''],
      header,
      ['1', 'AA101-M', 'Passed Subject', 'FACULTY, A', '3', 'AA-1A-M', '1.75', 'Passed'],
      ['2', 'AA102-M', 'Incomplete Subject', 'FACULTY, B', '3', 'AA-1A-M', 'INC', 'Incomplete'],
      ['3', 'AA103-M', 'Dropped Subject', 'FACULTY, C', '3', 'AA-1A-M', 'DRP', 'Dropped'],
      ['4', 'AA104-M', 'Withdrawn Subject', 'FACULTY, D', '3', 'AA-1A-M', 'W', 'Withdrawn'],
    ])

    expect(result.courses.map((course) => course.mark)).toEqual([null, 'INC', 'DRP', 'W'])
    expect(result.courses.map((course) => course.value)).toEqual([1.75, null, null, null])
    // None of them are pending: ERS gave an answer, it simply was not a number.
    expect(result.courses.every((course) => !course.pending)).toBe(true)
    // And a mark carries no weight, so the GPA is the one numeric subject.
    expect(result.terms[0].computedGpa).toBe(1.75)
    expect(result.warnings).toHaveLength(0)
  })

  it('places a summer term after the two semesters of its year', () => {
    const result = parseGradeTable([
      ['SCHOOL YEAR', '2223', 'Term', 'Summer'],
      header,
      ['1', 'AA105-M', 'Summer Subject', 'FACULTY, E', '3', 'AA-1A-M', '1.50', 'Passed'],
    ])

    expect(result.terms[0].code).toBe('2022-2023-3')
    expect(result.terms[0].label).toBe('Summer AY 2022-2023')
    expect(result.courses[0].value).toBe(1.5)
  })

  it('imports a subject whose units cell is empty rather than discarding it', () => {
    const result = parseGradeTable([
      ['SCHOOL YEAR', '2223', 'Term', 'Second'],
      header,
      ['1', 'AA106-M', 'No Units Listed', 'FACULTY, F', '', 'AA-1A-M', '2.00', 'Passed'],
      ['2', 'AA107-M', 'Normal Subject', 'FACULTY, G', '3', 'AA-1A-M', '1.00', 'Passed'],
    ])

    expect(result.courses).toHaveLength(2)
    expect(result.courses[0].units).toBeNull()
    expect(result.courses[0].value).toBe(2)
    // A subject with no unit count cannot be weighted, so it sits out of the
    // GPA rather than being counted as though it were worth nothing.
    expect(result.terms[0].computedGpa).toBe(1)
  })

  it('reads a school year written out in full', () => {
    expect(parseTermHeading(['SCHOOL YEAR', '2022-2023', 'Term', 'First'])?.code).toBe('2022-2023-1')
  })
})
