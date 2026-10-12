import Link from 'next/link'
import { IconCampus } from '@/components/ui/icon'
import { Mark } from '@/components/ui/mark'

/**
 * The signed-out shell. No tab bar — there is nowhere to navigate to yet — but
 * the campus map is always one tap away, because it is the one thing a visitor
 * can use before they have an account at all.
 *
 * Drawn with the one design system the rest of the app uses: a pale canvas with
 * a crimson bloom behind a single glass card, as the onboarding steps are.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-stage flex flex-col">
      <header className="app-container py-4 safe-top">
        <div className="mx-auto flex w-full max-w-[28rem] items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-[1.0625rem] font-bold tracking-[-0.02em]"
          >
            <Mark size={26} />
            OneTUP
          </Link>
          <Link href="/campus" className="auth-pill">
            <IconCampus size={16} />
            Campus
          </Link>
        </div>
      </header>

      <main id="main" className="app-container flex flex-1 flex-col justify-center py-6">
        <div className="mx-auto w-full max-w-[28rem]">{children}</div>
      </main>

      <footer className="app-container pb-6 pt-4 safe-bottom">
        <p className="text-center text-[0.75rem] font-medium text-[var(--label-tertiary)]">
          A student project, not an official TUP service.
        </p>
      </footer>
    </div>
  )
}
