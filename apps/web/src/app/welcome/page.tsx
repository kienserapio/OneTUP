import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { Onboarding } from '@/components/auth/onboarding'

export const metadata: Metadata = { title: 'Welcome' }

export default async function WelcomePage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const supabase = await supabaseServer()

  const [{ data: profile }, { data: areas }, { data: term }] = await Promise.all([
    supabase.from('profiles').select('student_number, full_name, onboarded_at').eq('id', user.id).maybeSingle(),
    supabase.from('commute_areas').select('id, name, city').eq('is_active', true).order('name'),
    supabase.from('terms').select('code, label').eq('is_current', true).maybeSingle(),
  ])

  if (profile?.onboarded_at) redirect('/today')

  return (
    <Onboarding
      studentNumber={profile?.student_number ?? ''}
      emailVerified={Boolean(user.email_confirmed_at)}
      areas={areas ?? []}
      termCode={term?.code ?? ''}
      termLabel={term?.label ?? ''}
    />
  )
}
