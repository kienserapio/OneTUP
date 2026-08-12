import type { Metadata } from 'next'
import { SiteNav } from '@/components/landing/site-nav'
import { SiteFooter, REPO_URL } from '@/components/landing/site-footer'
import { ButtonLink } from '@/components/ui/button'
import { IconArrow } from '@/components/ui/icon'
import { Reveal, Stagger, StaggerItem } from '@/components/landing/reveal'
import { Initials, ContributorSlots } from '@/components/landing/contributors'

/**
 * Contributors.
 *
 * A credits page, in the order the work actually happened: the person who built
 * the thing, then the two projects it was built on top of, then the door held
 * open for whoever turns up next.
 *
 * Every name here is a real student with a real university address, so nothing
 * on this page is a `mailto:` that opens a client with their address prefilled
 * for a stranger — the address is written out, and copying it is a deliberate
 * act.
 *
 * Set in SF Pro Rounded end to end. The Instrument faces belong to the hero and
 * to nothing else: a second page in the display face makes it a house style
 * rather than a signature.
 *
 * Every section is wrapped in a `Reveal` so the whole page arrives with the one
 * rise-and-settle gesture the rest of the site uses, and the gaps between them
 * are wide enough that each one reads as its own idea.
 */

export const metadata: Metadata = {
  title: 'Contributors',
  description:
    'The students behind OneTUP, the projects it stands on, and how to add your name to the list.',
}

const LEAD = {
  name: 'Kien Leriss Serapio',
  section: 'BSCS-4B',
  year: "'2027",
  email: 'kienleriss.serapio@tup.edu.ph',
  role: 'Design and engineering',
}

const CREDITS = [
  {
    project: 'TUPniverse',
    blurb:
      'The 360° virtual campus tour. Every scene you walk through on the campus page is their work, not ours.',
    people: [
      { name: 'Lowel-Jay Rubino', section: 'BSCS-4B', year: "'2027", email: 'loweljay.rubino@tup.edu.ph' },
      { name: 'Alltessa Jane Rosimo', section: 'BSCS-4B', year: "'2027", email: 'alltessajane.rosimo@tup.edu.ph' },
      { name: 'Samantha Egar', section: 'BSCS-4B', year: "'2027", email: 'samantha.egar@tup.edu.ph' },
      { name: 'Nicole Dela Cruz', section: 'BSCS-4B', year: "'2027", email: 'nicole.delacruz@tup.edu.ph' },
    ],
  },
  {
    project: 'ERS Schedule',
    blurb:
      'The groundwork on reading a schedule out of ERS — the problem that had to be solved before any of the rest of this was possible.',
    people: [
      { name: 'Dan Jheniel Bringas', section: 'BSCS-4B', year: "'2027", email: 'danjheniel.bringas@tup.edu.ph' },
    ],
  },
] as const

const STEPS = [
  {
    n: '01',
    title: 'Find something that annoys you',
    body: 'The best first contribution is a thing you personally hit. A wrong room code, a route that takes you the long way, a button that lies about what it does.',
  },
  {
    n: '02',
    title: 'Open an issue before you open a pull request',
    body: 'Say what you want to change and why. It takes five minutes and it saves you writing something that was already being written by someone else.',
  },
  {
    n: '03',
    title: 'Fork it, branch it, break it locally',
    body: 'Clone your fork, run pnpm install, then pnpm dev. Make the change on a branch named for the thing it does. Nothing you do locally can affect anyone else.',
  },
  {
    n: '04',
    title: 'Send the pull request',
    body: 'Small and finished beats large and nearly. Describe what changed and what you checked. Your name lands on this page when it merges.',
  },
] as const

function Person({
  name,
  section,
  year,
  email,
  size = 'sm',
}: {
  name: string
  section: string
  year: string
  email: string
  size?: 'sm' | 'lg'
}) {
  const large = size === 'lg'
  return (
    <div className="flex items-center gap-[var(--space-4)]">
      <Initials name={name} large={large} />
      <div className="min-w-0">
        <p className={large ? 'type-title-3' : 'type-subheadline font-medium'}>{name}</p>
        <p
          className={large ? 'type-subheadline mt-0.5' : 'type-footnote mt-0.5'}
          style={{ color: 'var(--label-secondary)' }}
        >
          {section} · {year}
        </p>
        {/* Written out rather than linked. A university address on a public
            page should not be one click from a stranger's mail client. */}
        <p
          className="type-footnote mt-1 break-all font-mono"
          style={{ color: 'var(--label-tertiary)' }}
        >
          {email}
        </p>
      </div>
    </div>
  )
}

