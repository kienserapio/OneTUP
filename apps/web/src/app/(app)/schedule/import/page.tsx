import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { ScheduleImport } from '@/components/schedule/import-view'

export const metadata: Metadata = { title: 'Import' }

export default async function ScheduleImportPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const supabase = await supabaseServer()
  const [{ data: profile }, { data: term }] = await Promise.all([
    supabase.from('profiles').select('student_number').eq('id', user.id).maybeSingle(),
    supabase.from('terms').select('code, label').eq('is_current', true).maybeSingle(),
  ])

  return (
    <ScheduleImport
      studentNumber={profile?.student_number ?? ''}
      emailVerified={Boolean(user.email_confirmed_at)}
      termCode={term?.code ?? ''}
      termLabel={term?.label ?? ''}
    />
  )
}
