'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import { MORE_NAV, PHONE_NAV, type NavItem } from './nav-items'
import { IconAsk, IconMore, IconSignOut } from '@/components/ui/icon'
import { Sheet } from '@/components/ui/sheet'

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
 *
 * The fifth slot is More, not a fifth destination. A phone bar holds four
 * comfortably and the app has twelve places to be; the six that used to live
 * only in the desktop sidebar were unreachable here, which is the kind of gap
 * that makes an app feel like a worse version of itself on the device it was
 * built for.
 */
export function TabBar() {
  const pathname = usePathname()
  const [more, setMore] = useState(false)

  // A destination chosen inside the sheet has to take the sheet with it.
  useEffect(() => setMore(false), [pathname])

  const [first, second, ask, fourth] = PHONE_NAV
  const inMore = MORE_NAV.some((group) => group.items.some((item) => item.match(pathname)))

  return (
    <>
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

          <TabItem item={fourth} active={fourth.match(pathname)} />

          <MoreTab active={inMore} open={more} onOpen={() => setMore(true)} />
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="Everything else" surface="solid">
        <div className="flex flex-col gap-[var(--space-5)] pb-[var(--space-2)]">
          {MORE_NAV.map((group) => (
            <div key={group.label}>
              <h3 className="type-section-header px-[var(--space-1)]">{group.label}</h3>
              <ul className="mt-[var(--space-2)] grid grid-cols-2 gap-[var(--space-2)]">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <MoreLink item={item} active={item.match(pathname)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <a
            href="/auth/sign-out"
            className="type-subheadline flex min-h-[var(--target-min)] items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-md)]"
            style={{ background: 'var(--fill-quaternary)', color: 'var(--label-secondary)' }}
          >
            <IconSignOut size={18} />
            Sign out
          </a>
        </div>
      </Sheet>
    </>
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
        <Icon size={25} />
        <span className="type-caption-2 font-semibold tracking-[0.005em]">
          {item.short ?? item.label}
        </span>
      </motion.span>
    </Link>
  )
}

/** Not a link. It is the only control in the bar that opens something rather
 * than going somewhere, so it is a button and says so to assistive tech. */
function MoreTab({
  active,
  open,
  onOpen,
}: {
  active: boolean
  open: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cx(
        'relative flex flex-1 flex-col items-center justify-center gap-[3px]',
        'min-h-[var(--target-min)] rounded-[var(--radius-lg)]',
        'transition-colors duration-150',
        active || open ? 'text-[var(--accent)]' : 'text-[var(--label-secondary)]',
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <motion.span
        initial={false}
        animate={{ scale: active || open ? 1.04 : 1 }}
        transition={transition(spring.snap)}
        className="flex flex-col items-center gap-[3px]"
      >
        <IconMore size={25} />
        <span className="type-caption-2 font-semibold tracking-[0.005em]">More</span>
      </motion.span>
    </button>
  )
}

function MoreLink({ item, active }: { item: NavItem; active: boolean }) {
  const { Icon } = item
  return (
    <Link
      href={item.href as never}
      aria-current={active ? 'page' : undefined}
      className="card squircle flex min-h-[4.25rem] flex-col justify-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-3)]"
      style={
        active
          ? { borderColor: 'var(--accent)', color: 'var(--crimson-800)' }
          : undefined
      }
    >
      <Icon size={22} style={{ color: active ? 'var(--accent)' : 'var(--label-secondary)' }} />
      <span className="type-subheadline font-semibold leading-tight">{item.label}</span>
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
        <IconAsk size={26} />
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
