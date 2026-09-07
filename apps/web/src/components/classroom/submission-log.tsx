'use client'

import type { SubmissionEntry } from '@/lib/queries/classroom'
import { ListGroup, SectionHeader } from '@/components/ui/surfaces'
import { IconCheck } from '@/components/ui/icon'

/**
 * Who has marked this submitted.
 *
 * Extracted into its own file because 12-CLASSROOMS-PLAN.md §9.4 makes it worth
 * reviewing on its own. Four rules hold it in place, and all four are visible
 * in twenty lines rather than buried in a screen:
 *
 *   1. **Per post, never across posts.** This component receives one post's
 *      entries and has no way to ask about another, so "Cy: 4 of 9" cannot be
 *      built here or anywhere downstream of here.
 *   2. **It is a self-declaration, not proof.** The heading says so, because a
 *      tick that reads as evidence is a tick that gets argued about.
 *   3. **Not yet is not an error.** `--label-tertiary`, never `--danger`. A
 *      classmate who has not marked anything has done nothing wrong; they may
 *      simply not have opened the app.
 *   4. **A name is a name.** No link, no avatar, no route to a person's record.
 *
 * The tick is `aria-hidden` and the row carries its own sentence, because a
 * green check on its own is a colour-only signal.
 */

export interface SubmissionLogProps {
  entries: SubmissionEntry[]
  now: Date
}

export function SubmissionLog({ entries, now }: SubmissionLogProps) {
  const submitted = entries.filter((entry) => entry.submittedAt).length

  return (
    <section>
      <SectionHeader
        action={
          <span className="type-data text-[var(--label-secondary)]" aria-live="polite">
            {submitted} of {entries.length}
          </span>
        }
      >
        Submissions
      </SectionHeader>

      <p className="type-footnote mb-2 px-1 text-[var(--label-secondary)]">
        What each person said about their own work. It isn&rsquo;t proof anything was turned in,
        and it says nothing about a grade.
      </p>

      <ListGroup>
        {entries.map((entry) => (
          <div key={entry.userId} className="list-row" aria-label={accessibleName(entry, now)}>
            <span className="type-body min-w-0 flex-1 truncate">{entry.name}</span>
            {entry.submittedAt ? (
              <span
                className="type-footnote inline-flex shrink-0 items-center gap-1.5"
                style={{ color: 'var(--ok)' }}
              >
                <IconCheck size={16} aria-hidden />
                {describeWhen(entry.submittedAt, now)}
              </span>
            ) : (
              <span className="type-footnote shrink-0 text-[var(--label-tertiary)]">Not yet</span>
            )}
          </div>
        ))}
      </ListGroup>
    </section>
  )
}

function accessibleName(entry: SubmissionEntry, now: Date): string {
  return entry.submittedAt
    ? `${entry.name}, submitted ${describeWhen(entry.submittedAt, now)}`
    : `${entry.name}, not yet submitted`
}

/**
 * How long ago, in the words a student would use.
 *
 * Deliberately coarse past a day: the log answers "has this been handed in",
 * and a timestamp to the minute invites reading it as evidence of when.
 */
export function describeWhen(at: string, now: Date): string {
  const minutes = Math.round((now.getTime() - Date.parse(at)) / 60_000)

  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} minutes ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (hours < 48) return 'yesterday'

  const days = Math.round(hours / 24)
  if (days < 7) return `${days} days ago`

  return new Date(at).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    day: 'numeric',
    month: 'short',
  })
}
