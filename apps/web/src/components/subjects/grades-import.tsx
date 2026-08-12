'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import {
  GRADE_SCALE,
  computeGwa,
  formatGwa,
  isExcludedFromGpa,
  type NonNumericMark,
  type ParsedGrade,
  type ParsedTerm,
} from '@onetup/core'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/auth/auth-form'
import { NavBar } from '@/components/app/nav-bar'
import { IconCheck, IconClose, IconWarning } from '@/components/ui/icon'
import { MARKS } from '@/components/subjects/grade-sheet'
import { commitImportedGrades, type GradeToCommit } from '@/components/subjects/grades-import-commit'

/**
 * Importing past grades from ERS.
 *
 * The grades page lists every semester a student has ever taken, so this is the
 * one import that reaches backwards: it is how a student gets a real GWA
 * history, and with it a defensible answer to "what do I need this term?".
 *
 * Everything the schedule import promises holds here, for the same reasons. The
 * credentials live in this component's own state and nowhere else, and are
 * wiped on both the success and the failure path. Nothing is written until the
 * student has looked at every row — a grade imported into the wrong subject is
 * a wrong number in the one place a student is most likely to trust it.
 *
 * The one thing this screen does that the schedule import does not is name its
 * source. Every figure below is labelled as having come from ERS, because a
 * GWA the student did not type in should say where it came from.
 */

export interface TermOption {
  code: string
  label: string
}

export interface GradesImportProps {
  studentNumber: string
  emailVerified: boolean
  terms: TermOption[]
  currentTermCode: string | null
}

interface DraftGrade {
  key: string
  code: string
  title: string
  /** Text, because an empty units box is a real state the student must fix. */
  units: string
  value: number | null
  mark: NonNumericMark | null
  /** What ERS printed, kept so an edit can be seen as an edit. */
  original: { value: number | null; mark: NonNumericMark | null; units: number | null }
  dropped: boolean
  /**
   * ERS is withholding this grade until the faculty evaluation is done. The
   * subject is real and enrolled; there is simply no grade to save yet.
   */
  pending: boolean
}

interface DraftTerm {
  key: string
  /** The heading ERS printed, or a plain statement that it printed none. */
  heading: string
  /** What ERS itself said this semester's GPA was, when it said anything. */
  statedGpa: number | null
  /** The term this group will be saved into; empty until the student picks. */
  termCode: string
  rows: DraftGrade[]
}

/**
 * Exported because onboarding reads grades in the same breath as the schedule
 * and hands the result straight to `GradesReview` below. One shape, reviewed by
 * one screen, whichever door the student came through.
 */
export interface GradesProposal {
  parserVersion: string
  courses: ParsedGrade[]
  /** ERS states a GPA per semester. Carried through so the figure this screen
   * shows can be checked against the portal's rather than merely asserted. */
  terms: ParsedTerm[]
  unparsed: { cells: string[]; reason: string }[]
  warnings: string[]
  debug: { selector?: string; rows?: string[][]; page?: PageDiagnostic | null } | null
}

