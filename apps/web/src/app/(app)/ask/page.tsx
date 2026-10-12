import type { Metadata } from 'next'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { AskView } from '@/components/ask/ask-view'
import { firstName } from '@/lib/name'

export const metadata: Metadata = { title: 'Ask' }

export default async function AskPage() {
  const user = await currentUser()
  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id ?? '')
    .maybeSingle()

  return <AskView firstName={firstName(profile?.full_name ?? null)} />
}
