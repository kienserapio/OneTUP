import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { Onboarding } from '@/components/auth/onboarding'

export const metadata: Metadata = { title: 'Welcome' }

export default async function WelcomePage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const supabase = await supabaseServer()

  /**
   * Every term, not just the current one. The ERS sign-in reads past grades as
   * well as the schedule, and each semester it comes back with has to be placed
   * into a term the student picks from a list — loaded here so that list is
   * populated the moment the review appears rather than after they have scrolled
   * past it.
   */
  const [{ data: profile }, { data: areas }, { data: terms }] = await Promise.all([
    supabase.from('profiles').select('student_number, full_name, onboarded_at').eq('id', user.id).maybeSingle(),
    supabase.from('commute_areas').select('id, name, city').eq('is_active', true).order('name'),
    supabase
      .from('terms')
      .select('code, label, academic_year, ordinal, is_current')
      .order('academic_year', { ascending: false })
      .order('ordinal', { ascending: false }),
  ])

  if (profile?.onboarded_at) redirect('/today')

  const rows = terms ?? []
  const current = rows.find((term) => term.is_current)

  return (
    <Onboarding
      studentNumber={profile?.student_number ?? ''}
      emailVerified={Boolean(user.email_confirmed_at)}
      areas={areas ?? []}
      termCode={current?.code ?? ''}
      termLabel={current?.label ?? ''}
      terms={rows.map((term) => ({ code: term.code, label: term.label }))}
    />
  )
}
