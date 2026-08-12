'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { ButtonLink } from '@/components/ui/button'
import { IconMap } from '@/components/ui/icon'
import { ShapeGrid } from './shape-grid'
import { instrumentSans, instrumentSerifDisplay } from './fonts'

/**
 * The hero.
 *
 * One picture, one word. The wordmark is set into the frame first and the
 * campus building rises in front of it, so the two read as a single image
 * rather than as type sitting on a photograph — the letters are cut off at the
 * roofline on purpose, and the building runs past both edges at every size so
 * it never reads as a picture with borders.
 *
 * Layering is the composition, bottom to top: wordmark, building, white fade,
 * controls. The fade does two jobs — it lifts the base of the building off the
 * page so nothing ends on a hard edge, and it is the plate that carries the
 * buttons and the paragraph over the facade. It ends in flat white, which is
 * what hands the frame to the white section below.
 *
 * Everything hangs off one number, `--band`: the height of the building. The
 * building is that tall, and the wordmark is parked 0.18em above the bottom of
 * it — measured so the baseline lands just under the roofline and about a tenth
 * of the letter is swallowed, the same fraction on a phone as at 1440. Changing
 * the band moves both.
 */

/* The page's one curve, matching `reveal.tsx`. Motion animates on the
 * compositor and cannot read a custom property, so it is spelled out. */
const EASE = [0.16, 1, 0.3, 1] as const

/* The building leads and everything else follows it up. Seconds. */
const BEAT = {
  building: 0,
  welcome: 0.22,
  wordmark: 0.34,
  actions: 0.5,
  support: 0.6,
} as const

/* The asset trimmed to its own alpha bounds: no sky above the roof, no gap
 * below the wall, so the top edge of the file IS the roofline and the layout
 * can anchor to it. Both numbers are the file's real pixels. */
const BUILDING = { width: 1717, height: 541 }
const RATIO = BUILDING.width / BUILDING.height // 3.1738

/* The band, per breakpoint, as a share of the short viewport edge — with a
 * floor that keeps the building wider than the frame on a very wide screen,
 * where a height-driven width would leave white down both sides.
 * 59.6svh at 1440x1024 reproduces the design's roofline to the pixel. */
const BAND =
  '[--band:max(60svh,calc(112vw/3.1738))] ' +
  'sm:[--band:max(58svh,calc(112vw/3.1738))] ' +
  'lg:[--band:max(59.6svh,calc(112vw/3.1738))]'

/* White from a third of its own height, then out. Painted from the bottom edge
 * up, so the section always ends flat white. It reaches a little further than
 * the design's plate: the paragraph is 16px black on a photograph, and that is
 * the one thing here that cannot be allowed to sit on texture. */
const FADE = 'linear-gradient(to top, #ffffff 32%, rgb(255 255 255 / 0) 100%)'

/* The primary button's fill, flattened into one paint.
 *
 * A `.glass-accent` button is `--accent` with the `.glass::before` sheen laid
 * over it — white at 22%, 4% by 42%, gone by 62% — which is what gives the pill
 * its lit top edge. Text cannot carry a pseudo-element through `bg-clip-text`,
 * so the two layers are pre-composited here with `color-mix`. Same stops, same
 * direction, and it still tracks `--accent` rather than freezing a hex. */
/* Canvas takes paint values, not custom properties, so the tokens are read once
 * on the client. The literals are the same two values as tokens.css and exist
 * only so the first frame is never drawn in the wrong colour. */
const GRID_FALLBACK = { line: '#f4f1ef', hover: '#f9eef0' }

/* Dense at the top, thinning towards the fold, so the lattice is a backdrop
 * behind the wordmark rather than a band across it. */
const GRID_MASK =
  'radial-gradient(125% 105% at 50% 0%, #000 0%, #000 58%, rgb(0 0 0 / 0.35) 84%, transparent 100%)'

const ACCENT_GRADIENT =
  'linear-gradient(to bottom, ' +
  'color-mix(in srgb, #ffffff 22%, var(--accent)) 0%, ' +
  'color-mix(in srgb, #ffffff 4%, var(--accent)) 42%, ' +
  'var(--accent) 62%)'

