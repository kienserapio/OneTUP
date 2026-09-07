import type { Metadata } from 'next'
import { Card } from '@/components/ui/surfaces'
import { NotFoundView } from '@/components/app/not-found-view'

/**
 * The 404 inside the signed-in shell.
 *
 * Anything that calls `notFound()` from an authenticated screen lands here, so
 * it keeps the sidebar, the tab bar and the student's place in the app. Dropping
 * to the bare global 404 would make a missing deadline look like a broken
 * install.
 */

export const metadata: Metadata = { title: 'Not found' }

export default function AppNotFound() {
  return (
    <div className="app-container py-6">
      <Card padded={false}>
        <NotFoundView message="The link may be old, or whatever it pointed at has been deleted. Nothing else in your account has changed." />
      </Card>
    </div>
  )
}
