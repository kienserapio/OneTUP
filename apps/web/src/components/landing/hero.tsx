'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ButtonLink } from '@/components/ui/button'
import { ShapeGrid } from './shape-grid'
import { LandingNav } from './landing-nav'
import { instrumentSerif } from './fonts'

/**
 * The hero.
 *
 * White, full height, with the lattice drifting behind it rather than a video or
 * a photograph — the page has to open fast on the mid-range phone it is built
 * for, and a hero video is the single heaviest thing a landing page can ship.
 *
 * The three supporting facts sit with the action, because they are the objections
 * a student raises in the first two seconds: what does it cost, does it work in a
 * building with no signal, how much work is it.
 */

/* Canvas takes paint values, not custom properties, so the tokens are read once
 * on the client. The literals are the same two values as tokens.css and exist
 * only so the first frame is never drawn in the wrong colour. */
const GRID_FALLBACK = { line: '#f4f1ef', hover: '#f9eef0' }

export function Hero() {
  const [grid, setGrid] = useState(GRID_FALLBACK)

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement)
    const line = styles.getPropertyValue('--grid-line').trim()
    const hover = styles.getPropertyValue('--grid-hover').trim()
    if (line && hover) setGrid({ line, hover })
  }, [])

  return (
    /* `svh` rather than `vh`: the small viewport never changes as the browser
       chrome hides, so the bottom-aligned content cannot be cut off or shift
       mid-scroll. The floor keeps it usable on a short landscape phone. */
    <section
      className="relative mb-[-25px] h-svh min-h-[36rem] overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="absolute inset-0"
        style={{
          // Densest at the top corners, gone behind the headline and gone again
          // at the bottom seam — so it never competes with what it sits behind.
          maskImage:
            'radial-gradient(120% 85% at 50% 0%, #000 0%, #000 35%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(120% 85% at 50% 0%, #000 0%, #000 35%, transparent 78%)',
        }}
      >
        <ShapeGrid
          speed={0.35}
          squareSize={44}
          direction="diagonal"
          borderColor={grid.line}
          hoverFillColor={grid.hover}
          shape="square"
          hoverTrailAmount={4}
        />
      </div>

      {/* The lattice has to end somewhere. Fading it into the next section is
          what stops the seam reading as a hard edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-72"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--bg) 70%, transparent) 45%, var(--bg) 85%)',
        }}
      />

      <LandingNav />

      {/* Transparent to the pointer so the grid still lights up under the
          cursor; only the controls take events back. */}
      <div className="pointer-events-none relative z-10 flex h-full flex-col items-center justify-end px-5 pb-12 text-center md:pb-16">
        {/* The full label colour, not the system's secondary grey: at 12px that
            grey measures about 3.5:1 on white and does not clear AA. */}
        <p
          className="type-caption-1 font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--label)' }}
        >
          Built by TUP students, for TUP students
        </p>

        <h1
          className="mt-5 max-w-[18ch] text-5xl font-normal leading-[1.1] tracking-tight sm:text-7xl md:text-8xl"
          style={{ color: 'var(--label)' }}
        >
          Everything about your classes,{' '}
          <span className="block">
            in <span className={instrumentSerif.className}>one app</span>.
          </span>
        </h1>

        <p
          className="type-body mt-6 max-w-[460px]"
          style={{ color: 'var(--label-secondary)' }}
        >
          Your schedule, your cuts, your GWA, your deadlines, and the exact time you need to leave
          the house to make that 7&nbsp;AM class. OneTUP keeps it in one place, and it works even
          when campus wifi doesn&rsquo;t.
        </p>

        <div
          className="pointer-events-auto mt-8 flex w-full max-w-[36rem] flex-col items-center gap-3 rounded-xl border p-3 sm:flex-row sm:justify-between sm:pl-6"
          style={{ borderColor: 'var(--separator)', background: 'var(--surface-sunken)' }}
        >
          <p className="type-footnote text-balance" style={{ color: 'var(--label-secondary)' }}>
            Free forever · Works offline · One tap to log attendance
          </p>
          <ButtonLink href="/today" variant="accent" className="w-full sm:w-auto">
            Open OneTUP
          </ButtonLink>
        </div>

        <Link
          href="/campus"
          className="type-subheadline pointer-events-auto mt-4 flex min-h-[var(--target-min)] items-center underline decoration-[var(--separator)] underline-offset-4"
          style={{ color: 'var(--label-secondary)' }}
        >
          Browse the campus map
        </Link>
      </div>
    </section>
  )
}
