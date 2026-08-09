import {
  DEFAULT_PARSER_CONFIG,
  parseScheduleTable,
  parseScheduleString,
  type ParsedCourse,
} from '@onetup/core'
import type { ImportContext, ImportProposal, ScheduleImporter } from './types'

/**
 * Paste import.
 *
 * This is the floor beneath everything else. It needs no credentials, it works
 * when the portal is down, when the parser breaks, and when a student simply
 * would rather not hand over a password — and it must never be removed.
 *
 * Three strategies, tried in order, because what lands on the clipboard depends
 * on the browser: HTML if the markup survived, then a delimited table, then a
 * line-by-line heuristic against the same schedule-string regex the worker uses.
 */
export class PasteImporter implements ScheduleImporter {
  readonly id = 'paste' as const
  readonly requiresCredentials = false
  readonly available = true

  async import(context: ImportContext): Promise<ImportProposal> {
    const text = context.pasted ?? ''
    if (!text.trim()) {
      return {
        parserVersion: `${DEFAULT_PARSER_CONFIG.version}+paste`,
        courses: [],
        unparsed: [],
        warnings: [],
      }
    }

    const rows = extractRows(text)
    if (rows.length > 0) {
      const result = parseScheduleTable(rows)
      if (result.courses.length > 0) {
        return { ...result, parserVersion: `${result.parserVersion}+paste` }
      }
    }

    return heuristicParse(text)
  }
}

/** HTML table first, then whitespace-delimited rows. */
function extractRows(text: string): string[][] {
  if (/<t[rd]\b/i.test(text)) {
    const rows: string[][] = []
    for (const match of text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
        cell[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      if (cells.length > 0) rows.push(cells)
    }
    if (rows.length > 0) return rows
  }

  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    // Tabs first; otherwise two or more spaces, which is how a copied table
    // usually survives losing its markup.
    const cells = line.includes('\t') ? line.split('\t') : line.split(/ {2,}/)
    if (cells.length >= 4) rows.push(cells.map((cell) => cell.trim()))
  }
  return rows
}

/**
 * Last resort: find any line that contains a parseable schedule string, and
 * treat whatever precedes it as the course code and title. Recovers less, but
 * recovers something — and everything it produces goes to the same review
 * screen, where the student fixes what it got wrong.
 */
function heuristicParse(text: string): ImportProposal {
  const courses: ParsedCourse[] = []
  const unparsed: { cells: string[]; reason: string }[] = []

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parsed = parseScheduleString(trimmed)
    if (parsed.meetings.length === 0) {
      if (trimmed.length > 8) unparsed.push({ cells: [trimmed], reason: 'no_schedule_found' })
      continue
    }

    const codeMatch = /^([A-Z]{2,6}\s?\d{3,4}[A-Z]?)\b/.exec(trimmed)
    const unitsMatch = /\b(\d(?:\.\d)?)\s*units?\b/i.exec(trimmed)

    courses.push({
      code: codeMatch?.[1]?.trim() ?? '',
      title: trimmed
        .replace(codeMatch?.[0] ?? '', '')
        .split(/\s{2,}|\s-\s/)[0]
        .trim(),
      lecUnits: 0,
      labUnits: 0,
      units: unitsMatch ? Number(unitsMatch[1]) : 0,
      faculty: null,
      rawSchedule: trimmed,
      meetings: parsed.meetings,
      parseStatus: parsed.status,
    })
  }

  return {
    parserVersion: `${DEFAULT_PARSER_CONFIG.version}+paste-heuristic`,
    courses,
    unparsed,
    warnings: courses.some((course) => !course.code)
      ? [
          {
            code: 'meeting_unparsed',
            message: 'Some course codes could not be read. Fill them in below.',
          },
        ]
      : [],
  }
}
