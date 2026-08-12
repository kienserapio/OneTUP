import { SiteNav } from '@/components/landing/site-nav'
import { Hero } from '@/components/landing/hero'
import { AboutSection } from '@/components/landing/about-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { ClosingSection } from '@/components/landing/closing-section'
import { SiteFooter } from '@/components/landing/site-footer'

/**
 * The landing page.
 *
 * The order is the argument: here is the claim, here is the system you already
 * run by hand, here are the six things it would keep track of — shown as the
 * screens themselves rather than described — then what it costs you in trust,
 * and the ask.
 *
 * The campus tour used to sit between the features and the trust points. It is
 * a full-screen, interactive, third-party 360° viewer, and a full-screen
 * interactive thing embedded mid-argument stops the argument: it now has its own
 * page, reachable from the navigation from anywhere on the site.
 *
 * Every word on this page comes from the content spec. Nothing here is written
 * to fill a layout.
 */
export default function LandingPage() {
  return (
    <>
      <SiteNav />

      <main id="main" style={{ background: 'var(--bg)' }}>
        <Hero />
        <AboutSection />
        <FeaturesSection />
        <ClosingSection />
      </main>

      <SiteFooter />
    </>
  )
}
