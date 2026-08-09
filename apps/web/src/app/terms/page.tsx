import type { Metadata } from 'next'
import { Aside, LegalPage, LegalSection, P } from '@/components/landing/legal'

/**
 * Terms.
 *
 * Not a contract written to protect anyone from anyone. It is the set of things
 * a student has to know before they lean on this: what it is, what it is not,
 * which number wins when two of them disagree, and what happens to what they
 * contribute.
 */

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'What OneTUP is, what it is not, and what to expect from it. A student project, not an official TUP service.',
}

export default function TermsPage() {
  return (
    <LegalPage
      current="terms"
      title="Terms of use"
      standfirst="Plain language, because the point of this page is that you actually read it."
    >
      <LegalSection title="This is a student project">
        <P>
          OneTUP is built by TUP students. It is not an official service of the Technological
          University of the Philippines, it is not run by the university, and it is not endorsed by
          any office in it. Nothing here is an announcement from the university.
        </P>
        <Aside>
          If OneTUP and an official university system ever disagree — your schedule, your grades,
          your enrolment, a suspension — the university is right and OneTUP is wrong. Your official
          record is whatever the university holds.
        </Aside>
      </LegalSection>

      <LegalSection title="What the numbers actually are">
        <P>
          Your cut count and your GWA are arithmetic done on what you entered. They are a way of
          keeping track of yourself, not a record of anything. A subject&rsquo;s real attendance
          standing and your real grades are whatever your faculty and the registrar say they are.
        </P>
        <P>
          Set your own thresholds carefully and check anything that matters against the official
          source before you act on it.
        </P>
      </LegalSection>

      <LegalSection title="Campus data and fares come from students">
        <P>
          Commute fares, campus places, printing prices and opening hours are contributed by
          students who were there. They go out of date. Every record carries when it was last
          checked, anything stale is marked as stale rather than presented as current, and where
          nobody has confirmed a price you will be told that instead of shown a number somebody
          guessed.
        </P>
        <P>
          Treat all of it as a good starting point and not as a guarantee. Fares change, printing
          shops close, and a gate that was open last semester may not be.
        </P>
      </LegalSection>

      <LegalSection title="Generated content">
        <P>
          Where a model wrote part of what you are looking at, it says so and shows the source it
          came from. Check it before you trust it, especially before an exam. It does not invent
          your grades, your prerequisites, or a route.
        </P>
      </LegalSection>

      <LegalSection title="Connecting your ERS account">
        <P>
          Importing your schedule signs in to ERS with credentials you supply, reads your schedule
          page, and changes nothing. You are responsible for your own account and for following
          your university&rsquo;s acceptable-use policy. If you would rather not connect it, paste
          your schedule instead — everything after that works the same.
        </P>
      </LegalSection>

      <LegalSection title="What you post and what you contribute">
        <P>
          Announcements you share reach everyone in your section, and places, routes and prices you
          contribute become public data other students rely on. Post what you know to be true, and
          correct it when it changes.
        </P>
        <P>
          Anything abusive, dishonest, or aimed at a person rather than at information will be
          removed.
        </P>
      </LegalSection>

      <LegalSection title="Faculty evaluation">
        <P>
          OneTUP makes the evaluation form faster to fill in. It does not answer it. Ratings are
          never generated, opinions are never pre-filled, and nothing is submitted without you
          reading the exact content first. The comment help only rewrites points you supplied
          yourself, and you edit and approve the result.
        </P>
      </LegalSection>

      <LegalSection title="Availability">
        <P>
          OneTUP is free and runs on free service tiers. There is no uptime promise. It is built to
          keep working offline from what it has already saved, which is the closest thing to a
          guarantee it can honestly offer.
        </P>
      </LegalSection>

      <LegalSection title="Leaving">
        <P>
          Export everything at any time, and delete your account at any time. Deletion removes every
          row you own and finishes within thirty days.
        </P>
      </LegalSection>

      <LegalSection title="Changes">
        <P>
          This page describes how the product is built today and changes when the product does. If
          something here does not match what OneTUP actually does, the repository is the place to
          say so.
        </P>
      </LegalSection>
    </LegalPage>
  )
}
