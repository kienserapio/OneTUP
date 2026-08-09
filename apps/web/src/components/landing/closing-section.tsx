import { ButtonLink } from '@/components/ui/button'
import { RepoLink } from './site-footer'

/**
 * What it does with your data, then the ask.
 *
 * The trust points come before the last call to action deliberately. A student
 * deciding whether to hand an ERS password to something a stranger built has one
 * question, and answering it after the button would be answering it too late.
 */

const TRUST_POINTS = [
  {
    title: 'Never saves your password',
    body: 'Not your ERS login, not your Facebook. Your ERS password is used once to read your schedule, then discarded. There’s no place in OneTUP where it’s stored.',
  },
  {
    title: 'Grades and cuts stay yours',
    body: 'Only you can see them. No section rankings, no aggregate reports, nothing visible to faculty or admin. Not now and not later — it’s built so that isn’t possible.',
  },
  {
    title: 'AI is labelled where it’s used',
    body: 'It drafts reviewers from your notes and helps phrase your own words. It never invents your grades, your prerequisites, or a jeepney route. Those come from your data or from real sources, with the source shown.',
  },
  {
    title: 'You can take it all with you',
    body: 'Export everything, any time. Delete your account and it’s actually deleted.',
  },
]

export function ClosingSection() {
  return (
    <>
      <section
        id="trust"
        className="scroll-mt-24 px-5 py-20 md:px-10 md:py-32"
        style={{ background: 'var(--bg)' }}
      >
        <div className="mx-auto max-w-6xl">
          <p
            className="type-caption-2 font-semibold uppercase tracking-widest"
            style={{ color: 'var(--label)' }}
          >
            Your data
          </p>
          <h2 className="mt-3 max-w-[20ch] text-3xl leading-[1.15] tracking-tight sm:text-4xl">
            What OneTUP does and doesn&rsquo;t do
          </h2>

          <ul className="mt-12 grid gap-8 sm:grid-cols-2 md:gap-12">
            {TRUST_POINTS.map((point) => (
              <li key={point.title}>
                <h3 className="type-headline">{point.title}</h3>
                <p className="type-callout mt-2" style={{ color: 'var(--label-secondary)' }}>
                  {point.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-5 pb-20 md:px-10 md:pb-32" style={{ background: 'var(--bg)' }}>
        <div
          className="card squircle mx-auto max-w-6xl rounded-[25px] px-6 py-16 text-center md:px-16 md:py-24"
          style={{ background: 'var(--surface-sunken)' }}
        >
          <h2 className="text-3xl leading-[1.15] tracking-tight sm:text-4xl md:text-5xl">
            Ready to stop guessing?
          </h2>
          <p
            className="type-body mx-auto mt-5 max-w-[46ch]"
            style={{ color: 'var(--label-secondary)' }}
          >
            Import your schedule once and OneTUP handles the rest — the alarms, the cuts, the
            deadlines, the commute.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/today" variant="accent" size="lg" className="w-full sm:w-auto">
              Open OneTUP
            </ButtonLink>
            <ButtonLink href="/campus" size="lg" className="w-full sm:w-auto">
              See the campus map
            </ButtonLink>
          </div>

          <div className="mt-14">
            <h3 className="type-headline">Built in the open</h3>
            <p
              className="type-footnote mx-auto mt-2 max-w-[52ch]"
              style={{ color: 'var(--label-secondary)' }}
            >
              If you want to help, or you found something wrong, the repository is the place.
            </p>
            {/* Plain text where no repository is configured. Never a link that
                goes nowhere. */}
            <p className="type-subheadline mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <RepoLink>View the source</RepoLink>
              <span aria-hidden style={{ color: 'var(--label-quaternary)' }}>
                ·
              </span>
              <RepoLink>Report something wrong</RepoLink>
              <span aria-hidden style={{ color: 'var(--label-quaternary)' }}>
                ·
              </span>
              <RepoLink>Contribute a route</RepoLink>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
