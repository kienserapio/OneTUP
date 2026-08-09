import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { SettingsView } from '@/components/settings/settings-view'

export const metadata: Metadata = { title: 'Settings' }

/**
 * The profile block is read here rather than in the client view: a student's
 * own name, number and program are already on the server for this request, and
 * fetching them again from the browser would show an empty card first.
 */
export default async function SettingsPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, student_number, program_code, year_level, section_label, campus')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <SettingsView
      profile={{
        fullName: profile?.full_name ?? null,
        studentNumber: profile?.student_number ?? null,
        programCode: profile?.program_code ?? null,
        yearLevel: profile?.year_level ?? null,
        sectionLabel: profile?.section_label ?? null,
        campus: profile?.campus ?? null,
        email: user.email ?? null,
      }}
    />
  )
}
