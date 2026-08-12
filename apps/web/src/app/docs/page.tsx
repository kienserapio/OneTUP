import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/button'
import { IconMap } from '@/components/ui/icon'
import { SiteNav } from '@/components/landing/site-nav'
import { SiteFooter } from '@/components/landing/site-footer'
import { Reveal } from '@/components/landing/reveal'
import { DocsToc } from '@/components/docs/docs-toc'

/**
 * `/docs` — how to actually use the thing.
 *
 * Written as instructions, not as a feature tour: every section is something a
 * student is trying to do, in the order they will need to do it, with the taps
 * named. The landing page argues; this page answers.
 *
 * Public and unauthenticated, because the most common time to read it is before
 * making an account — the second most common is standing in a corridor
 * wondering why the import did not take.
 */

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'How to use OneTUP: importing your schedule, counting cuts, tracking your GWA, deadlines, announcements, commute plans, the campus map, offline use, notifications, and your data.',
}

const SECTIONS = [
  { id: 'start', title: 'Getting started' },
  { id: 'import', title: 'Import your schedule' },
  { id: 'today', title: 'Today' },
  { id: 'schedule', title: 'Your week' },
  { id: 'attendance', title: 'Attendance and cuts' },
  { id: 'grades', title: 'Grades and GWA' },
  { id: 'deadlines', title: 'Deadlines' },
  { id: 'announcements', title: 'Announcements' },
  { id: 'commute', title: 'Commute' },
  { id: 'ask', title: 'Ask' },
  { id: 'evaluations', title: 'Faculty evaluations' },
  { id: 'campus', title: 'Campus map' },
  { id: 'offline', title: 'Offline' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'install', title: 'Install it as an app' },
  { id: 'data', title: 'Your data' },
  { id: 'trouble', title: 'When something is wrong' },
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Reveal amount={0.05}>
      <section id={id} className="scroll-mt-28">
        <h2 className="type-title-1">{title}</h2>
        <div className="mt-[var(--space-4)] flex flex-col gap-[var(--space-4)]">{children}</div>
      </section>
    </Reveal>
  )
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="type-body" style={{ color: 'var(--label-secondary)' }}>
      {children}
    </p>
  )
}

/** Numbered because the order matters. Where it does not, use `Bullets`. */
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex list-none flex-col gap-[var(--space-3)]">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-[var(--space-3)]">
          <span
            className="type-caption-1 mt-[2px] grid h-6 w-6 shrink-0 place-items-center rounded-full font-semibold"
            style={{ background: 'var(--accent-subtle)', color: 'var(--crimson-700)' }}
          >
            {index + 1}
          </span>
          <span className="type-callout" style={{ color: 'var(--label)' }}>
            {item}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-none flex-col gap-[var(--space-2)]">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-[var(--space-3)]">
          <span
            aria-hidden
            className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: 'var(--accent)' }}
          />
          <span className="type-callout" style={{ color: 'var(--label)' }}>
            {item}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div
      className="squircle rounded-[var(--radius-md)] p-[var(--space-4)]"
      style={{ background: 'var(--surface-sunken)' }}
    >
      <p className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
        {children}
      </p>
    </div>
  )
}

/** A screen name as it appears in the app, so an instruction can point at
 * something the student can actually see. */
function Where({ children }: { children: ReactNode }) {
  return (
    <span
      className="type-footnote rounded-[var(--radius-xs)] px-1.5 py-0.5 font-semibold"
      style={{ background: 'var(--fill-quaternary)', color: 'var(--label)' }}
    >
      {children}
    </span>
  )
}

