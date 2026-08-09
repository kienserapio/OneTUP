import type { Metadata } from 'next'
import { supabaseServer } from '@/lib/supabase/server'
import { NavBar } from '@/components/app/nav-bar'
import { Card, EmptyState, ListGroup, ListRow } from '@/components/ui/surfaces'
import { Badge } from '@/components/ui/surfaces'

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

  return (
    <>
      <NavBar
        title="Faculty evaluation"
        subtitle={instrument ? undefined : 'Not open yet'}
      />

      <div className="app-container stack">
        <Card>
          <p className="type-body">
            OneTUP makes this quicker to fill in. It never answers it for you — the ratings are
            yours, and the comment stays in your own words.
          </p>
        </Card>

        {!instrument ? (
          <Card>
            <EmptyState title="The form for this term hasn't been set up yet. It'll appear here when the evaluation period opens." />
          </Card>
        ) : withFaculty.length === 0 ? (
          <Card>
            <EmptyState title="No subjects with a faculty member listed. Import or add your schedule first." />
          </Card>
        ) : (
          <ListGroup>
            {withFaculty.map((enrollment) => {
              const course = enrollment.courses as unknown as { code: string; title: string } | null
              const status = statusByEnrollment.get(enrollment.id)
              return (
                <ListRow
                  key={enrollment.id}
                  href={`/evaluations/${enrollment.id}`}
                  title={enrollment.faculty_name ?? 'Faculty'}
                  subtitle={course ? `${course.code} — ${course.title}` : undefined}
                  trailing={
                    status === 'exported' ? (
                      <Badge tone="verified">Done</Badge>
                    ) : status === 'draft' ? (
                      <Badge tone="neutral">Draft</Badge>
                    ) : undefined
                  }
                />
              )
            })}
          </ListGroup>
        )}
      </div>
    </>
  )
}
