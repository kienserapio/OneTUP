import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/surfaces'
import {
  IconAlarm,
  IconAnnouncement,
  IconCheck,
  IconCommute,
  IconDeadlines,
  IconSubjects,
} from '@/components/ui/icon'
import { cx } from '@/lib/cx'
import { Reveal } from './reveal'
import { CommuteDemo } from './commute-demo'
import { DepartureDemo } from './departure-demo'
import { RepoLink } from './site-footer'

/* --- Shared shapes -------------------------------------------------------
 *
 * Every section is the same column at the same rhythm. What changes between
 * them is the ground they sit on — the page grey and the card white alternate,
 * which is enough separation that no section needs a rule drawn under it.
 */

export function Section({
  id,
  tone = 'base',
  children,
}: {
  id?: string
  tone?: 'base' | 'raised'
  children: ReactNode
}) {
  return (
    <section
      id={id}
      style={{
        background: tone === 'raised' ? 'var(--bg-grouped-secondary)' : 'var(--bg-grouped)',
      }}
    >
      <div
        className="mx-auto w-full px-[var(--space-5)] py-[var(--space-16)]"
        style={{ maxWidth: '68rem' }}
      >
        {children}
      </div>
    </section>
  )
}

/** The section-header idiom, at the full label colour — at 13px the system's
 * secondary grey does not clear AA against either ground. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="type-section-header" style={{ color: 'var(--label)' }}>
      {children}
    </p>
  )
}

function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('type-large-title', className)}>{children}</h2>
}

/** Body copy at reading measure. Nothing here runs past about 58 characters,
 * which is where a line stops being scannable on a phone held one-handed. */
function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('type-body max-w-[58ch]', className)}>{children}</p>
}

function Separator() {
  return (
    <li aria-hidden style={{ color: 'var(--label-quaternary)' }}>
      ·
    </li>
  )
}

/* --- Section 2 — The problem --------------------------------------------- */

export function ProblemSection() {
  return (
    <Section tone="raised">
      <Reveal>
        <Heading className="max-w-[20ch]">
          You already have a system. It&rsquo;s six group chats and a Notes app.
        </Heading>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-[var(--space-6)] flex flex-col gap-[var(--space-4)]">
          <Lead>
            Your schedule is in ERS. Your deadlines are in whichever GC someone remembered to post
            in. Your grades are wherever you last did the maths by hand. Your cuts are in your head,
            until the day you find out you were wrong.
          </Lead>
          <Lead>
            None of it talks to each other. All of it is your job to keep track of, on top of
            actually studying.
          </Lead>
          <p className="type-title-3 mt-[var(--space-2)] max-w-[58ch]">
            OneTUP is the part that keeps track.
          </p>
        </div>
      </Reveal>
    </Section>
  )
}

/* --- Section 3 — What it does -------------------------------------------- */

const FEATURES = [
  {
    icon: IconAlarm,
    title: 'Your next class, and when to leave for it',
    body: 'OneTUP works backwards from your first class — how long the commute takes, whether it’s rush hour, whether it’s raining, how long you take to get ready — and tells you when to wake up and when to walk out the door.',
  },
  {
    icon: IconCheck,
    title: 'Cuts, counted for you',
    body: 'One tap after class. OneTUP does the arithmetic and warns you before you hit the limit, per subject, so you find out with two absences left instead of none.',
  },
  {
    icon: IconSubjects,
    title: 'GWA, and what you’d need',
    body: 'See where you stand now. Set a target and see the grade each remaining subject needs to get you there. Get warned when a scholarship or Dean’s List threshold starts slipping.',
  },
  {
    icon: IconDeadlines,
    title: 'Every deadline in one list',
    body: 'Snap a photo of the whiteboard, or share the message from your class GC. It becomes a deadline with a reminder attached. Everything due, across every subject, sorted by what’s closest.',
  },
  {
    icon: IconAnnouncement,
    title: 'Announcements that actually reach you',
    body: 'Class suspended, quiz moved, room changed. Your beadle posts it once and it reaches everyone in the section, tagged to the right subject, with an option to turn it into a deadline in one tap.',
  },
  {
    icon: IconCommute,
    title: 'How to get to TUP, with real fares',
    body: 'Routes from your area with the student discount already applied, actual travel times, and a warning when it’s rush hour. The routes come from students who ride them every day, not from a map that doesn’t know jeepneys exist.',
  },
]

