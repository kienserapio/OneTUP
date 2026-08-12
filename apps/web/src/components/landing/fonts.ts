import { Instrument_Sans, Instrument_Serif } from 'next/font/google'

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

/**
 * The upright cut, for the hero wordmark only.
 *
 * A separate export rather than a second style on the one above, because
 * `next/font` keys its subsetting off the call: asking for both cuts in one
 * place ships the italic to every page that only ever draws the roman.
 */
export const instrumentSerifDisplay = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'normal',
  display: 'swap',
})

/**
 * The label above the hero wordmark, and nothing else.
 *
 * Variable, so no `weight` is declared and the one file covers the whole range
 * — the label is set at 500 and the family is free to be used heavier later
 * without a second fetch.
 */
export const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
})
