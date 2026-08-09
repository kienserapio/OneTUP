import Link from 'next/link'
import { ButtonLink } from '@/components/ui/button'
import { cx } from '@/lib/cx'

/**
 * Public chrome.
 *
 * One bar, translucent, with the page scrolling underneath it rather than being
 * pushed down by it. At 320px it holds the wordmark and the one action that
 * matters; the campus link joins them as soon as there is room, because a
 * cramped row of three is worse than a clear row of two.
 */
export function SiteHeader({ current }: { current?: 'campus' | 'privacy' | 'terms' }) {
  return (
    <header
      className="material-chrome sticky top-0 z-30"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div
        className="mx-auto flex w-full items-center gap-[var(--space-3)] px-[var(--space-4)]"
        style={{ maxWidth: '68rem', minHeight: '60px' }}
      >
        <Link
          href="/"
          className="type-headline flex min-h-[var(--target-min)] items-center pr-[var(--space-1)]"
        >
          OneTUP
        </Link>

        <span className="flex-1" />

        <Link
          href="/campus"
          aria-current={current === 'campus' ? 'page' : undefined}
          className={cx(
            'type-subheadline hidden min-h-[var(--target-min)] items-center px-[var(--space-2)] sm:flex',
            current === 'campus' ? 'text-[var(--label)]' : 'text-[var(--label-secondary)]',
          )}
        >
          Campus map
        </Link>

        {/* Deliberately the full 44px control, not the small one. This is the
            action the whole page exists to offer, and a thumb has to be able to
            hit it without aiming. */}
        <ButtonLink href="/today" variant="accent">
          Open OneTUP
        </ButtonLink>
      </div>
    </header>
  )
}
