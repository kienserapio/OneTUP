'use client'

import { useCallback, useEffect, useId, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import {
  loadNotifications,
  markSeen,
  readSeen,
  relativeTime,
  type NotificationItem,
  type NotificationKind,
} from '@/lib/queries/notifications'
import {
  IconAlarm,
  IconAnnouncement,
  IconAttendance,
  IconBellRinging,
  IconCelebrate,
  IconChart,
  IconCommute,
  IconDeadlines,
  IconWarning,
  type IconProps,
} from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'

/**
 * The bell, and what it opens.
 *
 * On a phone the feed drops down from the top as a sheet, under a dimmed
 * page, because an anchored 380px panel on a 390px screen is a sheet anyway
 * and should behave like one. From 640px up it is a panel hanging off the
 * bell. Both are the same element with two sets of classes.
 *
 * The panel is portalled into the `.app-ui` root rather than rendered inside
 * the top bar: the bar picks up a backdrop filter and a transform as it
 * scrolls, and either one would trap a fixed-position child inside it.
 */

const KIND_ICON: Record<NotificationKind, ComponentType<IconProps>> = {
  overdue: IconWarning,
  due: IconDeadlines,
  cuts: IconAttendance,
  advisory: IconAlarm,
  announcement: IconAnnouncement,
  departure: IconCommute,
  alert: IconChart,
}

export function NotificationsButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  // The moment the feed was built: what "2h ago" and "Today" are measured from.
  const [loadedAt, setLoadedAt] = useState(0)
  const [seen, setSeen] = useState<Set<string>>(() => new Set())
  const [root, setRoot] = useState<Element | null>(null)
  const [anchor, setAnchor] = useState<Record<string, number>>({})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const still = useReducedMotion()

  const refresh = useCallback(async () => {
    try {
      const at = new Date()
      const next = await loadNotifications(at)
      setItems(next)
      setLoadedAt(at.getTime())
      setSeen(readSeen())
    } catch {
      setItems((current) => current ?? [])
    }
  }, [])

  // First load, and again whenever the student comes back to the tab.
  // Deferred a tick so the feed never competes with the page's own first load.
  useEffect(() => {
    const first = window.setTimeout(refresh, 0)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearTimeout(first)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const close = useCallback((returnFocus = true) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  // A route change means a link in the feed was followed, or the student
  // went somewhere else; either way the feed is done.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, close])

  const unread = (items ?? []).filter((item) => !seen.has(item.key))

  const toggle = () => {
    if (!open) {
      setRoot(buttonRef.current?.closest('.app-ui') ?? document.body)
      setAnchor(anchorFor(buttonRef.current))
      void refresh()
    }
    setOpen((value) => !value)
  }

  const markAll = () => setSeen(markSeen((items ?? []).map((item) => item.key)))
  const markOne = (key: string) => setSeen(markSeen([key]))

  const now = loadedAt
  const todayKey = manilaDay(now)
  const groups = [
    {
      label: 'Today',
      items: (items ?? []).filter(
        (item) => Date.parse(item.at) >= now || manilaDay(Date.parse(item.at)) === todayKey,
      ),
    },
    {
      label: 'Earlier',
      items: (items ?? []).filter(
        (item) => Date.parse(item.at) < now && manilaDay(Date.parse(item.at)) !== todayKey,
      ),
    },
  ].filter((group) => group.items.length > 0)

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            aria-hidden
            className="fixed inset-0 z-[60] sm:hidden"
            style={{ background: 'rgb(24 24 27 / 0.28)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+10px)] z-[61] flex max-h-[min(78dvh,640px)] flex-col overflow-hidden rounded-[28px] outline-none sm:inset-x-auto sm:w-[380px] sm:rounded-[24px]"
            style={{
              background: 'var(--bg)',
              boxShadow: 'var(--shadow-pop)',
              ...anchor,
              transformOrigin: 'top right',
            }}
            initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -8 }}
            transition={transition(spring.sheet)}
          >
            <header className="flex items-center gap-3 px-5 pb-2 pt-4">
              <h2 id={titleId} className="flex-1 text-[1.25rem] font-bold tracking-[-0.02em]">
                Notifications
              </h2>
              {unread.length > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  className="rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold transition-transform active:scale-95"
                  style={{ background: 'var(--tone-crimson-tint)', color: 'var(--accent)' }}
                >
                  Mark all read
                </button>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
              {items === null ? (
                <FeedSkeleton />
              ) : groups.length === 0 ? (
                <EmptyFeed />
              ) : (
                groups.map((group) => (
                  <section key={group.label} aria-label={group.label}>
                    <h3 className="px-3 pb-1 pt-3 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-[var(--label-tertiary)]">
                      {group.label}
                    </h3>
                    <ul>
                      {group.items.map((item, index) => (
                        <motion.li
                          key={item.key}
                          initial={still ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ ...transition(spring.ui), delay: 0.03 * index }}
                        >
                          <FeedRow
                            item={item}
                            unread={!seen.has(item.key)}
                            now={now}
                            onOpen={() => markOne(item.key)}
                          />
                        </motion.li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread.length > 0 ? `Notifications, ${unread.length} new` : 'Notifications'}
        className="chrome-button"
      >
        {/* Gray, so the count is the only red thing here. */}
        <IconBellRinging aria-hidden size={22} />
        <AnimatePresence>
          {unread.length > 0 && (
            <motion.span
              key="badge"
              aria-hidden
              className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[0.6875rem] font-bold tabular-nums"
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                boxShadow: '0 0 0 2px var(--bg)',
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={transition(spring.snap)}
            >
              {unread.length > 9 ? '9+' : unread.length}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      {root && createPortal(panel, root)}
    </>
  )
}

function FeedRow({
  item,
  unread,
  now,
  onOpen,
}: {
  item: NotificationItem
  unread: boolean
  now: number
  onOpen: () => void
}) {
  return (
    <Link
      href={item.href as never}
      onClick={onOpen}
      className="flex items-center gap-3 rounded-[18px] px-3 py-2.5 transition-colors hover:bg-[var(--fill-quaternary)] active:scale-[0.98]"
    >
      <IconTile Icon={KIND_ICON[item.kind]} tone={item.tone} size={42} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[0.9375rem] font-semibold">{item.title}</span>
          <span className="ml-auto shrink-0 text-[0.75rem] tabular-nums text-[var(--label-tertiary)]">
            {item.when ?? relativeTime(item.at, now)}
          </span>
        </span>
        <span className="block truncate text-[0.8125rem] text-[var(--label-secondary)]">
          {item.detail}
        </span>
      </span>
      <span
        aria-label={unread ? 'New' : undefined}
        className="size-2 shrink-0 rounded-full"
        style={{ background: unread ? 'var(--accent)' : 'transparent' }}
      />
    </Link>
  )
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center px-6 pb-8 pt-6 text-center">
      <IconTile Icon={IconCelebrate} tone="green" variant="solid" size={64} />
      <p className="mt-4 text-[1.0625rem] font-semibold">All caught up</p>
      <p className="mt-1 text-[0.875rem] text-[var(--label-secondary)]">
        Nothing due, no warnings, no news.
      </p>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-3 py-3" aria-hidden>
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3">
          <span
            className="size-[42px] animate-pulse rounded-[30%]"
            style={{ background: 'var(--fill-tertiary)' }}
          />
          <span className="flex-1">
            <span
              className="block h-3 w-2/5 animate-pulse rounded-full"
              style={{ background: 'var(--fill-tertiary)' }}
            />
            <span
              className="mt-2 block h-3 w-4/5 animate-pulse rounded-full"
              style={{ background: 'var(--fill-quaternary)' }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}

/** From 640px, hang the panel off the bell's bottom-right corner. */
function anchorFor(button: HTMLButtonElement | null): Record<string, number> {
  if (!button || typeof window === 'undefined' || window.innerWidth < 640) return {}
  const rect = button.getBoundingClientRect()
  return {
    top: rect.bottom + 10,
    right: Math.max(12, window.innerWidth - rect.right),
  }
}

function manilaDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}
