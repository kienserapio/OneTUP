import Link from 'next/link'
import type { ReactNode } from 'react'
import { Mark } from '@/components/ui/mark'

/**
 * The footer.
 *
 * The identity line is the first thing here on purpose. A visitor who arrived
 * from a group chat needs to know, before anything else, that this is not the
 * university speaking.
 *
 * Nothing here is underlined. A footer is a list of destinations, not prose with
 * links buried in it — gray at rest, crimson on hover, and position already says
 * these are links. It sits on the same light canvas as the page above it.
 *
 * The three community links point at the repository. There is no repository URL
 * committed to this project yet, so rather than ship a plausible-looking dead
 * link they render as plain labels until `NEXT_PUBLIC_REPO_URL` is set.
 */

export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? null

/** A repository link where one is configured, the same label as text where it
 * is not. Never a link that goes nowhere. */
export function RepoLink({ children }: { children: ReactNode }) {
  if (!REPO_URL) return <span className="lp-link-muted">{children}</span>
  return (
    <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="lp-link">
      {children}
    </a>
  )
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href as never}
      className="lp-link flex min-h-[36px] items-center text-[0.9375rem]"
    >
      {children}
    </Link>
  )
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="lp-footer-title">{title}</h2>
      <ul className="mt-[var(--space-2)] flex flex-col">{children}</ul>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer style={{ background: 'var(--canvas)' }}>
      <div
        className="mx-auto w-full px-[var(--space-5)] pb-[calc(var(--space-10)+env(safe-area-inset-bottom))] pt-[var(--space-12)]"
        style={{ maxWidth: '68rem' }}
      >
        <div className="flex flex-col gap-[var(--space-10)] md:flex-row md:justify-between">
          <div className="max-w-[22rem]">
            <span className="flex items-center gap-[var(--space-2)]">
              <Mark size={28} className="shrink-0" />
              <span className="text-[1.0625rem] font-bold tracking-[-0.02em]">OneTUP</span>
            </span>
            <p
              className="mt-[var(--space-3)] text-[0.9375rem] font-medium leading-relaxed"
              style={{ color: 'var(--label-secondary)' }}
            >
              One app for your TUP student life — a student project, not an official TUP service.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-[var(--space-8)] sm:grid-cols-3 md:gap-[var(--space-12)]"
          >
            <Column title="Product">
              <li>
                <FooterLink href="/today">Open the app</FooterLink>
              </li>
              <li>
                <FooterLink href="/#features">Features</FooterLink>
              </li>
              <li>
                <FooterLink href="/docs">Docs</FooterLink>
              </li>
            </Column>

            <Column title="Campus">
              <li>
                <FooterLink href="/campus">Campus map</FooterLink>
              </li>
              <li>
                <FooterLink href="/#about">About OneTUP</FooterLink>
              </li>
              <li className="flex min-h-[36px] items-center">
                <span className="text-[0.9375rem]">
                  <RepoLink>Contribute a route</RepoLink>
                </span>
              </li>
            </Column>

            <Column title="More">
              <li>
                <FooterLink href="/privacy">Privacy</FooterLink>
              </li>
              <li>
                <FooterLink href="/terms">Terms</FooterLink>
              </li>
              <li className="flex min-h-[36px] items-center">
                <span className="text-[0.9375rem]">
                  <RepoLink>Source code</RepoLink>
                </span>
              </li>
              <li>
                <FooterLink href="/contributors">Contributors</FooterLink>
              </li>
              {/* Was a repository link. Most students who hit a bug do not have
                  a GitHub account and were never going to open an issue, so it
                  now points at a form that needs no account. */}
              <li>
                <FooterLink href="/report">Report a problem</FooterLink>
              </li>
            </Column>
          </nav>
        </div>

        <div
          className="mt-[var(--space-10)] flex flex-wrap items-center justify-between gap-[var(--space-3)] border-t pt-[var(--space-5)]"
          style={{ borderColor: 'var(--separator-opaque)' }}
        >
          <p className="text-[0.8125rem] font-medium" style={{ color: 'var(--label-tertiary)' }}>
            Map data © OpenStreetMap contributors. Virtual tour by TUPniverse.
          </p>
          <p className="text-[0.8125rem] font-medium" style={{ color: 'var(--label-tertiary)' }}>
            Built by TUP students, for TUP students.
          </p>
        </div>
      </div>
    </footer>
  )
}
