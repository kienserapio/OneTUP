import type { Metadata } from 'next'
import { SiteNav } from '@/components/landing/site-nav'
import { SiteFooter } from '@/components/landing/site-footer'
import { ReportForm } from '@/components/report/report-form'
import { currentUser } from '@/lib/supabase/server'

/**
 * Report a problem.
 *
 * The footer used to send this to the repository, which is the right place for
 * someone who already has a GitHub account and the wrong place for everyone
 * else — most students who hit a bug here are not going to open an issue, they
 * are going to give up and go back to the group chat.
 *
 * Signed in, the email field arrives filled and the report is attached to the
 * account so it can be found later. Signed out, the form works exactly the
 * same: nothing here requires an account, because the person most likely to
 * report that sign-up is broken is someone who could not sign up.
 */

export const metadata: Metadata = {
  title: 'Report a problem',
  description:
    'Tell the students who build OneTUP that something is broken, confusing, or missing. No account needed.',
}

export default async function ReportPage() {
  const user = await currentUser()

  return (
    <>
      <SiteNav />

      <main id="main" style={{ background: 'var(--bg)' }}>
        <section className="mx-auto max-w-[46rem] px-6 pb-[var(--space-16)] pt-[calc(var(--space-16)+3rem)]">
          <p
            className="type-caption-1 font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--accent)' }}
          >
            Report a problem
          </p>
          <h1 className="mt-3 text-3xl leading-[1.15] tracking-tight sm:text-4xl">
            Something wrong? Tell us.
          </h1>
          <p className="type-body mt-4" style={{ color: 'var(--label-secondary)' }}>
            OneTUP is built by students, in between the same deadlines you have. That means bugs
            get through — and it means a report lands with a person who can fix it rather than a
            ticket queue. No account needed.
          </p>

          <div className="mt-[var(--space-10)]">
            <ReportForm signedInEmail={user?.email ?? null} />
          </div>

          <p
            className="type-footnote mt-[var(--space-8)]"
            style={{ color: 'var(--label-tertiary)' }}
          >
            OneTUP is a student project and not an official service of the Technological
            University of the Philippines. Anything that needs the registrar, your grades as
            recorded, or your enrolment still has to go through the university.
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
