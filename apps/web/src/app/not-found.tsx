import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button'
import { NotFoundView } from '@/components/app/not-found-view'

/**
 * The global 404.
 *
 * Next renders this for any URL that matches no route at all, so it has to work
 * for a visitor who has never signed in. That is why it offers the front page
 * and the campus map rather than Today — sending a signed-out visitor to an
 * authenticated screen turns a wrong link into a sign-in wall.
 */

export const metadata: Metadata = { title: 'Not found' }

export default function NotFound() {
  return (
    <main id="main" className="app-container flex min-h-dvh flex-col justify-center py-16">
      <NotFoundView
        message="The link may be old, or the page may have moved. Everything else still works."
        actions={
          <>
            <ButtonLink href="/" variant="accent">
              Go to the front page
            </ButtonLink>
            <ButtonLink href="/campus">Campus map</ButtonLink>
          </>
        }
      />
    </main>
  )
}
