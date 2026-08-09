import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { ScheduleResync } from '@/components/schedule/resync-view'

export const metadata: Metadata = { title: 'Re-sync' }

export default async function ScheduleResyncPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const supabase = await supabaseServer()
  const [{ data: profile }, { data: term }] = await Promise.all([
    supabase.from('profiles').select('student_number').eq('id', user.id).maybeSingle(),
    supabase.from('terms').select('code, label').eq('is_current', true).maybeSingle(),
  ])

  return (
    <ScheduleResync
      studentNumber={profile?.student_number ?? ''}
      emailVerified={Boolean(user.email_confirmed_at)}
      termCode={term?.code ?? ''}
      termLabel={term?.label ?? ''}
    />
  )
}
