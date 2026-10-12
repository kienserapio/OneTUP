'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import { useScrollChrome } from '@/lib/hooks/use-scroll-chrome'
import { badgeFor, MORE_NAV, PHONE_NAV, type NavCounts, type NavItem } from './nav-items'
import { IconAsk, IconMore, IconSignOut } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { Sheet } from '@/components/ui/sheet'

/**
 * The floating bar, on phones only.
 *
 * A white pill floating on the grey canvas, lifted by its shadow rather than
 * an edge. Icons only — the labels live in each item's accessible name, and
 * the destinations are few and familiar enough that the glyph is the word. The
 * current one is painted in its feature's tone over a soft lozenge that slides
 * between items; the rest wait in grey. The assistant sits raised in the
 * middle as a lit crimson button — the same recipe as the primary action, and
 * the only place a student converses rather than taps.
 *
 * It slides away while the student reads down a page and comes back on the
 * first scroll up, so on a phone the content gets the whole screen when it is
 * the thing being looked at.
 *
 * The fifth slot is More, not a fifth destination. A phone bar holds four
 * comfortably and the app has fourteen places to be. Counts ride on the items
 * and the sheet's own badged destinations roll up onto More, so a new
 * announcement always leaves a mark on the bar.
 */
export function TabBar({ counts }: { counts: NavCounts }) {
  const pathname = usePathname()
  const [more, setMore] = useState(false)
  const { hidden } = useScrollChrome()

  // A destination chosen inside the sheet has to take the sheet with it.
  useEffect(() => setMore(false), [pathname])

  const [first, second, ask, fourth] = PHONE_NAV
  const inMore = MORE_NAV.some((group) => group.items.some((item) => item.match(pathname)))
  const moreBadge = MORE_NAV.flatMap((group) => group.items).reduce(
    (sum, item) => sum + badgeFor(item, counts),
    0,
  )

  return (
    <>
      <motion.nav
        aria-label="Main"
        className="mobile-only pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + var(--tab-bar-inset))',
        }}
        initial={false}
        animate={{ y: hidden && !more ? '140%' : '0%' }}
        transition={transition(spring.ui)}
      >
        <div
          className="tab-bar pointer-events-auto relative flex items-center px-2"
          style={{
            height: 'var(--tab-bar-height)',
            width: 'min(calc(100% - var(--tab-bar-inset) * 2), 24rem)',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--bg)',
            boxShadow:
              '0 1px 2px rgb(24 24 27 / 0.06), 0 12px 32px -10px rgb(24 24 27 / 0.22)',
          }}
        >
          <TabItem item={first} active={first.match(pathname)} badge={badgeFor(first, counts)} />
          <TabItem item={second} active={second.match(pathname)} badge={badgeFor(second, counts)} />

          {/* The centre well. The button overhangs the bar, so the slot beneath
              it is empty rather than crowded. */}
          <div className="flex w-[4.25rem] shrink-0 justify-center">
            <AskButton active={ask.match(pathname)} />
          </div>

          <TabItem item={fourth} active={fourth.match(pathname)} badge={badgeFor(fourth, counts)} />

          <MoreTab active={inMore} open={more} badge={moreBadge} onOpen={() => setMore(true)} />
        </div>
      </motion.nav>

      <Sheet open={more} onClose={() => setMore(false)} title="Everything" surface="solid">
        <div className="flex flex-col gap-[var(--space-6)] pb-[var(--space-2)]">
          {MORE_NAV.map((group) => (
            <div key={group.label}>
              <h3 className="type-footnote px-[var(--space-1)] font-semibold text-[var(--label-tertiary)]">
                {group.label}
              </h3>
              <ul className="mt-[var(--space-3)] grid grid-cols-3 gap-x-[var(--space-2)] gap-y-[var(--space-4)]">
                {group.items.map((item, index) => (
                  <motion.li
                    key={item.href}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...transition(spring.ui),
                      delay: 0.03 * index,
                    }}
                  >
                    <MoreLink
                      item={item}
                      active={item.match(pathname)}
                      badge={badgeFor(item, counts)}
                    />
                  </motion.li>
                ))}
              </ul>
            </div>
          ))}

          <a
            href="/auth/sign-out"
            className="type-subheadline flex min-h-[var(--target-min)] items-center justify-center gap-[var(--space-2)] rounded-full font-semibold"
            style={{
              background: 'var(--fill-tertiary)',
              color: 'var(--label-secondary)',
            }}
          >
            <IconSignOut size={18} />
            Sign out
          </a>
        </div>
      </Sheet>
    </>
  )
}

/** The soft lozenge behind the current item. Shared across items through
 * `layoutId`, so moving between tabs slides it rather than blinking it. */