export function GradesImport({
  studentNumber,
  emailVerified,
  terms,
  currentTermCode,
}: GradesImportProps) {
  const [proposal, setProposal] = useState<GradesProposal | null>(null)

  return (
    <>
      <NavBar
        title="Import grades"
        subtitle="From ERS"
        back={{ href: '/subjects/gwa', label: 'GWA' }}
      />

      <div className="app-container pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={proposal ? 'review' : 'connect'}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={transition(spring.ui)}
          >
            {proposal ? (
              <GradesReview
                proposal={proposal}
                terms={terms}
                currentTermCode={currentTermCode}
                onCancel={() => setProposal(null)}
              />
            ) : (
              <ConnectStep
                studentNumber={studentNumber}
                emailVerified={emailVerified}
                onImported={setProposal}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}

/**
 * The same three fields the schedule import asks for, handled the same way:
 * held in this component's state, sent once, and cleared whether the request
 * succeeded or failed (auth doc §5.1).
 */
function ConnectStep({
  studentNumber,
  emailVerified,
  onImported,
}: {
  studentNumber: string
  emailVerified: boolean
  onImported: (proposal: GradesProposal) => void
}) {
  const [number, setNumber] = useState(studentNumber)
  const [password, setPassword] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* An account that already carries a student number has nothing to decide
   * here, and letting it be edited only invites importing somebody else. */
  const locked = studentNumber.trim().length > 0

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      const response = await fetch('/api/ers/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_number: number.trim(), password, birthdate }),
      })

      const body = await response.json()

      if (!response.ok) {
        setError(
          body?.error?.message ?? 'That did not work. Try again, or enter your grades by hand.',
        )
        return
      }

      onImported({
        parserVersion: body.parser_version ?? 'unknown',
        courses: body.courses ?? [],
        unparsed: body.unparsed ?? [],
        warnings: body.warnings ?? [],
        terms: body.terms ?? [],
        debug: body.debug ?? null,
      })
    } catch {
      setError("We couldn't reach OneTUP to start the import. Check your connection and try again.")
    } finally {
      // Cleared on both paths, always.
      setPassword('')
      setBirthdate('')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <header>
        <h2 className="type-title-2">Bring in your past grades</h2>
        <p className="type-subheadline mt-1 max-w-[60ch] text-[var(--label-secondary)]">
          ERS keeps every semester you have taken. We sign in once, read that page, and show you
          what it says. Your password is used once and never saved.
        </p>
      </header>

      {!emailVerified && (
        <FormError>
          Verify your email first — check your inbox. ERS connection stays locked until you do.
        </FormError>
      )}

      {error && <FormError>{error}</FormError>}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="stack">
          {/* Fixed to the account when the account knows it. The server checks
              this too — before the login, and again against whoever ERS says it
              actually let in — but a field that cannot be wrong is better than
              an error that explains why it was. */}
          <Field
            id="grades-student-number"
            label="Student number"
            value={number}
            onChange={setNumber}
            autoComplete="off"
            spellCheck={false}
            required
            disabled={!emailVerified || locked}
            hint={locked ? 'Locked to this account. Grades are only ever kept under the student they belong to, so an import has to be your own ERS record.' : undefined}
          />

          <Field
            id="grades-password"
            label="ERS password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="off"
            spellCheck={false}
            required
            disabled={!emailVerified}
            hint="Used once, then discarded. Never saved."
          />

          <Field
            id="grades-birthdate"
            label="Birthdate"
            type="date"
            value={birthdate}
            onChange={setBirthdate}
            autoComplete="off"
            required
            disabled={!emailVerified}
            hint="ERS asks for this too, and it has to match your record exactly."
          />

          <Button type="submit" variant="accent" block disabled={busy || !emailVerified}>
            {busy ? 'Reading your grades…' : 'Import my grades'}
          </Button>
        </div>

        <Card>
          <p className="type-subheadline font-medium">Before anything is saved:</p>
          <ul className="mt-2 space-y-2">
            {[
              'You see every subject and every grade, grouped by semester.',
              'You can change or drop any row, and pick which term it belongs to.',
              'Your GWA is worked out in front of you, from the units on the page.',
              'Nothing is written until you say so.',
            ].map((point) => (
              <li key={point} className="type-subheadline flex gap-2.5">
                <IconCheck size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--ok)' }} />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </form>
  )
}

const NO_HEADING = 'ERS did not name a semester for these'

/** Turns the parsed rows into editable groups, one per heading ERS printed. */
function toDraft(
  courses: ParsedGrade[],
  terms: TermOption[],
  fallback: string | null,
  parsedTerms: ParsedTerm[] = [],
): DraftTerm[] {
  const known = new Set(terms.map((term) => term.code))
  const statedByHeading = new Map(parsedTerms.map((term) => [term.label, term.statedGpa]))
  const groups: DraftTerm[] = []

  courses.forEach((course, index) => {
    const heading = course.termLabel ?? NO_HEADING
    let group = groups.find((candidate) => candidate.heading === heading)

    if (!group) {
      // A term code we do not hold is worse than none: it would look decided
      // when it is not. Fall back to the current term only for the group ERS
      // never labelled, and leave the rest for the student to place.
      const parsed = course.termCode && known.has(course.termCode) ? course.termCode : ''
      group = {
        key: `term-${groups.length}`,
        statedGpa: statedByHeading.get(heading) ?? null,
        heading,
        termCode: parsed || (heading === NO_HEADING ? (fallback ?? '') : ''),
        rows: [],
      }
      groups.push(group)
    }

    group.rows.push({
      key: `row-${index}`,
      code: course.code,
      title: course.title,
      units: course.units === null ? '' : String(course.units),
      value: course.value,
      mark: course.mark,
      original: { value: course.value, mark: course.mark, units: course.units },
      /* The current semester arrives with every grade withheld behind the
       * faculty evaluation. Those rows are dropped by default rather than
       * blocking the save: making a student tick away six subjects that ERS
       * itself has not graded is asking them to do our tidying. Undropping one
       * is still possible, for a student who knows a grade and wants it in. */
      dropped: course.pending === true,
      pending: course.pending === true,
    })
  })

  return groups
}

/**
 * Exported for onboarding, which arrives here with grades already in hand and
 * has to keep going afterwards rather than land on the GWA screen. The three
 * optional props below are the whole of that difference — the review itself,
 * which is the part that must not diverge, is the same on both routes.
 */
export function GradesReview({
  proposal,
  terms,
  currentTermCode,
  onCancel,
  heading = 'Check this over',
  cancelLabel = 'Start over',
  onSaved,
}: {
  proposal: GradesProposal
  terms: TermOption[]
  currentTermCode: string | null
  onCancel: () => void
  /** Onboarding shows this straight after the schedule review, where a second
   * "Check this over" reads as the same screen failing to advance. */
  heading?: string
  /** On the import page this abandons the import; in onboarding it skips a step. */
  cancelLabel?: string
  /** Given, this takes over from the trip to the GWA screen. */
  onSaved?: () => void
}) {
  const router = useRouter()
  const [groups, setGroups] = useState<DraftTerm[]>(() =>
    toDraft(proposal.courses, terms, currentTermCode, proposal.terms),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<{ key: string; code: string; reason: string }[]>([])

  const keeping = useMemo(
    () => groups.flatMap((group) => group.rows.filter((row) => !row.dropped)),
    [groups],
  )

  function patchRow(groupKey: string, rowKey: string, patch: Partial<DraftGrade>) {
    setGroups((previous) =>
      previous.map((group) =>
        group.key === groupKey
          ? {
              ...group,
              rows: group.rows.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)),
            }
          : group,
      ),
    )
  }

  function patchGroup(groupKey: string, patch: Partial<DraftTerm>) {
    setGroups((previous) =>
      previous.map((group) => (group.key === groupKey ? { ...group, ...patch } : group)),
    )
  }

  async function confirm() {
    setError(null)
    setSkipped([])

    const unplaced = groups.filter(
      (group) => !group.termCode && group.rows.some((row) => !row.dropped),
    )
    if (unplaced.length > 0) {
      setError(`Pick a semester for "${unplaced[0].heading}" before saving.`)
      return
    }

    const rows: GradeToCommit[] = []
    for (const group of groups) {
      for (const row of group.rows) {
        if (row.dropped) continue
        const units = Number(row.units)
        if (!row.code.trim()) {
          setError('One subject still has no course code. Fill it in, or drop the row.')
          return
        }
        if (!Number.isFinite(units) || units <= 0) {
          setError(`${row.code} needs a unit count. ERS did not give one for it.`)
          return
        }
        if (row.value === null && row.mark === null) {
          setError(`${row.code} has no grade. Set one, or drop the row.`)
          return
        }
        rows.push({
          key: row.key,
          code: row.code.trim().toUpperCase(),
          title: row.title.trim() || row.code.trim(),
          units,
          value: row.value,
          mark: row.mark,
          termCode: group.termCode,
        })
      }
    }

    if (rows.length === 0) {
      setError('Nothing is left to save. Every row has been dropped.')
      return
    }

    setBusy(true)
    try {
      const outcome = await commitImportedGrades(rows)

      if (outcome.skipped.length > 0) {
        setSkipped(outcome.skipped)
        setError(
          `${outcome.saved} saved, ${outcome.skipped.length} did not. The ones that failed are listed below.`,
        )
        return
      }

      // The GWA screen reads from the local store, so the new rows have to be
      // pulled down before it is shown or it will look as though nothing saved.
      // Onboarding needs this just as much: its next screen asks for a GWA
      // target, which is a question about numbers that must already be there.
      await syncNow()

      if (onSaved) {
        onSaved()
        return
      }

      router.push('/subjects/gwa' as never)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // We got in and read the page, but recognised nothing on it. The rows the
  // reader was working from are shown rather than hidden: this is the one case
  // where they are the whole story, and a student who can see them can tell us
  // what the page really looks like.
  if (proposal.courses.length === 0) {
    return (
      <div className="stack">
        <Card>
          <EmptyState
            title={
              proposal.debug?.page
                ? 'We signed in, but found no table on the grades page — so we cannot tell you whether your grades are posted. What the page did contain is below.'
                : 'We signed in and read the page, but nothing on it looked like a graded subject. Your grades may not be posted yet.'
            }
            action={
              <Button variant="accent" onClick={onCancel}>
                Try again
              </Button>
            }
          />
        </Card>
        <PageReport page={proposal.debug?.page ?? null} />
        <RawRows debug={proposal.debug} />
        <p className="type-caption-1 text-center text-[var(--label-tertiary)]">
          Read from ERS by {proposal.parserVersion}
        </p>
      </div>
    )
  }

  return (
    <div className="stack">
      <header>
        <h2 className="type-title-2">{heading}</h2>
        <p className="type-subheadline mt-1 max-w-[60ch] text-[var(--label-secondary)]">
          {keeping.length} subject{keeping.length === 1 ? '' : 's'} across{' '}
          {groups.length === 1 ? 'one semester' : `${groups.length} semesters`}, read from ERS.
          Nothing is saved until you say so.
        </p>
      </header>

      {proposal.warnings.length > 0 && (
        <Card className="flex items-start gap-3">
          <IconWarning size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
          <ul className="min-w-0 space-y-1.5">
            {proposal.warnings.map((warning) => (
              <li key={warning} className="type-subheadline">
                {warning}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && (
        <p
          role="alert"
          className="type-subheadline rounded-[var(--radius-sm)] px-3.5 py-2.5"
          style={{
            background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
            color: 'var(--danger)',
          }}
        >
          {error}
        </p>
      )}

      {skipped.length > 0 && (
        <Card className="stack">
          <p className="type-subheadline font-medium">These did not save:</p>
          <ul className="space-y-1.5">
            {skipped.map((row) => (
              <li key={row.key} className="type-footnote text-[var(--label-secondary)]">
                <span className="type-data font-medium">{row.code}</span> — {row.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {groups.map((group) => (
        <TermGroup
          key={group.key}
          group={group}
          terms={terms}
          onGroupChange={(patch) => patchGroup(group.key, patch)}
          onRowChange={(rowKey, patch) => patchRow(group.key, rowKey, patch)}
        />
      ))}

      {proposal.unparsed.length > 0 && (
        <section>
          <SectionHeader>Couldn&rsquo;t read these</SectionHeader>
          <Card>
            <p className="type-footnote mb-3 text-[var(--label-secondary)]">
              These rows did not make sense to the reader, so nothing was assumed about them. Add
              them by hand if you need them.
            </p>
            <ul className="space-y-1.5">
              {proposal.unparsed.map((row, index) => (
                <li key={index} className="type-data type-footnote text-[var(--label-tertiary)]">
                  {row.cells.filter(Boolean).join(' · ')}
                  <span className="text-[var(--label-tertiary)]"> ({row.reason})</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="plain" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant="accent" onClick={() => void confirm()} disabled={busy} block>
          {busy ? 'Saving…' : `Save ${keeping.length} grade${keeping.length === 1 ? '' : 's'}`}
        </Button>
      </div>

      <RawRows debug={proposal.debug} />

      <p className="type-caption-1 text-center text-[var(--label-tertiary)]">
        Read from ERS by {proposal.parserVersion}
      </p>
    </div>
  )
}

function TermGroup({
  group,
  terms,
  onGroupChange,
  onRowChange,
}: {
  group: DraftTerm
  terms: TermOption[]
  onGroupChange: (patch: Partial<DraftTerm>) => void
  onRowChange: (rowKey: string, patch: Partial<DraftGrade>) => void
}) {
  const keeping = group.rows.filter((row) => !row.dropped)

  /* ERS's own rule, not a plain average: it excludes NSTP, as the label on its
   * GPA row says. Using the unfiltered figure here put this screen up to 0.07
   * away from the number the student can see on the portal, which is exactly
   * the kind of small unexplained disagreement that makes people distrust the
   * whole import. */
  const result = computeGwa(
    keeping
      .filter((row) => !isExcludedFromGpa(row.code))
      .map((row) => ({
        enrollmentId: row.key,
        code: row.code,
        units: Number(row.units) || 0,
        value: row.value,
        mark: row.mark,
      })),
  )

  return (
    <section>
      <SectionHeader
        action={
          <span className="flex items-baseline gap-2">
            {group.statedGpa !== null && group.statedGpa > 0 && (
              <span className="type-footnote text-[var(--label-tertiary)]">
                ERS says <span className="type-data">{group.statedGpa.toFixed(2)}</span> ·
              </span>
            )}
            <span className="type-footnote text-[var(--label-secondary)]">GWA</span>
            <span className="type-data type-headline font-semibold">{formatGwa(result.gwa)}</span>
          </span>
        }
      >
        {group.heading}
      </SectionHeader>

      <Card className="stack">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label
              htmlFor={`${group.key}-term`}
              className="type-subheadline mb-1.5 block font-medium"
            >
              Save these into
            </label>
            <select
              id={`${group.key}-term`}
              value={group.termCode}
              onChange={(event) => onGroupChange({ termCode: event.target.value })}
              className="field"
            >
              <option value="">Pick a semester…</option>
              {terms.map((term) => (
                <option key={term.code} value={term.code}>
                  {term.label}
                </option>
              ))}
            </select>
          </div>

          <p className="type-footnote flex-1 text-[var(--label-secondary)]">
            {result.gwa === null
              ? 'No numeric grade here yet, so there is nothing to average.'
              : `${result.gradedUnits} unit${result.gradedUnits === 1 ? '' : 's'} averaged from ${result.gradedCourses} subject${result.gradedCourses === 1 ? '' : 's'}.`}
            {result.excludedCourses.length > 0 &&
              ` ${result.excludedCourses.map((course) => `${course.code} (${course.mark})`).join(', ')} ${result.excludedCourses.length === 1 ? 'has' : 'have'} no number to average and ${result.excludedCourses.length === 1 ? 'is' : 'are'} left out.`}
          </p>
        </div>

        <div className="space-y-2">
          {group.rows.map((row) => (
            <GradeRow
              key={row.key}
              row={row}
              onChange={(patch) => onRowChange(row.key, patch)}
            />
          ))}
        </div>
      </Card>
    </section>
  )
}

function GradeRow({
  row,
  onChange,
}: {
  row: DraftGrade
  onChange: (patch: Partial<DraftGrade>) => void
}) {
  const edited =
    row.value !== row.original.value ||
    row.mark !== row.original.mark ||
    row.units !== (row.original.units === null ? '' : String(row.original.units))

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t pt-2 first:border-t-0 first:pt-0"
      style={{ borderColor: 'var(--separator)', opacity: row.dropped ? 0.45 : 1 }}
    >
      <label className="sr-only" htmlFor={`${row.key}-code`}>
        Course code
      </label>
      <input
        id={`${row.key}-code`}
        value={row.code}
        onChange={(event) => onChange({ code: event.target.value })}
        disabled={row.dropped}
        spellCheck={false}
        className="field type-data w-[7.5rem] flex-none"
      />

      <label className="sr-only" htmlFor={`${row.key}-title`}>
        Title
      </label>
      <input
        id={`${row.key}-title`}
        value={row.title}
        onChange={(event) => onChange({ title: event.target.value })}
        disabled={row.dropped}
        placeholder="Title"
        className="field min-w-[8rem] flex-1"
      />

      <label className="sr-only" htmlFor={`${row.key}-units`}>
        Units
      </label>
      <input
        id={`${row.key}-units`}
        value={row.units}
        inputMode="decimal"
        onChange={(event) => onChange({ units: event.target.value })}
        disabled={row.dropped}
        placeholder="Units"
        className="field type-data w-[5rem] flex-none"
        style={row.units ? undefined : { boxShadow: '0 0 0 1px var(--warning)' }}
      />

      <label className="sr-only" htmlFor={`${row.key}-grade`}>
        Grade
      </label>
      <select
        id={`${row.key}-grade`}
        value={row.mark ?? (row.value === null ? '' : row.value.toFixed(2))}
        onChange={(event) => {
          const next = event.target.value
          const asMark = MARKS.find((option) => option.mark === next)
          onChange(
            asMark
              ? { value: null, mark: asMark.mark }
              : { value: next ? Number(next) : null, mark: null },
          )
        }}
        disabled={row.dropped}
        className="field type-data w-[6.5rem] flex-none"
      >
        <option value="">No grade</option>
        {GRADE_SCALE.map((grade) => (
          <option key={grade} value={grade.toFixed(2)}>
            {grade.toFixed(2)}
          </option>
        ))}
        {MARKS.map((option) => (
          <option key={option.mark} value={option.mark}>
            {option.label}
          </option>
        ))}
      </select>

      {edited ? <Badge tone="neutral">Edited</Badge> : <Badge tone="official">From ERS</Badge>}

      <button
        type="button"
        onClick={() => onChange({ dropped: !row.dropped })}
        aria-label={row.dropped ? `Keep ${row.code}` : `Drop ${row.code}`}
        className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--label-secondary)]"
        style={{ background: 'var(--fill-tertiary)' }}
      >
        {row.dropped ? <IconCheck size={15} /> : <IconClose size={15} />}
      </button>
    </div>
  )
}

/**
 * The raw table, exactly as it came off the page.
 *
 * Nobody had seen the markup of the ERS grades page when this was written, so
 * the reader above is working from an educated guess about its shape. This
 * block is how a student who hits a bad import can show us what the page
 * actually looks like — and it is the thing to delete once we know.
 */
function RawRows({ debug }: { debug: { selector?: string; rows?: string[][] } | null }) {
  if (!debug?.rows?.length) return null

  return (
    <details className="card squircle p-4">
      <summary className="type-subheadline cursor-pointer font-medium">
        What the ERS page actually looked like
      </summary>
      <p className="type-footnote mt-2 text-[var(--label-secondary)]">
        The first {debug.rows.length} rows as they came off the page, found with{' '}
        <span className="type-data">{debug.selector}</span>. Nothing here is saved or sent anywhere
        — it is on screen so you can tell us when a row is read wrongly.
      </p>
      <ol className="mt-3 space-y-1">
        {debug.rows.map((cells, index) => (
          <li key={index} className="type-data type-caption-1 text-[var(--label-tertiary)]">
            {index + 1}. {cells.map((cell) => cell || '·').join(' | ')}
          </li>
        ))}
      </ol>
    </details>
  )
}

/**
 * What ERS actually served, when we could not read it.
 *
 * The point of this panel is to replace a guess with evidence. "Your grades may
 * not be posted yet" is a claim about the student's record; "the page had no
 * table on it, three frames, and a dropdown called `sem`" is a fact about the
 * page, and it is the fact that gets the reader fixed.
 *
 * None of this is logged or stored anywhere — on a grades page the markup is
 * the grades. It is rendered here, in the browser of the student it belongs to,
 * and the copy button puts it on their clipboard so *they* choose whether to
 * share it.
 */
export interface PageDiagnostic {
  url: string
  title: string
  landing?: {
    url: string
    title: string
    links: { href: string; text: string }[]
    gradesHref: string | null
  } | null
  bounced?: boolean
  requested?: string
  trail?: string[]
  counts: {
    tables: number
    rows: number
    cells: number
    iframes: number
    forms: number
    selects: number
    buttons: number
  }
  frames: string[]
  headings: string[]
  selectNames: string[]
  textSample: string
  htmlSample: string
}

function PageReport({ page }: { page: PageDiagnostic | null }) {
  const [copied, setCopied] = useState(false)
  if (!page) return null

  /* The likely explanations, in the order they are worth checking. Stated as
   * possibilities, because this is a report and not a diagnosis. */
  const leads: string[] = []
  if (page.bounced) {
    leads.push(
      'ERS moved us back to the sign-in page while this was being requested — the sign-in itself worked, so it is how the page was asked for that it objected to.',
    )
    if (page.landing?.gradesHref) {
      leads.push(`Its own menu links to grades at ${page.landing.gradesHref} — that is the URL to use.`)
    } else if (page.landing && page.landing.links.length > 0) {
      leads.push('Its menu has no grades link, so the page may be reached some other way entirely.')
    }
  }
  if (page.counts.iframes > 0 || page.frames.length > 1) {
    leads.push(
      `The page has ${page.counts.iframes} embedded frame${page.counts.iframes === 1 ? '' : 's'} — the table may live inside one.`,
    )
  }
  if (page.counts.selects > 0) {
    leads.push(
      `There ${page.counts.selects === 1 ? 'is a dropdown' : `are ${page.counts.selects} dropdowns`} on the page (${page.selectNames.join(', ')}) — a semester may have to be chosen before anything is listed.`,
    )
  }
  if (page.counts.tables === 0 && page.counts.rows === 0) {
    leads.push('No table at all: the grades are laid out some other way, or the page is a notice.')
  }
  if (page.counts.tables > 0 && page.counts.rows === 0) {
    leads.push('A table exists but has no rows — it is probably filled in after load.')
  }

  const report = JSON.stringify(page, null, 2)

  return (
    <details className="card squircle p-4" open>
      <summary className="type-subheadline cursor-pointer font-medium">
        What the ERS page contained
      </summary>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {[
          ['Title', page.title || '—'],
          ['Tables', String(page.counts.tables)],
          ['Rows', String(page.counts.rows)],
          ['Cells', String(page.counts.cells)],
          ['Frames', String(page.counts.iframes)],
          ['Dropdowns', String(page.counts.selects)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="type-caption-1 text-[var(--label-tertiary)]">{label}</dt>
            <dd className="type-data type-subheadline">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="type-caption-1 mt-3 break-all text-[var(--label-tertiary)]">{page.url}</p>

      {leads.length > 0 && (
        <ul className="mt-3 space-y-1">
          {leads.map((lead) => (
            <li key={lead} className="type-footnote text-[var(--label-secondary)]">
              · {lead}
            </li>
          ))}
        </ul>
      )}

      {page.textSample && (
        <p className="type-footnote mt-3 max-h-40 overflow-auto rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] p-3 text-[var(--label-secondary)]">
          {page.textSample}
        </p>
      )}

      {/* Shown whether or not it found links. An empty menu is itself the
          answer — it means we were never on a signed-in page to begin with. */}
      {page.landing && (
        <div className="mt-3">
          <p className="type-caption-1 text-[var(--label-tertiary)]">
            After signing in we were on{' '}
            <span className="type-data break-all">{page.landing.url}</span> —{' '}
            {page.landing.links.length === 0
              ? 'and it offered no links at all, which means it was not a signed-in page.'
              : `it offered ${page.landing.links.length} links:`}
          </p>
          {page.landing.links.length > 0 && (
            <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
              {page.landing.links.map((link) => (
                <li
                  key={`${link.href}-${link.text}`}
                  className="type-data type-caption-1 break-all text-[var(--label-tertiary)]"
                >
                  {link.text || '·'} → {link.href}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {page.trail && page.trail.length > 0 && (
        <div className="mt-3">
          <p className="type-caption-1 text-[var(--label-tertiary)]">
            Where the page went, in order:
          </p>
          <ol className="mt-1 space-y-0.5">
            {page.trail.map((step, index) => (
              <li
                key={`${index}-${step}`}
                className="type-data type-caption-1 break-all text-[var(--label-tertiary)]"
              >
                {index + 1}. {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <Button
          onClick={() => {
            void navigator.clipboard.writeText(report).then(() => setCopied(true))
          }}
        >
          {copied ? 'Copied' : 'Copy this report'}
        </Button>
        <span className="type-caption-1 text-[var(--label-tertiary)]">
          Nothing here is saved or sent. Copying is how you choose to share it.
        </span>
      </div>
    </details>
  )
}
