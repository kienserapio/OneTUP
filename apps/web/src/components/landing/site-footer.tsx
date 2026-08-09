import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The footer.
 *
 * The identity line is the first thing here on purpose. A visitor who arrived
 * from a group chat needs to know, before anything else, that this is not the
 * university speaking.
 *
 * The three community links point at the repository. There is no repository URL
 * committed to this project yet, so rather than ship a plausible-looking dead
 * link they render as plain labels until `NEXT_PUBLIC_REPO_URL` is set.
 */

export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? null

/** A repository link where one is configured, the same label as text where it
 * is not. Never a link that goes nowhere. */
export function RepoLink({ children }: { children: ReactNode }) {
  if (!REPO_URL) return <span className="text-[var(--label-tertiary)]">{children}</span>
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[var(--label-secondary)] underline decoration-[var(--separator)] underline-offset-4"
    >
      {children}
    </a>
  )
}

function Dot() {
  return (
    <span aria-hidden className="text-[var(--label-quaternary)]">
      ·
    </span>
  )
}

export function SiteFooter() {
  return (
    <footer
      className="border-t"
      style={{ borderColor: 'var(--separator)', background: 'var(--bg-grouped)' }}
    >
      <div
        className="mx-auto w-full px-[var(--space-5)] pb-[calc(var(--space-12)+env(safe-area-inset-bottom))] pt-[var(--space-12)]"
        style={{ maxWidth: '68rem' }}
      >
        <p className="type-callout max-w-[30rem]">
          OneTUP — a student project, not an official TUP service.
        </p>

        <nav aria-label="Footer" className="mt-[var(--space-6)]">
          <ul className="type-subheadline flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-1)] text-[var(--label-secondary)]">
            <li>
              <FooterLink href="/campus">Campus</FooterLink>
            </li>
            <li aria-hidden>
              <Dot />
            </li>
            <li>
              <FooterLink href="/today">Open the app</FooterLink>
            </li>
            <li aria-hidden>
              <Dot />
            </li>
            <li>
              <FooterLink href="/privacy">Privacy</FooterLink>
            </li>
            <li aria-hidden>
              <Dot />
            </li>
            <li className="flex min-h-[var(--target-min)] items-center">
              <RepoLink>Contribute a route</RepoLink>
            </li>
            <li aria-hidden>
              <Dot />
            </li>
            <li className="flex min-h-[var(--target-min)] items-center">
              <RepoLink>Source code</RepoLink>
            </li>
            <li aria-hidden>
              <Dot />
            </li>
            <li className="flex min-h-[var(--target-min)] items-center">
              <RepoLink>Report a problem</RepoLink>
            </li>
          </ul>
        </nav>

        <p className="type-footnote mt-[var(--space-8)] text-[var(--label-tertiary)]">
          Map data © OpenStreetMap contributors.
        </p>
      </div>
    </footer>
  )
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href as never}
      className="flex min-h-[var(--target-min)] items-center underline decoration-[var(--separator)] underline-offset-4"
    >
      {children}
    </Link>
  )
}
