'use client'

import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { type GwaResult, GRADE_HIGHEST, GRADE_LOWEST, formatGwa } from '@onetup/core'
import {
  clearGrade,
  saveGrade,
  type GwaCourse,
  type TermStanding,
} from '@/lib/queries/subjects'
import { spring, transition } from '@/design/motion'
import { Badge, Card, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { IconChevronDown } from '@/components/ui/icon'
import { GradeSheet } from '@/components/subjects/grade-sheet'

/**
 * Term by term, and inside each term the subjects it was made of.
 *
 * A semester used to be a single figure here, which is the one thing a student
 * already knows and the one thing they cannot check. The grades behind it were
 * loaded all along, so opening a term is a disclosure rather than a fetch, and
 * every subject in it is editable — an imported record is a transcription of a
 * screenshot, and transcriptions come in wrong.
 *
 * Editing goes through the same `GradeSheet` and the same queued write as the
 * subject screen. A second editor here would be a second set of rules about
 * what a valid grade is, and they would drift.
 */

export interface TermBreakdownProps {
  /** Oldest term first, so the trend reads downward the way it happened. */
  terms: TermStanding[]
  /** Re-reads the screen, so a corrected grade moves its term and the total. */
  onChanged: () => void | Promise<void>
}

export function TermBreakdown({ terms, onChanged }: TermBreakdownProps) {
  const [openTermId, setOpenTermId] = useState<string | null>(null)
  const [editing, setEditing] = useState<GwaCourse | null>(null)
  // Kept separate from `editing` so the sheet still has something to draw on
  // its way out; clearing the course on close would empty it mid-animation.
  const [editorOpen, setEditorOpen] = useState(false)

  const existingGrade = editing?.grade ?? null

  return (
    <section>
      <SectionHeader>Term by term</SectionHeader>

      <Card className="stack">
        {terms.map((standing, index) => (
          <TermRow
            key={standing.termId}
            standing={standing}
            previous={index > 0 ? terms[index - 1].result.gwa : null}
            open={standing.termId === openTermId}
            onToggle={() =>
              setOpenTermId((current) => (current === standing.termId ? null : standing.termId))
            }
            onEditCourse={(course) => {
              setEditing(course)
              setEditorOpen(true)
            }}
          />
        ))}

        {openTermId === null && (
          <p className="type-footnote text-[var(--label-secondary)]">
            Open a semester to see every subject in it — and to fix one that came in wrong.
          </p>
        )}
      </Card>

      {editing && (
        <GradeSheet
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          code={editing.code}
          units={editing.units}
          value={editing.grade?.value ?? null}
          mark={editing.grade?.mark ?? null}
          isProjected={editing.grade?.isProjected ?? false}
          onSave={async (next) => {
            await saveGrade({
              existing: existingGrade,
              enrollmentId: editing.enrollmentId,
              value: next.value,
              mark: next.mark,
              isProjected: next.isProjected,
            })
            await onChanged()
          }}
          onClear={
            existingGrade
              ? async () => {
                  await clearGrade(existingGrade)
                  await onChanged()
                }
              : undefined
          }
        />
      )}
    </section>
  )
}

function TermRow({
  standing,
  previous,
  open,
  onToggle,
  onEditCourse,
}: {
  standing: TermStanding
  previous: number | null
  open: boolean
  onToggle: () => void
  onEditCourse: (course: GwaCourse) => void
}) {
  const reduced = useReducedMotion() ?? false
  const panelId = useId()
  const gwa = standing.result.gwa

  // 1.00 fills the bar, 5.00 empties it — the scale is inverted, and so is this.
  const fill = gwa === null ? 0 : ((GRADE_LOWEST - gwa) / (GRADE_LOWEST - GRADE_HIGHEST)) * 100
  const delta = gwa !== null && previous !== null ? previous - gwa : null

  // Codes sort more usefully than enrolment order for a term being checked
  // against a printed record, which is what a student is usually doing here.
  const courses = [...standing.courses].sort((a, b) => a.code.localeCompare(b.code))

  return (
    <div>
      <motion.button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        whileTap={{ scale: 0.99 }}
        transition={transition(spring.snap)}
        className="-mx-2 block w-full rounded-[var(--radius-sm)] px-2 py-1 text-left"
      >
        <div className="flex items-baseline justify-between gap-3">
          {/* Wraps rather than truncates: the semester name is what the student
              is choosing between here, and "2nd Semester AY 2024-20…" is not a
              choice anyone can make. */}
          <span className="type-subheadline min-w-0" style={{ wordBreak: 'keep-all' }}>
            {standing.label}
            {standing.isCurrent && (
              <span className="type-footnote text-[var(--label-secondary)]"> · now</span>
            )}
          </span>
          <span className="flex shrink-0 items-baseline gap-2">
            {delta !== null && Math.abs(delta) >= 0.005 && (
              <span
                className="type-caption-2 type-data"
                style={{ color: delta > 0 ? 'var(--ok)' : 'var(--label-secondary)' }}
              >
                {delta > 0 ? '↓' : '↑'} {Math.abs(delta).toFixed(2)}
              </span>
            )}
            <span className="type-data font-semibold">{formatGwa(gwa)}</span>
            <motion.span
              aria-hidden
              className="self-center"
              animate={{ rotate: open ? 180 : 0 }}
              transition={transition(spring.snap)}
            >
              <IconChevronDown size={16} className="block text-[var(--label-tertiary)]" />
            </motion.span>
          </span>
        </div>

        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--fill-tertiary)' }}
          aria-hidden
        >
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${fill}%` }}
            transition={transition(spring.move)}
            style={{ background: standing.isCurrent ? 'var(--accent)' : 'var(--label-tertiary)' }}
          />
        </div>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            className="overflow-hidden"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={transition(spring.ui)}
          >
            <div className="pt-3">
              <ListGroup>
                {courses.map((course) => (
                  <ListRow
                    key={course.enrollmentId}
                    onClick={() => onEditCourse(course)}
                    title={<span className="type-data">{course.code}</span>}
                    subtitle={describeCourse(course)}
                    trailing={<GradeMark course={course} />}
                  />
                ))}
              </ListGroup>

              <p className="type-footnote mt-2 text-[var(--label-secondary)]">
                {describeStanding(standing.result)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * The recorded grade, read from the grade row rather than from the figure the
 * GWA used. A projection is blank in the arithmetic and must not look blank
 * here, or a student would record it twice.
 */
function GradeMark({ course }: { course: GwaCourse }) {
  const grade = course.grade

  if (grade?.mark) return <Badge tone="neutral">{grade.mark}</Badge>

  if (grade && grade.value !== null) {
    return (
      <span className="flex items-baseline gap-1.5">
        {grade.isProjected && (
          <span className="type-caption-1 text-[var(--label-tertiary)]">expected</span>
        )}
        <span
          className="type-data font-semibold"
          style={grade.isProjected ? { color: 'var(--label-secondary)' } : undefined}
        >
          {grade.value.toFixed(2)}
        </span>
      </span>
    )
  }

  return <span className="type-footnote text-[var(--label-tertiary)]">Not recorded</span>
}

function describeCourse(course: GwaCourse): string {
  const units = `${course.units} unit${course.units === 1 ? '' : 's'}`
  return course.title ? `${course.title} · ${units}` : units
}

/** What the term's figure actually covers, in the same terms the top of the screen uses. */
function describeStanding(result: GwaResult): string {
  const counted = `${result.gradedCourses} subject${
    result.gradedCourses === 1 ? '' : 's'
  } · ${result.gradedUnits} unit${result.gradedUnits === 1 ? '' : 's'} in this GWA`

  if (result.excludedCourses.length === 0) return `${counted}.`

  const named = result.excludedCourses.map((excluded) => `${excluded.code} (${excluded.mark})`)
  const one = named.length === 1
  return `${counted}. ${formatList(named)} ${one ? 'has' : 'have'} no number to average, so ${
    one ? 'it is' : 'they are'
  } left out.`
}

function formatList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