export default function ContributorsPage() {
  return (
    <>
      <SiteNav />

      <main id="main" style={{ background: 'var(--bg)' }}>
        {/* --- Nameplate ------------------------------------------------- */}
        <section className="mx-auto max-w-[62rem] px-6 pb-[calc(var(--space-16)+var(--space-8))] pt-[calc(var(--space-16)+3rem)] sm:pb-[calc(var(--space-16)*2)]">
          <Reveal>
            <p
              className="type-caption-1 font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--accent)' }}
            >
              Contributors
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Made by students
              <span className="block" style={{ color: 'var(--accent)' }}>
                who had class.
              </span>
            </h1>
            <p className="type-body mt-6 max-w-[38rem]" style={{ color: 'var(--label-secondary)' }}>
              Nobody was paid for this and nobody was assigned it. Everything below happened around
              a full load of subjects, which is the only reason it looks like it was built by
              people who use it.
            </p>
          </Reveal>
        </section>

        {/* --- The lead -------------------------------------------------- */}
        <section className="mx-auto max-w-[62rem] px-6">
          <Reveal>
            <div
              className="squircle relative overflow-hidden rounded-[var(--radius-xl)] border p-[var(--space-8)] sm:p-[var(--space-10)]"
              style={{
                borderColor: 'var(--separator)',
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--surface-sunken)) 0%, var(--surface-sunken) 55%)',
              }}
            >
              {/* A quiet piece of decoration: the mark, blown up and clipped by
                  the card, so the panel has depth without a stock photograph. */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-20 hidden h-56 w-56 select-none rounded-full sm:block"
                style={{
                  background:
                    'radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)',
                }}
              />

              <p
                className="type-caption-2 font-semibold uppercase tracking-widest"
                style={{ color: 'var(--accent)' }}
              >
                {LEAD.role}
              </p>
              <div className="mt-[var(--space-5)]">
                <Person {...LEAD} size="lg" />
              </div>
              <p
                className="type-body mt-[var(--space-6)] max-w-[34rem]"
                style={{ color: 'var(--label-secondary)' }}
              >
                Built the app you are looking at — the schedule importer, the attendance and GWA
                maths, the commute planner, the offline layer, and every screen in between.
              </p>
            </div>
          </Reveal>
        </section>

        {/* --- Credits --------------------------------------------------- */}
        <section className="mx-auto max-w-[62rem] px-6 pt-[calc(var(--space-16)+var(--space-8))] sm:pt-[calc(var(--space-16)*2+var(--space-8))]">
          <Reveal>
            <h2 className="type-title-2">Standing on</h2>
            <p className="type-body mt-2 max-w-[38rem]" style={{ color: 'var(--label-secondary)' }}>
              Two student projects OneTUP would not exist without. Their work is inside this one.
            </p>
          </Reveal>

          {/* `items-start`, so a credit with one name is the height of one name
              rather than being stretched to match the four beside it. */}
          <div className="mt-[var(--space-8)] grid grid-cols-1 items-start gap-[var(--space-5)] lg:grid-cols-2">
            {CREDITS.map((credit) => (
              <Reveal key={credit.project}>
                <div
                  className="squircle rounded-[var(--radius-xl)] border p-[var(--space-6)]"
                  style={{ borderColor: 'var(--separator)', background: 'var(--surface-sunken)' }}
                >
                  <h3 className="type-headline">{credit.project}</h3>
                  <p
                    className="type-footnote mt-1.5"
                    style={{ color: 'var(--label-secondary)' }}
                  >
                    {credit.blurb}
                  </p>

                  <ul className="mt-[var(--space-5)] flex flex-col gap-[var(--space-4)]">
                    {credit.people.map((person) => (
                      <li key={person.email}>
                        <Person {...person} />
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* --- Open slots ------------------------------------------------ */}
        <section className="mx-auto max-w-[62rem] px-6 pt-[calc(var(--space-16)+var(--space-8))] sm:pt-[calc(var(--space-16)*2+var(--space-8))]">
          <Reveal>
            <h2 className="type-title-2">OneTUP Contributors</h2>
            <p className="type-body mt-2 max-w-[38rem]" style={{ color: 'var(--label-secondary)' }}>
              These fill in as people send changes. Right now they are empty, which is the most
              honest thing this page can say — and the easiest gap anyone has ever had to fill.
            </p>
          </Reveal>

          <div className="mt-[var(--space-8)]">
            <ContributorSlots />
          </div>
        </section>

        {/* --- How to contribute ----------------------------------------- */}
        <section className="mx-auto max-w-[62rem] px-6 pb-[calc(var(--space-16)+var(--space-8))] pt-[calc(var(--space-16)+var(--space-8))] sm:pb-[calc(var(--space-16)*2)] sm:pt-[calc(var(--space-16)*2+var(--space-8))]">
          <Reveal
            className="squircle rounded-[var(--radius-xl)] border p-[var(--space-8)] sm:p-[var(--space-10)]"
            style={{ borderColor: 'var(--separator)' }}
          >
            {/* No `Reveal` of its own — the card it sits in is the reveal, and
                nesting two would make the heading arrive after its own panel. */}
            <h2 className="type-title-2">Never contributed to anything before?</h2>
            <p className="type-body mt-2 max-w-[40rem]" style={{ color: 'var(--label-secondary)' }}>
              Neither had anyone here. The whole repository is open, the stack is TypeScript and
              Postgres, and the first pull request is mostly about getting over the idea that you
              need permission.
            </p>

            <Stagger className="mt-[var(--space-8)] grid grid-cols-1 gap-[var(--space-5)] sm:grid-cols-2">
              {STEPS.map((step) => (
                <StaggerItem key={step.n}>
                  <div className="flex gap-[var(--space-4)]">
                    <span
                      className="type-footnote grid h-8 w-8 shrink-0 place-items-center rounded-full font-semibold"
                      style={{
                        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                        color: 'var(--accent)',
                      }}
                    >
                      {step.n}
                    </span>
                    <div>
                      <h3 className="type-subheadline font-medium">{step.title}</h3>
                      <p
                        className="type-footnote mt-1"
                        style={{ color: 'var(--label-secondary)' }}
                      >
                        {step.body}
                      </p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            <div className="mt-[var(--space-8)] flex flex-col gap-[var(--space-3)] sm:flex-row sm:items-center">
              {REPO_URL ? (
                <ButtonLink
                  href={REPO_URL}
                  variant="accent"
                  size="lg"
                  trailing={<IconArrow size={18} className="shrink-0" />}
                >
                  Open the repository
                </ButtonLink>
              ) : null}
              <ButtonLink href="/report" size="lg">
                Report a problem instead
              </ButtonLink>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
