import { ButtonLink } from '@/components/ui/button'

export const metadata = { title: 'Offline' }

export default function OfflinePage() {
  return (
    <main id="main" className="app-container flex min-h-dvh flex-col justify-center gap-4 py-16">
      <h1 className="type-title-1">You&rsquo;re offline</h1>
      <p className="type-body text-[var(--label-secondary)]">
        This page hasn&rsquo;t been saved to your phone yet. Your schedule, deadlines and cuts are
        all still there.
      </p>
      <div>
        <ButtonLink href="/today" variant="accent">
          Go to Today
        </ButtonLink>
      </div>
    </main>
  )
}