export function WhatItDoesSection() {
  return (
    <Section>
      <Reveal>
        <Heading className="max-w-[16ch]">Six things you check every day</Heading>
        <Lead className="mt-[var(--space-4)]">
          Import your schedule once. Everything else builds on it.
        </Lead>
      </Reveal>

      <ul className="mt-[var(--space-10)] grid list-none gap-x-[var(--space-10)] gap-y-[var(--space-8)] sm:grid-cols-2">
        {FEATURES.map((feature, index) => {
          const Glyph = feature.icon
          return (
            <li key={feature.title}>
              <Reveal delay={Math.min(index, 2) * 0.05}>
                <Glyph size={24} aria-hidden />
                <h3 className="type-title-3 mt-[var(--space-3)]">{feature.title}</h3>
                <p className="type-callout mt-[var(--space-2)] max-w-[46ch]">{feature.body}</p>
              </Reveal>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/* --- Section 4 — The commute --------------------------------------------- */

export function CommuteSection() {
  return (
    <Section tone="raised">
      <div className="grid gap-[var(--space-10)] lg:grid-cols-2 lg:items-center lg:gap-[var(--space-16)]">
        <Reveal>
          <Heading className="max-w-[18ch]">Ask how to get to TUP. See it on a map.</Heading>
          <Lead className="mt-[var(--space-5)]">
            Google Maps doesn&rsquo;t know jeepney routes, doesn&rsquo;t know fares, and has never
            heard of the 20% student discount. OneTUP does, because the routes come from students.
          </Lead>
        </Reveal>

        <Reveal delay={0.05}>
          <CommuteDemo />
        </Reveal>
      </div>
    </Section>
  )
}

/* --- Section 5 — Wake-up and leave-by ------------------------------------ */

export function DepartureSection() {
  return (
    <Section>
      <div className="grid gap-[var(--space-10)] lg:grid-cols-2 lg:items-center lg:gap-[var(--space-16)]">
        <Reveal>
          <Heading className="max-w-[16ch]">The alarm that knows about traffic</Heading>
          <div className="mt-[var(--space-5)] flex flex-col gap-[var(--space-4)]">
            <Lead>
              Set your first class and where you live. OneTUP handles the rest: it counts backwards
              through the commute, adds time for rush hour on your actual route, adds more if rain
              is forecast, leaves room for you to get ready, and sets the alarm.
            </Lead>
            <Lead>
              When something changes — a class moved, a route got slower — the alarm moves with it,
              and tells you why.
            </Lead>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <DepartureDemo />
        </Reveal>
      </div>
    </Section>
  )
}

/* --- Section 6 — Campus map ---------------------------------------------- */

export function CampusSection() {
  return (
    <Section tone="raised">
      <Reveal>
        <Eyebrow>Open to everyone</Eyebrow>
        <Heading className="mt-[var(--space-4)] max-w-[16ch]">
          The campus map needs no account
        </Heading>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-[var(--space-6)] flex flex-col gap-[var(--space-4)]">
          <Lead>
            Room numbers and which building they&rsquo;re in. Gates and which one is nearest the LRT
            walk. Printing spots with what they actually charge. Canteens, tambayan, the clinic, the
            registrar.
          </Lead>
          <Lead>
            The things Google Maps doesn&rsquo;t have, kept current by students. Free for anyone —
            incoming freshmen, transferees, visitors, parents on enrollment day.
          </Lead>
        </div>

        <div className="mt-[var(--space-8)] flex flex-col items-start gap-[var(--space-4)] sm:flex-row sm:items-center">
          <ButtonLink href="/campus" size="lg" className="w-full sm:w-auto">
            Open the campus map
          </ButtonLink>
          <p className="type-subheadline">No sign-up. Works on any phone.</p>
        </div>
      </Reveal>
    </Section>
  )
}

/* --- Section 7 — Study ---------------------------------------------------- */

export function StudySection() {
  return (
    <Section>
      <Reveal>
        <Heading className="max-w-[18ch]">
          Turn your own notes into something you can review
        </Heading>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-[var(--space-6)] flex flex-col gap-[var(--space-4)]">
          <Lead>
            Upload a module, a set of slides, or your own notes. OneTUP builds flashcards and
            practice questions from it, tied back to the exact page they came from so you can always
            check.
          </Lead>
          <Lead>
            Then study however works for you: Pomodoro, blurting, spaced repetition, explaining it
            out loud, or a timed mock exam.
          </Lead>
        </div>

        {/* The note wears the marker it describes, because that is exactly what
            a student meets inside the product. */}
        <div
          className="mt-[var(--space-8)] flex max-w-[52ch] items-start gap-[var(--space-3)] rounded-[var(--radius-md)] p-[var(--space-4)]"
          style={{ background: 'var(--generated-subtle)' }}
        >
          <span className="mt-[2px] shrink-0">
            <Badge tone="generated">Generated</Badge>
          </span>
          <p className="type-subheadline">
            Everything generated is marked as generated, and shown next to the source it came from.
            Check it before you trust it.
          </p>
        </div>
      </Reveal>
    </Section>
  )
}

/* --- Section 8 — How it works --------------------------------------------- */

const STEPS = [
  {
    title: 'Bring in your schedule',
    body: 'Connect your ERS once and your schedule imports itself. Your password is used to read the page and then discarded — OneTUP never saves it. If you’d rather not, paste your schedule instead. It works the same.',
  },
  {
    title: 'Tell it where you live',
    body: 'Pick your area and your usual route so OneTUP can work out your leave-by and wake-up times.',
  },
  {
    title: 'Add it to your home screen',
    body: 'That’s what turns on reminders and lets your schedule load without signal.',
  },
]

export function HowItWorksSection() {
  return (
    <Section tone="raised">
      <Reveal>
        <Heading className="max-w-[16ch]">Three steps, about two minutes</Heading>
      </Reveal>

      <ol className="mt-[var(--space-10)] flex list-none flex-col gap-[var(--space-8)]">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Reveal delay={index * 0.05}>
              <div className="flex gap-[var(--space-4)]">
                <span
                  aria-hidden
                  className="type-data flex size-8 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-semibold"
                  style={{ background: 'var(--fill-tertiary)' }}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="type-title-3">{step.title}</h3>
                  <p className="type-callout mt-[var(--space-2)] max-w-[52ch]">{step.body}</p>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* --- Section 9 — Trust ---------------------------------------------------- */

const COMMITMENTS = [
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

export function TrustSection() {
  return (
    <Section>
      <Reveal>
        <Eyebrow>Your data</Eyebrow>
        <Heading className="mt-[var(--space-4)] max-w-[18ch]">
          What OneTUP does and doesn&rsquo;t do
        </Heading>
      </Reveal>

      <ul className="mt-[var(--space-10)] grid list-none gap-x-[var(--space-10)] gap-y-[var(--space-8)] sm:grid-cols-2">
        {COMMITMENTS.map((point, index) => (
          <li key={point.title}>
            <Reveal delay={Math.min(index, 2) * 0.05}>
              <h3 className="type-headline">{point.title}</h3>
              <p className="type-callout mt-[var(--space-2)] max-w-[46ch]">{point.body}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* --- Section 10 — Open ---------------------------------------------------- */

export function OpenSection() {
  return (
    <Section tone="raised">
      <Reveal>
        <Heading className="max-w-[14ch]">Built in the open</Heading>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-[var(--space-6)] flex flex-col gap-[var(--space-4)]">
          <Lead>
            OneTUP is a student project. The client is open source, and the campus and curriculum
            data behind it is published as a free API that anyone can build on — thesis projects,
            org tools, hackathon entries.
          </Lead>
          <Lead>
            If you want to help, or you found something wrong, the repository is the place.
          </Lead>
        </div>

        <ul className="type-subheadline mt-[var(--space-4)] flex list-none flex-wrap items-center gap-x-[var(--space-3)]">
          <li className="flex min-h-[var(--target-min)] items-center">
            <RepoLink>View the source</RepoLink>
          </li>
          <Separator />
          <li className="flex min-h-[var(--target-min)] items-center">
            <RepoLink>Report something wrong</RepoLink>
          </li>
          <Separator />
          <li className="flex min-h-[var(--target-min)] items-center">
            <RepoLink>Contribute a route</RepoLink>
          </li>
        </ul>
      </Reveal>
    </Section>
  )
}

/* --- Section 11 — Closing -------------------------------------------------- */

export function ClosingSection() {
  return (
    <Section>
      <Reveal>
        <Heading className="max-w-[14ch]">Ready to stop guessing?</Heading>
        <Lead className="mt-[var(--space-5)]">
          Import your schedule once and OneTUP handles the rest — the alarms, the cuts, the
          deadlines, the commute.
        </Lead>

        <div className="mt-[var(--space-8)] flex flex-col gap-[var(--space-3)] sm:flex-row sm:items-center">
          <ButtonLink href="/today" variant="accent" size="lg" className="w-full sm:w-auto">
            Open OneTUP
          </ButtonLink>
          <ButtonLink href="/campus" size="lg" className="w-full sm:w-auto">
            See the campus map
          </ButtonLink>
        </div>
      </Reveal>
    </Section>
  )
}
