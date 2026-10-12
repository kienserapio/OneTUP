import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/button'
import { IconArrow } from '@/components/ui/icon'
import { SiteNav } from './site-nav'
import { SiteFooter } from './site-footer'

/**
 * The shape the privacy and terms pages share.
 *
 * No reveals and no motion: these are pages someone opens because they want an
 * answer immediately, often while deciding whether to type a password into
 * something a stranger built. Anything that delays a line appearing is working
 * against them. One narrow column, generous leading, real headings.
 */

export function LegalPage({
  current,
  title,
  standfirst,
  children,
}: {
  current: 'privacy' | 'terms'
  title: string
  standfirst: string
  children: ReactNode
}) {
  return (
    <>
      <SiteNav />

      <main id="main" style={{ background: 'var(--canvas)' }}>
        <div
          className="mx-auto w-full px-[var(--space-5)] pb-[var(--space-16)] pt-[7rem]"
          style={{ maxWidth: '42rem' }}
        >
          <h1 className="text-[2.25rem] font-bold leading-[1.1] tracking-[-0.03em]">{title}</h1>
          <p
            className="mt-[var(--space-4)] text-[1.0625rem] font-medium leading-relaxed"
            style={{ color: 'var(--label-secondary)' }}
          >
            {standfirst}
          </p>

          <div className="mt-[var(--space-10)] flex flex-col gap-[var(--space-10)]">{children}</div>

          <div className="mt-[var(--space-12)]">
            {current === 'privacy' ? (
              <ButtonLink href="/terms" size="sm" trailing={<IconArrow size={16} />}>
                Terms of use
              </ButtonLink>
            ) : (
              <ButtonLink href="/privacy" size="sm" trailing={<IconArrow size={16} />}>
                Privacy
              </ButtonLink>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[1.5rem] font-bold tracking-[-0.025em]">{title}</h2>
      <div className="mt-[var(--space-4)] flex flex-col gap-[var(--space-4)]">{children}</div>
    </section>
  )
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-[1rem] font-medium leading-[1.7]" style={{ color: 'var(--label-secondary)' }}>
      {children}
    </p>
  )
}

/** Each point is its own floating card, with the point first and the
 * qualification second — the opposite order is how a policy hides things. */
export function Points({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="flex list-none flex-col gap-[var(--space-3)]">
      {items.map((item) => (
        <li key={item.title} className="card-glass lp-point">
          <h3 className="text-[1.0625rem] font-bold">{item.title}</h3>
          <p
            className="mt-[var(--space-1)] text-[0.9375rem] font-medium leading-relaxed"
            style={{ color: 'var(--label-secondary)' }}
          >
            {item.body}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function Aside({ children }: { children: ReactNode }) {
  return (
    <div className="lp-aside">
      <p className="text-[0.9375rem] font-semibold leading-relaxed">{children}</p>
    </div>
  )
}
