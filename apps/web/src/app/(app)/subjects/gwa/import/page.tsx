import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { GradesImport } from '@/components/subjects/grades-import'

export const metadata: Metadata = { title: 'Import grades' }

/**
 * The term list is loaded here rather than in the client so the review screen
 * can offer real semesters the moment it renders. A student importing four
 * years of history has to place each group into a term, and a select that
 * populates late is a select they will have already scrolled past.
 */
export default async function GradesImportPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const supabase = await supabaseServer()
  const [{ data: profile }, { data: terms }] = await Promise.all([
    supabase.from('profiles').select('student_number').eq('id', user.id).maybeSingle(),
    supabase
      .from('terms')
      .select('code, label, academic_year, ordinal, is_current')
      .order('academic_year', { ascending: false })
      .order('ordinal', { ascending: false }),
  ])

  const rows = terms ?? []

  return (
    <GradesImport
      studentNumber={profile?.student_number ?? ''}
      emailVerified={Boolean(user.email_confirmed_at)}
      terms={rows.map((term) => ({ code: term.code, label: term.label }))}
      currentTermCode={rows.find((term) => term.is_current)?.code ?? null}
    />
  )
}
