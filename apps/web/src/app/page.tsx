import { LandingMotion } from '@/components/landing/reveal'
import { SiteHeader } from '@/components/landing/site-header'
import { SiteFooter } from '@/components/landing/site-footer'
import { Hero } from '@/components/landing/hero'
import {
  CampusSection,
  ClosingSection,
  CommuteSection,
  DepartureSection,
  HowItWorksSection,
  OpenSection,
  ProblemSection,
  StudySection,
  TrustSection,
  WhatItDoesSection,
} from '@/components/landing/sections'

/**
 * The landing page.
 *
 * The order is the argument: here is what you already do by hand, here is
 * everything it would keep track of, here are the two things it does that
 * nothing else does — shown as the screens themselves rather than described —
 * then the map anyone can use, what it costs you in trust, and where the code
 * lives.
 *
 * Every word on this page comes from the content spec. Nothing here is written
 * to fill a layout.
 */
export default function LandingPage() {
  return (
    <LandingMotion>
      <SiteHeader />

      <main id="main" style={{ background: 'var(--bg-grouped)' }}>
        <Hero />
        <ProblemSection />
        <WhatItDoesSection />
        <CommuteSection />
        <DepartureSection />
        <CampusSection />
        <StudySection />
        <HowItWorksSection />
        <TrustSection />
        <OpenSection />
        <ClosingSection />
      </main>

      <SiteFooter />
    </LandingMotion>
  )
}
