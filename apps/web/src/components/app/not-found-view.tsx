import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/button'

/**
 * The 404.
 *
 * One component behind every not-found state in the product, so a mistyped URL,
 * a deleted deadline and a subject that fell out of an enrolment all say the
 * same thing in the same shape. The copy names what is missing and offers the
 * screen the student was probably heading for — a dead end with no way out is
 * the part of a 404 that actually costs something.
 *
 * The numeral is decorative and hidden from assistive technology; the heading
 * carries the meaning.
 */

export interface NotFoundViewProps {
  /** What was not found, in the student's terms. */
  title?: string
  message?: string
  /** Replaces the default pair of links when a screen has a better next step. */
  actions?: ReactNode
}

export function NotFoundView({
  title = "That page isn't here",
  message = 'The link may be old, or the page may have moved. Nothing in your account has changed.',
  actions,
}: NotFoundViewProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <p aria-hidden className="type-data text-[5rem] leading-none text-[var(--fill-tertiary)]">
        404
      </p>
      <h1 className="type-title-3">{title}</h1>
      <p className="type-callout max-w-[26rem] text-balance text-[var(--label-secondary)]">
        {message}
      </p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {actions ?? (
          <>
            <ButtonLink href="/today" variant="accent">
              Go to Today
            </ButtonLink>
            <ButtonLink href="/campus">Campus map</ButtonLink>
          </>
        )}
      </div>
    </div>
  )
}
