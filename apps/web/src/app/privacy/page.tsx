import type { Metadata } from 'next'
import { Aside, LegalPage, LegalSection, P, Points } from '@/components/landing/legal'

/**
 * Privacy.
 *
 * Written as the six commitments in 07-AUTH-ERS §10 actually are: enforced by
 * the design rather than by policy. Where something carries a real risk — the
 * ERS password passing through a server — it is stated plainly instead of being
 * phrased away, because a promise a student cannot check is worth nothing and a
 * risk they were not told about is worse.
 */

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What OneTUP stores, what it never stores, and what happens to your ERS password. OneTUP is a student project, not an official TUP service.',
}

const COMMITMENTS = [
  {
    title: 'Your ERS password is never stored on our servers',
    body: 'There is no database column for it. Not encrypted, not hashed, not anywhere. It is used once to read your schedule page and then it is gone.',
  },
  {
    title: 'Your grades and your attendance are visible only to you',
    body: 'There is no administrative override, no faculty view, no section ranking, and no anonymised aggregate. It is built so that showing them to anyone else is not possible, rather than merely switched off.',
  },
  {
    title: 'Your academic numbers are never sent to an AI provider',
    body: 'Your grades, your GWA, your cut counts and your subject list stay on our side. Nothing OneTUP does with a model needs them.',
  },
  {
    title: 'You can export everything, any time',
    body: 'In a machine-readable format, on demand, without asking anyone.',
  },
  {
    title: 'Deleting your account really deletes it',
    body: 'It cascades to every row you own and completes within thirty days.',
  },
  {
    title: 'No advertising, no data sale, no analytics broker',
    body: 'There is nothing here that makes money from knowing about you. What usage measurement exists is self-hosted and aggregate.',
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      current="privacy"
      title="Privacy"
      standfirst="OneTUP is a student project, not an official TUP service. It holds your schedule, your grades and your attendance, which is about as personal as a student's data gets, so here is exactly what happens to it."
    >
      <LegalSection title="Six things that are true">
        <Points items={COMMITMENTS} />
      </LegalSection>

      <LegalSection title="About your ERS password">
        <P>
          To import your schedule, OneTUP signs in to ERS as you, once, and reads your schedule
          page. Your student number, ERS password and birthdate are sent over an encrypted
          connection, used to sign in, used to read the schedule, and then discarded. Your schedule
          is saved. Your password is not.
        </P>
        <P>
          Nothing in your ERS account is changed, submitted, or read beyond the schedule page.
        </P>
        <Aside>
          Being straight with you: your password does pass through our server while this happens,
          and exists in memory for a few seconds. We don&rsquo;t keep it, but it isn&rsquo;t zero
          risk. If you&rsquo;d rather not, paste your schedule instead — everything else works the
          same.
        </Aside>
      </LegalSection>

      <LegalSection title="What OneTUP holds">
        <P>
          The email address you sign up with. The schedule you import or paste. The attendance you
          tap in, the grades you enter, and the deadlines you add. The announcements you share with
          your section. The area you commute from and the routes you use. Anything you upload to
          build a reviewer from.
        </P>
        <P>
          Every table that holds anything of yours has row-level security turned on in the database
          itself, so the rule that only you can read your rows is enforced one layer below the
          application rather than by the application remembering to check.
        </P>
      </LegalSection>

      <LegalSection title="What other people can see">
        <P>
          Anything you post to your section — an announcement, a suspension, a moved quiz — is
          visible to everyone in that section. That is the point of it.
        </P>
        <P>
          A campus place, a printing price or a commute route you contribute becomes part of the
          public campus data that anyone can read, including people with no account. Your schedule,
          your grades, your attendance and your deadlines never do.
        </P>
      </LegalSection>

      <LegalSection title="The campus map, with no account">
        <P>
          The campus map works signed out. It reads public campus data and asks you for nothing.
          There is no sign-up wall in front of it and nothing about you is recorded for using it.
        </P>
        <P>
          The street tiles underneath it are loaded from OpenStreetMap, so your browser makes a
          request to their servers the same way it does to any site you visit. If that bothers you,
          the list of places below the map is served from here and works on its own.
        </P>
      </LegalSection>

      <LegalSection title="Where AI is involved">
        <P>
          A model drafts flashcards and practice questions from material you upload, and helps
          phrase points you have already written yourself. Everything it produces is marked as
          generated and shown next to the source it came from.
        </P>
        <P>
          It never invents your grades, your prerequisites, or a jeepney route. Those are computed
          from your own rows or read from real sources, with the source shown. Provider keys stay
          on the server and are never handed to a browser.
        </P>
      </LegalSection>

      <LegalSection title="Getting your data out, or ending it">
        <P>
          Export everything whenever you want. Delete your account whenever you want, and the
          deletion is real — it removes every row you own and finishes within thirty days rather
          than hiding your account behind a flag.
        </P>
      </LegalSection>

      <LegalSection title="If something here is wrong">
        <P>
          This page describes how the product is actually built, and it changes when the product
          does. If you find something on this page that does not match what the code does, that is a
          bug worth reporting — the repository is the place.
        </P>
      </LegalSection>
    </LegalPage>
  )
}
