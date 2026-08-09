import type { Metadata } from 'next'
import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { NavBar } from '@/components/app/nav-bar'
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { IconChevronRight } from '@/components/ui/icon'

export const metadata: Metadata = { title: 'Faculty evaluation' }

export default async function EvaluationsPage() {
  const supabase = await supabaseServer()

  const [{ data: instrument }, { data: enrollments }, { data: evaluations }] = await Promise.all([
    supabase.from('evaluation_instruments').select('id').eq('is_active', true).maybeSingle(),
    supabase.from('enrollments').select('id, faculty_name, courses(code, title)'),
    supabase.from('evaluations').select('enrollment_id, status'),
  ])

  const statusByEnrollment = new Map(
    (evaluations ?? []).map((evaluation) => [evaluation.enrollment_id, evaluation.status]),
  )

  const withFaculty = (enrollments ?? []).filter((enrollment) => enrollment.faculty_name)
  const done = withFaculty.filter(
    (enrollment) => statusByEnrollment.get(enrollment.id) === 'exported',
  ).length

  return (
    <>
      <NavBar
        title="Faculty evaluation"
        subtitle={
          !instrument
            ? 'Not open yet'
            : withFaculty.length > 0
              ? `${done} of ${withFaculty.length} done`
              : undefined
        }
      />

      <div className="app-container pb-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="lg:col-start-1 lg:row-start-1">
            {!instrument ? (
              <Card>
                <EmptyState title="The form for this term hasn't been set up yet. It'll appear here when the evaluation period opens." />
              </Card>
            ) : withFaculty.length === 0 ? (
              <Card>
                <EmptyState title="No subjects with a faculty member listed. Import or add your schedule first." />
              </Card>
            ) : (
              <section>
                <SectionHeader>Your subjects</SectionHeader>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                  {withFaculty.map((enrollment) => {
                    const course = enrollment.courses as unknown as {
                      code: string
                      title: string
                    } | null
                    const status = statusByEnrollment.get(enrollment.id)
                    return (
                      <Link
                        key={enrollment.id}
                        href={`/evaluations/${enrollment.id}` as never}
                        className="card flex min-h-[var(--target-min)] items-center gap-3 p-3.5 transition-colors"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="type-headline block truncate">
                            {enrollment.faculty_name}
                          </span>
                          {course && (
                            <span className="type-footnote block truncate text-[var(--label-secondary)]">
                              <span className="type-data font-semibold">{course.code}</span> ·{' '}
                              {course.title}
                            </span>
                          )}
                        </span>
                        {status === 'exported' ? (
                          <Badge tone="verified">Done</Badge>
                        ) : status === 'draft' ? (
                          <Badge tone="neutral">Draft</Badge>
                        ) : null}
                        <IconChevronRight size={17} className="shrink-0 text-[var(--label-tertiary)]" />
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}
          </div>

          <aside
            className="lg:sticky lg:col-start-2 lg:row-start-1"
            style={{ top: 'calc(var(--topbar-height) + var(--space-4))' }}
          >
            <Card className="flex flex-col gap-2">
              <h2 className="type-headline">What OneTUP does here</h2>
              <p className="type-footnote text-[var(--label-secondary)]">
                It makes the form quicker to fill in. It never answers it for you — the ratings are
                yours, and the comment stays in your own words.
              </p>
              <p className="type-footnote text-[var(--label-secondary)]">
                When you&rsquo;re done, your answers copy across to the official form in one go.
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </>
  )
}
