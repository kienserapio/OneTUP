'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import { PHONE_NAV, type NavItem } from './nav-items'
import { IconAsk } from '@/components/ui/icon'

/**
 * The floating bar, on phones only.
 *
 * Above 900px the sidebar carries navigation and this is hidden — two
 * navigations on screen at once is one too many.
 *
 * It floats rather than filling the bottom strip, so content scrolls visibly
 * underneath it and the glass has something to refract. The assistant sits in
 * the middle, raised and in the one saturated colour the product owns: it is
 * the only place a student converses rather than taps.
 */
export function TabBar() {
  const pathname = usePathname()

  const [first, second, ask, ...rest] = PHONE_NAV

  return (
    <nav
      aria-label="Main"
      className="mobile-only pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
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
        <TabItem item={first} active={first.match(pathname)} />
        <TabItem item={second} active={second.match(pathname)} />

        {/* The centre well. The button overhangs the bar, so the slot beneath
            it is empty rather than crowded. */}
        <div className="flex w-[4.5rem] shrink-0 items-start justify-center">
          <AskButton active={ask.match(pathname)} />
        </div>

        {rest.map((item) => (
          <TabItem key={item.href} item={item} active={item.match(pathname)} />
        ))}
      </div>
    </nav>
  )
}

function TabItem({ item, active }: { item: NavItem; active: boolean }) {
  const { Icon } = item
  return (
    <Link
      href={item.href as never}
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
        <span className="type-caption-2 font-semibold tracking-[0.005em]">
          {item.short ?? item.label}
        </span>
      </motion.span>
    </Link>
  )
}

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
        className="squircle relative flex size-[3.25rem] items-center justify-center rounded-full text-[var(--on-accent)]"
        style={{
          background: 'var(--accent)',
          boxShadow:
            'inset 0 1px 0 0 rgb(255 255 255 / 0.28), 0 2px 6px rgb(0 0 0 / 0.16), 0 10px 26px -8px color-mix(in srgb, var(--accent) 70%, transparent)',
        }}
      >
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