function ActivePill() {
  return (
    <motion.span
      layoutId="tab-active"
      aria-hidden
      className="absolute inset-x-1.5 inset-y-2.5 rounded-full"
      style={{ background: 'var(--canvas)' }}
      transition={transition(spring.snap)}
    />
  )
}

function TabItem({ item, active, badge }: { item: NavItem; active: boolean; badge: number }) {
  const { Icon } = item
  return (
    <Link
      href={item.href as never}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className="relative flex h-full flex-1 items-center justify-center"
      style={{ WebkitTapHighlightColor: 'transparent', color: 'var(--label-tertiary)' }}
    >
      {active && <ActivePill />}
      <motion.span
        initial={false}
        animate={{ scale: active ? 1 : 0.94 }}
        whileTap={{ scale: 0.86 }}
        transition={transition(spring.snap)}
        className="relative flex"
      >
        <span className={cx('relative', active && 'glyph')} data-tone="crimson">
          <Icon size={26} />
          <Badge count={badge} />
        </span>
      </motion.span>
      <BadgeLabel count={badge} />
    </Link>
  )
}

/** Not a link. It is the only control in the bar that opens something rather
 * than going somewhere, so it is a button and says so to assistive tech. */
function MoreTab({
  active,
  open,
  badge,
  onOpen,
}: {
  active: boolean
  open: boolean
  badge: number
  onOpen: () => void
}) {
  const lit = active || open
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="More"
      aria-expanded={open}
      aria-haspopup="dialog"
      className="relative flex h-full flex-1 items-center justify-center"
      style={{
        WebkitTapHighlightColor: 'transparent',
        color: lit ? 'var(--label)' : 'var(--label-tertiary)',
      }}
    >
      {active && <ActivePill />}
      <motion.span
        initial={false}
        animate={{ scale: lit ? 1 : 0.94 }}
        whileTap={{ scale: 0.86 }}
        transition={transition(spring.snap)}
        className="relative flex"
      >
        <span className="relative">
          <IconMore size={26} />
          <Badge count={badge} />
        </span>
      </motion.span>
      <BadgeLabel count={badge} />
    </button>
  )
}

function MoreLink({ item, active, badge }: { item: NavItem; active: boolean; badge: number }) {
  return (
    <Link
      href={item.href as never}
      aria-current={active ? 'page' : undefined}
      className="group flex flex-col items-center gap-[var(--space-2)] text-center"
    >
      <span className="relative transition-transform duration-150 group-active:scale-90">
        <IconTile Icon={item.Icon} tone={item.tone} variant={active ? 'solid' : 'soft'} size={56} />
        {badge > 0 && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.6875rem] font-semibold tabular-nums"
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              boxShadow: '0 0 0 2px var(--bg)',
            }}
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span
        className={cx(
          'text-[0.8125rem] leading-tight',
          active ? 'font-bold text-[var(--label)]' : 'font-medium text-[var(--label-secondary)]',
        )}
      >
        {item.label}
      </span>
      <BadgeLabel count={badge} />
    </Link>
  )
}

/** The count, pinned to the icon's top-right corner. Capped so a busy week
 * does not grow the badge wider than the icon it sits on. */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <motion.span
      aria-hidden
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={transition(spring.flick)}
      className="absolute -right-2 -top-1 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold leading-none tabular-nums"
      style={{
        background: 'var(--accent)',
        color: 'var(--on-accent)',
        boxShadow: '0 0 0 2px var(--bg)',
      }}
    >
      {count > 9 ? '9+' : count}
    </motion.span>
  )
}

/** The same count, said rather than shown — the visual badge is hidden from
 * assistive tech because "Due 3" read aloud means nothing. */
function BadgeLabel({ count }: { count: number }) {
  if (count <= 0) return null
  return <span className="sr-only">, {count} new</span>
}

function AskButton({ active }: { active: boolean }) {
  return (
    <Link
      href={'/ask' as never}
      aria-label="Ask OneTUP"
      aria-current={active ? 'page' : undefined}
      className="relative -top-4"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <motion.span
        initial={false}
        animate={{ scale: active ? 1.06 : 1 }}
        whileTap={{ scale: 0.9 }}
        transition={transition(spring.flick)}
        className="glass glass-accent !size-[3.5rem] !min-h-0 !p-0"
        style={{
          boxShadow:
            'inset 0 1px 0 0 rgb(255 255 255 / 0.24), inset 0 -2px 0 0 rgb(0 0 0 / 0.1), 0 0 0 5px var(--bg), 0 10px 24px -6px color-mix(in srgb, var(--accent) 65%, transparent)',
        }}
      >
        <IconAsk size={26} />
      </motion.span>
    </Link>
  )
}
