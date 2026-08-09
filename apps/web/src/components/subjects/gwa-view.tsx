'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  type Comparator,
  type GradedCourse,
  type GwaResult,
  type ThresholdState,
  type UserThreshold,
  GRADE_HIGHEST,
  GRADE_LOWEST,
  evaluateThreshold,
  formatGwa,
  maximumAllowableGrade,
} from '@onetup/core'
import { loadGwa, refreshTerms, type GwaData } from '@/lib/queries/subjects'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Badge, Card, EmptyState, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { Button, ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { ThresholdSheet } from '@/components/subjects/threshold-sheet'
import { WhatIfPlanner } from '@/components/subjects/what-if-planner'

/**
 * GWA.
 *
 * One figure, then everything that qualifies it: what it covers, what it left
 * out and why, where it has been, and what it would take to move it. The
 * qualifications are not fine print — a GWA computed over thirteen units when a
 * student is carrying eighteen is alarming until it is explained.
 */
export function GwaView() {
  const [data, setData] = useState<GwaData | null>(null)
  const [editing, setEditing] = useState<UserThreshold | null>(null)
  const [adding, setAdding] = useState(false)

  const reload = useCallback(async () => {
    setData(await loadGwa())
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    // Terms live outside the offline set, so their labels are warmed here rather
    // than blocking the first paint on them.
    void syncNow()
      .then(refreshTerms)
      .then(reload)
  }, [reload])

  if (!data) return <GwaSkeleton />

  if (!data.hasAnyGrade) {
    return (
      <>
        <NavBar title="GWA" back={{ href: '/subjects', label: 'Subjects' }} />
        <div className="app-container">
          <Card>
            <EmptyState
              title="Add your grades to see where your GWA stands."
              action={
                <ButtonLink href="/subjects" variant="accent">
                  Go to my subjects
                </ButtonLink>
              }
            />
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <NavBar
        title="GWA"
        subtitle={data.termLabel ?? undefined}
        back={{ href: '/subjects', label: 'Subjects' }}
      />

      <div className="app-container stack pb-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition(spring.ui)}
        >
          <Card className="stack">
            <div>
              <p className="type-section-header">This term</p>
              <p className="type-figure mt-1">{formatGwa(data.term.gwa)}</p>
              <p className="type-footnote text-[var(--label-secondary)]">
                Over {data.term.gradedUnits} unit{data.term.gradedUnits === 1 ? '' : 's'} in{' '}
                {data.term.gradedCourses} subject{data.term.gradedCourses === 1 ? '' : 's'}
              </p>
            </div>

            <ExclusionNote result={data.term} courses={data.termCourses} />

            {data.projected.includesProjection && data.projected.gwa !== null && (
              <p className="type-subheadline">
                With the grades you expect, this term lands at{' '}
                <span className="type-data font-semibold">{formatGwa(data.projected.gwa)}</span>.
              </p>
            )}

            <div
              className="flex items-baseline justify-between gap-3 pt-1"
              style={{ boxShadow: 'inset 0 1px 0 0 var(--separator)', paddingTop: 'var(--space-3)' }}
            >
              <span className="type-subheadline text-[var(--label-secondary)]">
                All terms
                <span className="type-footnote block">
                  {data.cumulative.gradedUnits} unit
                  {data.cumulative.gradedUnits === 1 ? '' : 's'} graded so far
                </span>
              </span>
              <span className="type-title-2 type-data">
                {formatGwa(data.cumulative.gwa)}
              </span>
            </div>
          </Card>
        </motion.div>

        {data.trend.length > 1 && (
          <section>
            <SectionHeader>Term by term</SectionHeader>
            <Card className="stack">
              {data.trend.map((standing, index) => {
                const previous = index > 0 ? data.trend[index - 1].result.gwa : null
                return (
                  <TrendRow
                    key={standing.termId}
                    label={standing.label}
                    gwa={standing.result.gwa}
                    previous={previous}
                    isCurrent={standing.isCurrent}
                  />
                )
              })}
              <p className="type-footnote text-[var(--label-secondary)]">
                A longer bar is a better GWA. Only your own record is shown here — OneTUP never
                compares you with anyone.
              </p>
            </Card>
          </section>
        )}

        <WhatIfPlanner
          graded={data.termCourses}
          ungraded={data.ungraded}
          initialPins={data.projections}
        />

        <section>
          <SectionHeader
            action={
              data.thresholds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="type-footnote min-h-[var(--target-min)] font-medium text-[var(--accent)]"
                >
                  Add
                </button>
              ) : undefined
            }
          >
            Thresholds
          </SectionHeader>

          {data.thresholds.length === 0 ? (
            <Card>
              <EmptyState
                title="Set what you're trying to hold — Dean's List, a scholarship, a retention floor — and OneTUP will tell you the moment a projection puts it at risk."
                action={
                  <Button variant="accent" onClick={() => setAdding(true)}>
                    Add a threshold
                  </Button>
                }
              />
            </Card>
          ) : (
            <ListGroup>
              {data.thresholds.map((threshold) => (
                <ThresholdRow
                  key={threshold.id}
                  threshold={threshold}
                  data={data}
                  onEdit={() => setEditing(threshold)}
                />
              ))}
            </ListGroup>
          )}
        </section>
      </div>

      <ThresholdSheet
        open={adding || editing !== null}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        existing={editing}
        onSaved={() => void reload()}
      />
    </>
  )
}

/**
 * Why the denominator does not match the unit load. Stated in the same card as
 * the figure, because a student who has to go looking for the explanation has
 * already been alarmed by it (TDD §5.2).
 */
function ExclusionNote({
  result,
  courses,
}: {
  result: GwaResult
  courses: readonly GradedCourse[]
}) {
  if (result.excludedCourses.length === 0) return null

  const unitsByCode = new Map(courses.map((course) => [course.code, course.units]))
  const excludedUnits = result.excludedCourses.reduce(
    (sum, excluded) => sum + (unitsByCode.get(excluded.code) ?? 0),
    0,
  )

  const named = result.excludedCourses.map((excluded) => `${excluded.code} (${excluded.mark})`)

  return (
    <p className="type-footnote text-[var(--label-secondary)]">
      {formatList(named)} {named.length === 1 ? 'has' : 'have'} no number to average, so{' '}
      {excludedUnits} unit{excludedUnits === 1 ? '' : 's'} {named.length === 1 ? 'is' : 'are'} left
      out. That is why this covers {result.gradedUnits}, not {result.gradedUnits + excludedUnits}.
    </p>
  )
}

function TrendRow({
  label,
  gwa,
  previous,
  isCurrent,
}: {
  label: string
  gwa: number | null
  previous: number | null
  isCurrent: boolean
}) {
  // 1.00 fills the bar, 5.00 empties it — the scale is inverted, and so is this.
  const fill =
    gwa === null ? 0 : ((GRADE_LOWEST - gwa) / (GRADE_LOWEST - GRADE_HIGHEST)) * 100
  const delta = gwa !== null && previous !== null ? previous - gwa : null

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="type-subheadline truncate">
          {label}
          {isCurrent && <span className="type-footnote text-[var(--label-secondary)]"> · now</span>}
        </span>
        <span className="flex items-baseline gap-2">
          {delta !== null && Math.abs(delta) >= 0.005 && (
            <span
              className="type-caption-2 type-data"
              style={{ color: delta > 0 ? 'var(--ok)' : 'var(--label-secondary)' }}
            >
              {delta > 0 ? '↓' : '↑'} {Math.abs(delta).toFixed(2)}
            </span>
          )}
          <span className="type-data font-semibold">{formatGwa(gwa)}</span>
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
          style={{ background: isCurrent ? 'var(--accent)' : 'var(--label-tertiary)' }}
        />
      </div>
    </div>
  )
}

