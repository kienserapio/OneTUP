import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/supabase/server'
import { TabBar } from '@/components/app/tab-bar'
import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { SyncBoundary } from '@/components/app/sync-boundary'

/**
 * The authenticated shell.
 *
 * A sidebar above 900px, a floating bar below — the same navigation rendered
 * two ways rather than two navigations. The badge counts are read here, once,
 * so every screen agrees on them without each one querying.
 *
 * A student who signed up but never finished onboarding lands in the onboarding
 * flow rather than on an empty Today screen: an app with nothing in it reads as
 * broken, not as new.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const supabase = await supabaseServer()

  const [{ data: profile }, deadlines, announcements] = await Promise.all([
    supabase
      .from('profiles')
      .select('onboarded_at, full_name, program_code, year_level, section_label')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('deadlines')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .lte('due_at', new Date(Date.now() + 48 * 3_600_000).toISOString()),
    supabase
      .from('announcements')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString()),
  ])

  if (!profile?.onboarded_at) redirect('/welcome')

  const yearSection = [
    profile.year_level ? `${profile.year_level}${ordinal(profile.year_level)} year` : null,
    profile.section_label,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <SyncBoundary>
      <div className="shell">
        <Sidebar
          fullName={profile.full_name}
          programCode={profile.program_code}
          yearSection={yearSection || null}
          counts={{ deadlines: deadlines.count ?? 0, announcements: announcements.count ?? 0 }}
        />

        <div className="shell-main">
          <Topbar />
          <main id="main" className="app-scroll">
            {children}
          </main>
        </div>
      </div>
      <TabBar />
    </SyncBoundary>
  )
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}
