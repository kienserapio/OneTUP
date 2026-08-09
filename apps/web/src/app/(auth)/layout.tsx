import Link from 'next/link'

/**
 * The signed-out shell. No tab bar — there is nowhere to navigate to yet — but
 * the campus map is always one tap away, because it is the one thing a visitor
 * can use before they have an account at all.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="app-container flex items-center justify-between py-4 safe-top">
        <Link href="/" className="type-headline">
          OneTUP
        </Link>
        <Link href="/campus" className="type-subheadline text-[var(--accent)]">
          Campus
        </Link>
      </header>

      <main id="main" className="app-container flex flex-1 flex-col justify-center py-8">
        <div className="mx-auto w-full max-w-[26rem]">{children}</div>
      </main>

      <footer className="app-container pb-6 pt-4 safe-bottom">
        <p className="type-caption-1 text-center text-[var(--label-tertiary)]">
          A student project, not an official TUP service.
        </p>
      </footer>
    </div>
  )
}