export function Hero() {
  const reduced = useReducedMotion()
  const [grid, setGrid] = useState(GRID_FALLBACK)

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement)
    const line = styles.getPropertyValue('--grid-line').trim()
    const hover = styles.getPropertyValue('--grid-hover').trim()
    if (line && hover) setGrid({ line, hover })
  }, [])

  /* Every arrival on this screen is the same gesture; only the delay and the
   * travel change. The building moves further because it is bigger, and a
   * large object that travels the same 28px as a line of text reads as stuck. */
  const rise = (delay: number, distance = 28) => ({
    initial: { opacity: 0, y: reduced ? 0 : distance },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduced ? 0.24 : 0.85,
      delay: reduced ? 0 : delay,
      ease: EASE,
    },
  })

  return (
    /* `svh` rather than `vh`: the small viewport never changes as the browser
       chrome hides, so nothing can be cut off or shift mid-scroll. The negative
       margin is the 25px the next section's rounded top sits over. */
    <section
      className={`relative mb-[-25px] h-svh min-h-[32rem] overflow-hidden bg-white ${BAND}`}
      /* The one place on the site that is not set in SF Pro Rounded. */
      style={
        {
          '--font-text': 'var(--font-flat-text)',
          '--font-display': 'var(--font-flat-display)',
        } as React.CSSProperties
      }
    >
      {/* Layer 0 — the lattice drifting behind the type, masked out towards the
          fold so it never meets the building on a hard line. */}
      <div
        className="absolute inset-0 z-0"
        style={{ maskImage: GRID_MASK, WebkitMaskImage: GRID_MASK }}
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

      {/* Layer 1 — the wordmark, behind the building.
          `bottom` is measured from the base of the building rather than from
          the base of the section, which is what keeps the roofline crossing the
          letters at the same height on every screen. The `em` is the wordmark's
          own size, so the overlap scales with the type. */}
      <div
        className="absolute inset-x-0 bottom-[calc(var(--band)-0.18em)] z-[2] flex flex-col items-center px-5 text-center leading-none"
        /* The size lives here, not on the `h1`, because the `em` in `bottom`
           above is resolved against this element's own font-size. Set it on a
           child and the offset silently falls back to the inherited 16px.
           Capped against the short edge as well as the wide one, so a landscape
           phone gets a smaller wordmark instead of one that eats the frame; the
           ceiling is the design's 300px. */
        style={{ fontSize: 'clamp(3rem, min(29vw, 30svh), 18.75rem)' }}
      >
        <h1 className="flex flex-col items-center">
          <motion.span
            {...rise(BEAT.welcome)}
            className={`${instrumentSans.className} block font-medium uppercase leading-none tracking-[0.1em] text-[#6b7280]`}
            /* Sized in `em` of the wordmark rather than of the viewport, so the
               label keeps its proportion to the word it introduces instead of
               drifting away from it as the screen widens. */
            style={{ fontSize: 'clamp(0.8125rem, 0.09em, 1.75rem)' }}
          >
            Welcome to
          </motion.span>

          <motion.span
            {...rise(BEAT.wordmark)}
            /* The margin is nearly cancelled by the negative half-leading of
               `leading-[0.72]`: the label ends up sitting about 0.04em off the
               cap line, which is as close as it can get without touching. */
            className={`${instrumentSerifDisplay.className} mt-[0.13em] block uppercase leading-[0.72] tracking-[-0.01em] text-black`}
          >
            One
            {/* Clipped to the glyphs, so one crimson runs across the three
                letters rather than each one being a flat fill. */}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: ACCENT_GRADIENT }}
            >
              TUP
            </span>
          </motion.span>
        </h1>
      </div>

      {/* Layer 2 — the building, sitting on the bottom edge. Centring lives on
          the wrapper because Motion writes the whole `transform`, and an
          animated `y` on this element would drop the `-translate-x-1/2`. */}
      <div
        className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2"
        style={{ height: 'var(--band)', width: `calc(var(--band) * ${RATIO})` }}
      >
        <motion.div {...rise(BEAT.building, 44)} className="relative h-full w-full">
          <Image
            src="/hero/tupmanila.webp"
            alt="The main building of the Technological University of the Philippines, Manila"
            fill
            priority
            /* The rendered width is the band times the aspect, which is why
               these are larger than the viewport — the building is meant to
               overrun it. */
            sizes="(max-width: 640px) 320vw, (max-width: 1024px) 200vw, 135vw"
            className="select-none object-cover"
          />
        </motion.div>
      </div>

      {/* Layer 3 — the plate. Decorative, and it must never take the pointer
          from the controls sitting on it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[46%]"
        style={{ background: FADE }}
      />

      {/* Layer 4 — the controls and the promise, on the white. */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center px-5 pb-[clamp(1.5rem,5svh,3.25rem)] text-center">
        <motion.div
          {...rise(BEAT.actions)}
          className="flex w-full max-w-[22rem] flex-col items-center gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:gap-4"
        >
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
        </motion.div>

        <motion.p
          {...rise(BEAT.support)}
          className="mt-6 max-w-[39rem] text-[0.9375rem] leading-[1.5] text-black sm:text-base"
        >
          Your schedule, GWA, deadlines, commute, and the exact time you need to leave the house to
          make that 7&nbsp;AM class. OneTUP keeps it all in one place, even offline.
        </motion.p>
      </div>
    </section>
  )
}
