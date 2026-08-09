import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { EvaluationForm, NoInstrument } from '@/components/evaluations/evaluation-form'

export const metadata: Metadata = { title: 'Evaluate' }

interface Question {
  id: string
  text: string
  ordinal: number
}

export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>
}) {
  const { enrollmentId } = await params
  const user = await currentUser()
  if (!user) notFound()

  const supabase = await supabaseServer()

  const [{ data: instrument }, { data: enrollment }] = await Promise.all([
    supabase
      .from('evaluation_instruments')
      .select('id, questions')
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('enrollments')
      .select('id, faculty_name, courses(code)')
      .eq('id', enrollmentId)
      .maybeSingle(),
  ])

  if (!instrument) return <NoInstrument />
  if (!enrollment?.faculty_name) notFound()

  const questions = ((instrument.questions ?? []) as unknown as Question[])
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)

  // The draft row is created on first open rather than on first answer, so an
  // autosave has somewhere to land from the very first keystroke.
  const { data: evaluation } = await supabase
    .from('evaluations')
    .upsert(
      {
        user_id: user.id,
        enrollment_id: enrollmentId,
        instrument_id: instrument.id,
        faculty_name: enrollment.faculty_name,
      },
      { onConflict: 'user_id,enrollment_id,instrument_id' },
    )
    .select('id, comment_bullets, comment_final, status')
    .single()

  if (!evaluation) notFound()

  const { data: answers } = await supabase
    .from('evaluation_answers')
    .select('question_id, value')
    .eq('evaluation_id', evaluation.id)

  const course = enrollment.courses as unknown as { code: string } | null

  return (
    <EvaluationForm
      instrumentId={instrument.id}
      questions={questions}
      subject={{
        evaluationId: evaluation.id,
        enrollmentId,
        facultyName: enrollment.faculty_name,
        courseCode: course?.code ?? '',
        status: evaluation.status as 'draft' | 'complete' | 'exported',
      }}
      initialAnswers={Object.fromEntries(
        (answers ?? []).map((answer) => [answer.question_id, answer.value]),
      )}
      initialBullets={evaluation.comment_bullets ?? ''}
      initialFinal={evaluation.comment_final ?? ''}
    />
  )
}