function ThresholdRow({
  threshold,
  data,
  onEdit,
}: {
  threshold: UserThreshold
  data: GwaData
  onEdit: () => void
}) {
  const scoped = threshold.scope === 'cumulative' ? data.cumulative : data.term
  const projected = threshold.scope === 'cumulative' ? data.cumulative : data.projected

  const state = evaluateThreshold(
    {
      id: threshold.id,
      label: threshold.label,
      comparator: threshold.comparator as Comparator,
      value: Number(threshold.value),
      lastState: threshold.last_state,
    },
    scoped.gwa,
    projected.gwa,
  )

  const ceiling = maximumAllowableGrade({
    target: Number(threshold.value),
    graded: threshold.scope === 'cumulative' ? data.cumulativeCourses : data.termCourses,
    ungraded: data.ungraded,
  })

  return (
    <ListRow
      onClick={onEdit}
      leading={
        <span
          aria-hidden
          className="block size-2.5 rounded-full"
          style={{ background: thresholdColor(state) }}
        />
      }
      title={
        <span className="flex items-baseline gap-2">
          <span className="truncate">{threshold.label}</span>
          <span className="type-data text-[var(--label-secondary)]">
            ≤ {Number(threshold.value).toFixed(2)}
          </span>
        </span>
      }
      subtitle={describeThreshold(state, ceiling, data.ungraded.length)}
      trailing={
        <Badge tone="neutral">
          {threshold.scope === 'cumulative' ? 'All terms' : 'This term'}
        </Badge>
      }
    />
  )
}

function describeThreshold(
  state: ThresholdState,
  ceiling: number | null,
  remaining: number,
): string {
  if (state === 'breached') {
    return ceiling === null
      ? 'Missed, and not reachable with what is left.'
      : `Missed for now — ${ceiling.toFixed(2)} or better in each remaining subject brings it back.`
  }

  if (state === 'at_risk') {
    return ceiling === null
      ? 'Your projection puts this out of reach.'
      : `At risk — your projection slips past it. ${ceiling.toFixed(2)} in each remaining subject holds it.`
  }

  if (remaining === 0) return 'Clear, with every grade in.'
  if (ceiling === null) return 'Clear for now.'
  if (ceiling >= GRADE_LOWEST) return 'Clear whatever you get in what is left.'
  return `Clear. You can take up to ${ceiling.toFixed(2)} in each remaining subject and keep it.`
}

function thresholdColor(state: ThresholdState): string {
  switch (state) {
    case 'breached':
      return 'var(--danger)'
    case 'at_risk':
      return 'var(--warning)'
    default:
      return 'var(--ok)'
  }
}

function formatList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function GwaSkeleton() {
  return (
    <>
      <NavBar title="GWA" back={{ href: '/subjects', label: 'Subjects' }} />
      <div className="app-container stack" aria-busy="true" aria-label="Loading GWA">
        <div className="skeleton h-48 rounded-[var(--radius-lg)]" />
        <div className="skeleton h-40 rounded-[var(--radius-lg)]" />
      </div>
    </>
  )
}
