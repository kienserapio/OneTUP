import type { Metadata } from 'next'
import { supabaseServer } from '@/lib/supabase/server'
import { NavBar } from '@/components/app/nav-bar'
import { Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { IconStudy } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { Row, RowList, RowPill } from '@/components/ui/row'

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
        info={
          <InfoTip title="What OneTUP does here">
            It makes the form quicker to fill in. It never answers it for you — the ratings are
            yours, and the comment stays in your own words. When you&rsquo;re done, your answers
            copy across to the official form in one go.
          </InfoTip>
        }
      />

      <div className="app-container pb-6">
        {!instrument ? (
          <Card>
            <EmptyState
              icon={<IconTile Icon={IconStudy} tone="crimson" variant="solid" size={56} />}
              title="The form for this term hasn't been set up yet. It'll appear here when the evaluation period opens."
            />
          </Card>
        ) : withFaculty.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconTile Icon={IconStudy} tone="crimson" variant="solid" size={56} />}
              title="No subjects with a faculty member listed. Import or add your schedule first."
            />
          </Card>
        ) : (
          <section>
            <SectionHeader
              action={
                <span className="text-[0.8125rem] font-semibold tabular-nums text-[var(--label-tertiary)]">
                  {done}/{withFaculty.length}
                </span>
              }
            >
              Your subjects
            </SectionHeader>
            <RowList className="lg:!grid lg:grid-cols-2 lg:gap-3">
              {withFaculty.map((enrollment) => {
                const course = enrollment.courses as unknown as {
                  code: string
                  title: string
                } | null
                const status = statusByEnrollment.get(enrollment.id)
                return (
                  <Row
                    key={enrollment.id}
                    href={`/evaluations/${enrollment.id}`}
                    leading={<IconTile Icon={IconStudy} tone="gray" size={40} />}
                    title={enrollment.faculty_name}
                    detail={course?.title}
                    muted={status === 'exported'}
                    meta={
                      <>
                        {course && <RowPill>{course.code}</RowPill>}
                        {status === 'exported' ? (
                          <RowPill tone="green">Done</RowPill>
                        ) : status === 'draft' ? (
                          <RowPill tone="crimson">Draft</RowPill>
                        ) : null}
                      </>
                    }
                  />
                )
              })}
            </RowList>
          </section>
        )}
      </div>
    </>
  )
}