export default function DocsPage() {
  return (
    <>
      <SiteNav />

      <main id="main" style={{ background: 'var(--bg)' }}>
        <div
          className="mx-auto w-full px-[var(--space-5)] pb-[var(--space-16)] pt-[7rem] md:px-[var(--space-8)]"
          style={{ maxWidth: '68rem' }}
        >
          <Reveal>
            <p
              className="type-caption-2 font-semibold uppercase tracking-widest"
              style={{ color: 'var(--label)' }}
            >
              Docs
            </p>
            <h1 className="mt-3 max-w-[20ch] text-4xl leading-[1.1] tracking-tight sm:text-5xl">
              How to use OneTUP
            </h1>
            <p
              className="type-body mt-5 max-w-[58ch]"
              style={{ color: 'var(--label-secondary)' }}
            >
              Every screen, in the order you will need it. If you only read one section, read{' '}
              <a href="#import" style={{ color: 'var(--accent)' }}>
                Import your schedule
              </a>{' '}
              — everything else in the app is built on top of it.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/today" variant="accent" size="lg" block className="sm:!w-auto">
                Open OneTUP
              </ButtonLink>
              <ButtonLink
                href="/campus"
                size="lg"
                block
                className="sm:!w-auto"
                leading={<IconMap size={19} className="shrink-0" />}
              >
                View Campus Map
              </ButtonLink>
            </div>
          </Reveal>

          <div className="mt-[var(--space-12)] lg:grid lg:grid-cols-[220px_1fr] lg:gap-[var(--space-12)]">
            <div className="lg:pt-[var(--space-2)]">
              <DocsToc sections={SECTIONS} />
            </div>

            <div className="mt-[var(--space-10)] flex flex-col gap-[var(--space-12)] lg:mt-0">
              <Section id="start" title="Getting started">
                <P>
                  OneTUP is free and works in any browser. You need an account for anything tied to
                  you — your schedule, your cuts, your grades — and no account at all for the campus
                  map.
                </P>
                <Steps
                  items={[
                    <>
                      Open OneTUP and choose <Where>Create account</Where>. Use an email you
                      actually check; the confirmation link goes there.
                    </>,
                    <>
                      Confirm your email. Importing from ERS is gated on a confirmed address,
                      because that import is what connects the app to a real student record.
                    </>,
                    <>
                      Fill in your student number and program when asked. These are used to match
                      your curriculum, not to identify you to anyone else.
                    </>,
                    <>
                      Import your schedule. This is the one step everything else depends on — see
                      the next section.
                    </>,
                  ]}
                />
                <Note>
                  Already have an account and just want to look around the campus? Go straight to{' '}
                  <Where>View Campus Map</Where> in the navigation — it never asks you to sign in.
                </Note>
              </Section>

              <Section id="import" title="Import your schedule">
                <P>
                  There are two ways in, and both end at the same review screen. Nothing is saved
                  until you have looked at every row.
                </P>
                <Steps
                  items={[
                    <>
                      Go to <Where>Schedule</Where> → <Where>Import</Where>.
                    </>,
                    <>
                      Choose <Where>Connect ERS</Where> to have OneTUP read your registration
                      directly, or <Where>Paste</Where> to copy your schedule text out of ERS and
                      drop it in. Pasting always works, even when ERS is down for everyone else.
                    </>,
                    <>
                      Review what came back. Every subject, section, room, day and time is editable
                      on this screen — fix anything ERS got wrong before you commit it.
                    </>,
                    <>
                      Confirm. Your week fills in, and Today, cuts, deadlines and departure times
                      all start working from it.
                    </>,
                  ]}
                />
                <Bullets
                  items={[
                    <>
                      <strong>Your ERS password is never stored.</strong> It is used once to read
                      the schedule and then discarded.
                    </>,
                    <>
                      <strong>Re-importing is safe.</strong> It replaces the imported blocks for the
                      subjects in the import and leaves anything you added by hand alone — so run it
                      again after ERS fixes a typo.
                    </>,
                    <>
                      <strong>Changed sections mid-term?</strong> Use{' '}
                      <Where>Schedule → Resync</Where>.
                    </>,
                  ]}
                />
              </Section>

              <Section id="today" title="Today">
                <P>
                  The screen the app exists for. It answers one question — what is next, and when do
                  I have to move — and it answers it without a connection.
                </P>
                <Bullets
                  items={[
                    <>Your next class, its room, and how long until it starts.</>,
                    <>
                      When to wake up and when to walk out the door, worked backwards from your
                      first class using your commute, the time of day and the weather.
                    </>,
                    <>Anything due today or tomorrow, and any announcement for your section.</>,
                    <>The one-tap attendance prompt after a class has finished.</>,
                  ]}
                />
                <Note>
                  The departure time is only as good as the commute you set. Set yours in{' '}
                  <Where>Settings → Getting to campus</Where>.
                </Note>
              </Section>

              <Section id="schedule" title="Your week">
                <P>
                  <Where>Schedule</Where> is the whole week; tapping a day opens that day on its
                  own. Both render from the copy stored on your phone, so a stairwell with no signal
                  is not a problem.
                </P>
                <Bullets
                  items={[
                    <>Tap any class block to see the room, the section and the subject behind it.</>,
                    <>
                      Add a block by hand for anything ERS does not know about — a review session, a
                      consultation, an org meeting.
                    </>,
                    <>Blocks you added by hand survive a re-import. Imported ones are replaced.</>,
                  ]}
                />
              </Section>

              <Section id="attendance" title="Attendance and cuts">
                <P>
                  OneTUP counts your absences per subject and tells you how many you have left
                  before the limit starts costing you a grade.
                </P>
                <Steps
                  items={[
                    <>
                      After a class ends, <Where>Today</Where> asks whether you were there. Tap{' '}
                      <Where>Yes</Where> or <Where>No</Where>. That is the whole ritual.
                    </>,
                    <>
                      Open <Where>Subjects</Where> to see the running count for each subject and how
                      close it is to the limit.
                    </>,
                    <>
                      Miss the prompt? Log it later from the subject — attendance can be edited for
                      any past date.
                    </>,
                  ]}
                />
                <Note>
                  The limit follows the standard rule for the number of meetings a subject has per
                  week. You can change the threshold you want to be warned at in{' '}
                  <Where>Settings → Attendance</Where>.
                </Note>
              </Section>

              <Section id="grades" title="Grades and GWA">
                <P>
                  Enter what you have been given and OneTUP does the weighted arithmetic — including
                  the part nobody enjoys, which is working out what you would need from here.
                </P>
                <Bullets
                  items={[
                    <>Add a grade to a subject as soon as it is released.</>,
                    <>Your GWA for the term, and across terms, updates as you go.</>,
                    <>
                      Set a target GWA and each remaining subject shows the grade it would take to
                      reach it.
                    </>,
                    <>
                      Get warned when a scholarship or Dean&rsquo;s List threshold starts slipping
                      out of reach, while there is still something you can do about it.
                    </>,
                  ]}
                />
                <Note>
                  Grades are visible to you and nobody else. There is no section ranking, no
                  aggregate report, and nothing for faculty or admin to look at.
                </Note>
              </Section>

              <Section id="deadlines" title="Deadlines">
                <P>
                  Everything due, across every subject, in one list sorted by what is closest. There
                  are three ways to get something into it.
                </P>
                <Steps
                  items={[
                    <>
                      Type it: <Where>Deadlines</Where> → <Where>New</Where>. Title, subject, due
                      date, and a reminder if you want one.
                    </>,
                    <>
                      Photograph it: snap the whiteboard or the projected slide and OneTUP reads the
                      date and the task out of it. You confirm before it is saved.
                    </>,
                    <>
                      Share it: use your phone&rsquo;s share sheet from the class GC and pick
                      OneTUP. The message arrives as a draft deadline for you to check.
                    </>,
                  ]}
                />
                <Bullets
                  items={[
                    <>Tick a deadline off from the list or from Today.</>,
                    <>Anything read from a photo or a message is labelled as such until you edit it.</>,
                  ]}
                />
              </Section>

              <Section id="announcements" title="Announcements">
                <P>
                  Class suspended, quiz moved, room changed. Your class representative posts it once and everyone
                  in the section has it — no screenshot relay, no six group chats.
                </P>
                <Bullets
                  items={[
                    <>
                      Everyone sees announcements for their own section, tagged to the subject they
                      belong to.
                    </>,
                    <>
                      If you are the class representative, <Where>Announcements</Where> → <Where>New</Where> posts
                      to your section.
                    </>,
                    <>
                      Any announcement with a date in it can be turned into a deadline in one tap.
                    </>,
                  ]}
                />
              </Section>

              <Section id="commute" title="Commute">
                <P>
                  Routes to TUP from where you actually live, with the student discount already
                  applied and travel times that account for the hour of the day.
                </P>
                <Steps
                  items={[
                    <>
                      Set your area and your usual route in{' '}
                      <Where>Settings → Getting to campus</Where>.
                    </>,
                    <>
                      Open <Where>Commute</Where> for the legs, the fares and the total.
                    </>,
                    <>
                      Use <Where>Plan a departure</Where> to work backwards from a specific class or
                      a specific arrival time.
                    </>,
                  ]}
                />
                <Note>
                  Routes come from students who ride them. If one is wrong or a fare has changed,
                  say so — the correction goes to the same place the route came from.
                </Note>
              </Section>

              <Section id="ask" title="Ask">
                <P>
                  <Where>Ask</Where> answers questions about your own semester — your schedule, your
                  cuts, your grades, your deadlines, and getting to campus. English or Filipino,
                  whichever comes out.
                </P>
                <Bullets
                  items={[
                    <>
                      It reads your data to answer. It does not invent grades, prerequisites or
                      jeepney routes — those come from your records or from a real source, with the
                      source shown.
                    </>,
                    <>
                      Anything a model wrote carries a <strong>Generated</strong> label. Anything
                      computed from your data does not.
                    </>,
                    <>It needs a connection. Everything else in the app does not.</>,
                  ]}
                />
              </Section>

              <Section id="evaluations" title="Faculty evaluations">
                <P>
                  The end-of-term evaluation for each subject you are enrolled in, filled in from
                  the app instead of from a lab computer.
                </P>
                <Bullets
                  items={[
                    <>Open <Where>Evaluations</Where> to see which ones are still outstanding.</>,
                    <>Answers are submitted for the enrolment, not for you by name.</>,
                    <>A submitted evaluation cannot be edited, so read it back before you send it.</>,
                  ]}
                />
              </Section>

              <Section id="campus" title="Campus map">
                <P>
                  A 360° walk of TUP Manila with room lookup over the top of it. No account, no
                  sign-in wall — it is the one part of OneTUP built to be useful to someone who has
                  never used OneTUP.
                </P>
                <Bullets
                  items={[
                    <>
                      <Where>Find a room</Where> takes a room number and tells you which building
                      and floor it is on.
                    </>,
                    <>
                      <Where>Places</Where> lists buildings, gates, printing spots, canteens,
                      tambayan and offices, filtered by category.
                    </>,
                    <>
                      <Where>Emergency</Where> holds the numbers worth having when something is
                      wrong, and works whether or not the tour loads.
                    </>,
                    <>
                      <Where>Jump to</Where> moves the view to a specific place. Inside the tour
                      itself, use its own arrows and thumbnails to walk between scenes.
                    </>,
                    <>
                      Found something out of date? <Where>Fix a detail</Where> sends a correction.
                      That one needs an account.
                    </>,
                  ]}
                />
                <Note>
                  Rooms move between terms. The map is as current as the last student who checked
                  it — if it matters, confirm with the office.
                </Note>
              </Section>

              <Section id="offline" title="Offline">
                <P>
                  Campus wifi is not a dependency. Your schedule, your subjects, your cuts and your
                  deadlines are stored on your device and render from there.
                </P>
                <Bullets
                  items={[
                    <>
                      <strong>Works with no signal:</strong> Today, Schedule, Subjects, Deadlines,
                      the campus place list and the emergency numbers.
                    </>,
                    <>
                      <strong>Needs a connection:</strong> importing, Ask, posting an announcement,
                      submitting an evaluation, and the 360° tour itself.
                    </>,
                    <>
                      Anything you change offline — logging a cut, ticking a deadline — is queued
                      and sent the next time you have signal.
                    </>,
                  ]}
                />
              </Section>

              <Section id="notifications" title="Notifications">
                <P>
                  Off until you ask for them. Turn on only the ones you want in{' '}
                  <Where>Settings → Reminders</Where>.
                </P>
                <Bullets
                  items={[
                    <>Wake-up and leave-the-house alerts, timed from your commute.</>,
                    <>Deadline reminders, at the lead time you choose per deadline.</>,
                    <>A warning when a subject&rsquo;s absences get close to the limit.</>,
                    <>Announcements from your section.</>,
                  ]}
                />
                <Note>
                  On iPhone, notifications only work once OneTUP has been added to the Home Screen —
                  see the next section.
                </Note>
              </Section>

              <Section id="install" title="Install it as an app">
                <P>
                  OneTUP is a web app that installs. Installed, it opens full screen, launches
                  faster and is allowed to send notifications.
                </P>
                <Bullets
                  items={[
                    <>
                      <strong>iPhone or iPad:</strong> open OneTUP in Safari, tap the share button,
                      then <Where>Add to Home Screen</Where>.
                    </>,
                    <>
                      <strong>Android:</strong> Chrome offers <Where>Install app</Where> in its
                      menu, or prompts you after a couple of visits.
                    </>,
                    <>
                      <strong>Desktop:</strong> the install icon appears at the end of the address
                      bar.
                    </>,
                  ]}
                />
              </Section>

              <Section id="data" title="Your data">
                <P>
                  Everything in <Where>Settings → Your data</Where>, and nothing hidden behind an
                  email to someone.
                </P>
                <Bullets
                  items={[
                    <>
                      <strong>Export everything:</strong> one JSON file with every row held about
                      you.
                    </>,
                    <>
                      <strong>Delete your account:</strong> real deletion, not a flag on a row.
                    </>,
                    <>
                      <strong>Passwords:</strong> your ERS login is never stored, and your OneTUP
                      password is stored only as a hash you could not reverse.
                    </>,
                    <>
                      <strong>Grades and cuts:</strong> visible to you alone. Not to faculty, not to
                      admin, not to your section.
                    </>,
                  ]}
                />
                <Note>
                  The full detail is in the{' '}
                  <a href="/privacy" style={{ color: 'var(--accent)' }}>
                    privacy policy
                  </a>
                  , which is written to be read rather than to be survived.
                </Note>
              </Section>

              <Section id="trouble" title="When something is wrong">
                <Bullets
                  items={[
                    <>
                      <strong>The import came back empty or wrong.</strong> ERS changes its markup
                      without warning. Use <Where>Paste</Where> instead — it parses the same text
                      you can see on screen.
                    </>,
                    <>
                      <strong>A subject is missing.</strong> Re-run the import, or add the class
                      blocks by hand in <Where>Schedule</Where>.
                    </>,
                    <>
                      <strong>Cuts look wrong.</strong> Attendance is editable for any past date
                      from the subject.
                    </>,
                    <>
                      <strong>A departure time looks impossible.</strong> Check your route in{' '}
                      <Where>Settings → Getting to campus</Where>; the estimate is only as good as
                      the commute it is given.
                    </>,
                    <>
                      <strong>The campus tour will not load.</strong> It is a third-party 360°
                      viewer and needs a connection. Room lookup, the place list and the emergency
                      numbers still work without it.
                    </>,
                    <>
                      <strong>Something is plainly broken.</strong> OneTUP is a student project
                      built in the open — report it on the repository and it gets fixed by someone
                      who also has an 8&nbsp;AM tomorrow.
                    </>,
                  ]}
                />
              </Section>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
