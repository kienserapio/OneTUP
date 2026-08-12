import type { ReactNode } from 'react'
import Link from 'next/link'
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

      <main id="main" style={{ background: 'var(--bg-grouped)' }}>
        <div
          className="mx-auto w-full px-[var(--space-5)] pb-[var(--space-16)] pt-[7rem]"
          style={{ maxWidth: '42rem' }}
        >
          <h1 className="type-large-title">{title}</h1>
          <p className="type-body mt-[var(--space-4)]">{standfirst}</p>

          <div className="mt-[var(--space-10)] flex flex-col gap-[var(--space-10)]">{children}</div>

          <p className="type-subheadline mt-[var(--space-12)]">
            {current === 'privacy' ? (
              <Link
                href="/terms"
                className="underline decoration-[var(--separator)] underline-offset-4"
              >
                Terms of use
              </Link>
            ) : (
              <Link
                href="/privacy"
                className="underline decoration-[var(--separator)] underline-offset-4"
              >
                Privacy
              </Link>
            )}
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="type-title-2">{title}</h2>
      <div className="mt-[var(--space-4)] flex flex-col gap-[var(--space-4)]">{children}</div>
    </section>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="type-body">{children}</p>
}

/** Numbered or plain, but always with the point first and the qualification
 * second — the opposite order is how a policy hides things. */
export function Points({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="flex list-none flex-col gap-[var(--space-5)]">
      {items.map((item) => (
        <li key={item.title}>
          <h3 className="type-headline">{item.title}</h3>
          <p className="type-callout mt-[var(--space-1)]">{item.body}</p>
        </li>
      ))}
    </ul>
  )
}

export function Aside({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius-md)] p-[var(--space-4)]"
      style={{ background: 'var(--fill-quaternary)' }}
    >
      <p className="type-callout">{children}</p>
    </div>
  )
}
