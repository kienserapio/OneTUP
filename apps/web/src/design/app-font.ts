import { Geist } from 'next/font/google'

/**
 * The app's fallback face.
 *
 * The app is set in SF Pro Rounded wherever the platform provides it — Apple
 * licenses SF for its own platforms, so it is referenced through `ui-rounded`
 * and `local()` and never shipped. Everywhere else (Windows, Android, Linux)
 * Geist takes over: self-hosted and subset by `next/font`, exposed as
 * `--font-geist` and picked up by the `.app-ui` font stack in app-theme.css.
 */
export const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist',
})
