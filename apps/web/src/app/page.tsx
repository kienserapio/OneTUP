import { Hero } from '@/components/landing/hero'
import { AboutSection } from '@/components/landing/about-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { CampusSection } from '@/components/landing/campus-section'
import { ClosingSection } from '@/components/landing/closing-section'
import { SiteFooter } from '@/components/landing/site-footer'

/**
 * The landing page.
 *
 * The order is the argument: here is the claim, here is the system you already
 * run by hand, here are the six things it would keep track of — shown as the
 * screens themselves rather than described — then the campus anyone can walk
 * without an account, what it costs you in trust, and the ask.
 *
 * Every word on this page comes from the content spec. Nothing here is written
 * to fill a layout.
 */
export default function LandingPage() {
  return (
    <>
      <main id="main" style={{ background: 'var(--bg)' }}>
        <Hero />
        <AboutSection />
        <FeaturesSection />
        <CampusSection />
        <ClosingSection />
      </main>

      <SiteFooter />
    </>
  )
}
