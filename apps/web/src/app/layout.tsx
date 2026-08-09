import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/inter'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: {
    default: 'OneTUP — one app for your TUP student life',
    template: '%s · OneTUP',
  },
  description:
    'Your schedule, your cuts, your GWA, your deadlines, and the exact time you need to leave the house to make that 7 AM class. Free, and it works offline.',
  applicationName: 'OneTUP',
  appleWebApp: {
    capable: true,
    title: 'OneTUP',
    // Translucent lets the page's own background show through behind the status
    // bar, which is what makes an installed PWA stop looking like a website.
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'OneTUP — one app for your TUP student life',
    description:
      'Import your schedule once and OneTUP handles the rest: the alarms, the cuts, the deadlines, the commute.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom stays available. Disabling it is a WCAG failure, and the students most
  // likely to need it are the ones least likely to complain about it.
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4f2' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="glass sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
