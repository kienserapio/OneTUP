'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import {
  IconAsk,
  IconDeadlines,
  IconSchedule,
  IconSubjects,
  IconToday,
} from '@/components/ui/icon'

/**
 * The floating tab bar.
 *
 * It floats rather than filling the bottom strip, so content scrolls visibly
 * underneath it and the glass has something to refract. The assistant sits in
 * the middle, raised and in the one saturated colour the product owns — it is
 * the only place a student converses rather than taps, and it deserves to look
 * different from the four destinations around it.
 *
 * Every label is a name for what is inside it. "Subjects" holds the per-course
 * standing; "Today" answers the question the app exists to answer. Neither is
 * a vague umbrella, which is what makes them predictable.
 */

interface Tab {
  href: string
  label: string
  Icon: typeof IconToday
  /** Matches nested routes so /schedule/import keeps Schedule selected. */
  match: (pathname: string) => boolean
}

const TABS: Tab[] = [
  {
    href: '/today',
    label: 'Today',
    Icon: IconToday,
    match: (p) => p === '/today' || p === '/',
  },
  {
    href: '/schedule',
    label: 'Schedule',
    Icon: IconSchedule,
    match: (p) => p.startsWith('/schedule'),
  },
  {
    href: '/deadlines',
    label: 'Deadlines',
    Icon: IconDeadlines,
    match: (p) => p.startsWith('/deadlines'),
  },
  {
    href: '/subjects',
    label: 'Subjects',
    Icon: IconSubjects,
    match: (p) => p.startsWith('/subjects') || p.startsWith('/grades') || p.startsWith('/attendance'),
  },
]

export function TabBar() {
  const pathname = usePathname()
  const askActive = pathname.startsWith('/ask')

  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + var(--tab-bar-inset))' }}
    >
      <div
        className={cx(
          'tab-bar material material-large pointer-events-auto',
          'relative flex items-stretch',
          'mx-[var(--tab-bar-inset)] w-full max-w-[26rem]',
        )}
        style={{
          height: 'var(--tab-bar-height)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-float)',
        }}
      >
        {TABS.slice(0, 2).map((tab) => (
          <TabItem key={tab.href} tab={tab} active={tab.match(pathname)} />
        ))}

        {/* The centre well. The button overhangs the bar, so the slot beneath it
            is empty rather than crowded. */}
        <div className="flex w-[4.5rem] shrink-0 items-start justify-center">
          <AskButton active={askActive} />
        </div>

        {TABS.slice(2).map((tab) => (
          <TabItem key={tab.href} tab={tab} active={tab.match(pathname)} />
        ))}
      </div>
    </nav>
  )
}

function TabItem({ tab, active }: { tab: Tab; active: boolean }) {
  const { Icon } = tab
  return (
    <Link
      href={tab.href as never}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative flex flex-1 flex-col items-center justify-center gap-[3px]',
        'min-h-[var(--target-min)] rounded-[var(--radius-lg)]',
        'transition-colors duration-150',
        active ? 'text-[var(--accent)]' : 'text-[var(--label-secondary)]',
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <motion.span
        initial={false}
        animate={{ scale: active ? 1.04 : 1 }}
        transition={transition(spring.snap)}
        className="flex flex-col items-center gap-[3px]"
      >
        <Icon size={25} strokeWidth={active ? 2 : 1.75} />
        <span className="type-caption-2 font-semibold tracking-[0.005em]">{tab.label}</span>
      </motion.span>
    </Link>
  )
}

/**
 * The assistant. Raised above the bar on its own shadow, and the only control
 * in the product that gets the accent as a fill.
 */
function AskButton({ active }: { active: boolean }) {
  return (
    <Link
      href={'/ask' as never}
      aria-label="Ask OneTUP"
      aria-current={active ? 'page' : undefined}
      className="group relative -top-5 flex flex-col items-center gap-[3px]"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <motion.span
        initial={false}
        animate={{ scale: active ? 1.06 : 1 }}
        whileTap={{ scale: 0.94 }}
        transition={transition(spring.snap)}
        className={cx(
          'squircle relative flex size-[3.25rem] items-center justify-center',
          'rounded-full text-[var(--on-accent)]',
        )}
        style={{
          background: 'var(--accent)',
          boxShadow:
            'inset 0 1px 0 0 rgb(255 255 255 / 0.28), 0 2px 6px rgb(0 0 0 / 0.16), 0 10px 26px -8px color-mix(in srgb, var(--accent) 70%, transparent)',
        }}
      >
        {/* Specular sheen — the same treatment as .glass, kept in sync by hand
            because this control is filled rather than translucent. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(to bottom, rgb(255 255 255 / 0.3) 0%, rgb(255 255 255 / 0.06) 46%, transparent 66%)',
          }}
        />
        <IconAsk size={26} strokeWidth={1.9} />
      </motion.span>
      <span
        className={cx(
          'type-caption-2 font-semibold tracking-[0.005em]',
          active ? 'text-[var(--accent)]' : 'text-[var(--label-secondary)]',
        )}
      >
        Ask
      </span>
    </Link>
  )
}
