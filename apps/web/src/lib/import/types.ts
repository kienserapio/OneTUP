import type { ParsedCourse, ParseWarning, RawRow } from '@onetup/core'

/**
 * The import abstraction (auth doc §8).
 *
 * Everything downstream of `ImportProposal` — the review screen, the commit
 * endpoint, the diff — is deliberately blind to where the data came from. That
 * is what makes the migration path real: a browser extension, or a sanctioned
 * read-only API from TUP, drops in as a fourth implementation and nothing else
 * changes.
 */

export interface ImportContext {
  termCode: string
  /** Only ever populated for the credential-based importer, and never stored. */
  credentials?: {
    studentNumber: string
    password: string
    birthdate: string
  }
  /** Raw text for the paste importer. */
  pasted?: string
}

export interface ImportProposal {
  parserVersion: string
  courses: ParsedCourse[]
  unparsed: RawRow[]
  warnings: ParseWarning[]
  jobId?: string
}

export interface ScheduleImporter {
  readonly id: 'ers_worker' | 'paste' | 'extension' | 'sanctioned_api'
  readonly requiresCredentials: boolean
  readonly available: boolean
  import(context: ImportContext): Promise<ImportProposal>
}

/** The shape the commit endpoint accepts, after the student has reviewed it. */
export interface ReviewedCourse {
  code: string
  title: string
  lecUnits: number
  labUnits: number
  units: number
  faculty: string | null
  meetings: {
    day: string
    startTime: string
    endTime: string
    room: string
  }[]
}
