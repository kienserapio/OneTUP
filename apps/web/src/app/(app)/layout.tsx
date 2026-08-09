import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { TabBar } from '@/components/app/tab-bar'
import { SyncBoundary } from '@/components/app/sync-boundary'

/**
 * The authenticated shell.
 *
 * A student who has signed up but never finished onboarding lands in the
 * onboarding flow rather than on an empty Today screen — an app with nothing in
 * it reads as broken, not as new.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.onboarded_at) redirect('/welcome')

  return (
    <SyncBoundary>
      <div className="app-scroll">
        <main id="main">{children}</main>
      </div>
      <TabBar />
    </SyncBoundary>
  )
}
