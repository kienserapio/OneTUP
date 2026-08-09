import { Instrument_Serif } from 'next/font/google'

/**
 * The one serif on the site.
 *
 * It exists for a single phrase in the hero headline, where an italic serif set
 * against SF Pro is the whole contrast device. Loaded through `next/font` rather
 * than an `@import` so it is self-hosted, preloaded and subset — a headline
 * webfont fetched from a third party at render time is the slowest possible way
 * to draw the first thing a visitor sees.
 *
 * Italic only, because that is the only cut used.
 */
export const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  display: 'swap',
})
