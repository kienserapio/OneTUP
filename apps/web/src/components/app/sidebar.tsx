'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_GROUPS } from './nav-items'
import { cx } from '@/lib/cx'
import { displayName, initialsOf } from '@/lib/name'

/**
 * The desktop rail.
 *
 * Hidden below 900px, where a 244px column would take room the content needs
 * and the floating bar takes over instead. Both render from the same nav list,
 * so they cannot disagree about what exists or what is selected.
 */

export interface SidebarProps {
  fullName: string | null
  programCode: string | null
  yearSection: string | null
  counts: { deadlines: number; announcements: number }
}

export function Sidebar({ fullName, programCode, yearSection, counts }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="sidebar" aria-label="Sections">
      <div className="flex items-center gap-3 px-[18px] pb-4 pt-5">
        <span className="brand-mark" aria-hidden>
          1
        </span>
        <span className="min-w-0">
          <span className="type-headline block leading-none tracking-[-0.035em]">OneTUP</span>
          <span className="type-caption-2 block uppercase tracking-[0.09em] text-[var(--label-tertiary)]">
            TUP Manila
          </span>
        </span>
      </div>

      <nav className="flex-1 px-[11px] pb-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <h2 className="nav-label">{group.label}</h2>
            <ul>
              {group.items.map((item) => {
                const active = item.match(pathname)
                const badge = item.badge ? counts[item.badge] : 0

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href as never}
                      aria-current={active ? 'page' : undefined}
                      className="nav-item"
                    >
                      <item.Icon
                        size={18}
                        className={cx(active ? 'text-[var(--accent)]' : 'text-[var(--label-tertiary)]')}
                      />
                      <span className="truncate">{item.label}</span>
                      {badge > 0 && (
                        <span
                          className="ml-auto rounded-full px-1.5 py-px text-[0.625rem] font-semibold"
                          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <Link
        href={'/settings' as never}
        className="flex items-center gap-3 border-t px-[18px] py-4"
        style={{ borderColor: 'var(--separator)' }}
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full text-[0.75rem] font-semibold"
          style={{ background: 'var(--accent-subtle)', color: 'var(--crimson-800)' }}
          aria-hidden
        >
          {initialsOf(fullName)}
        </span>
        <span className="min-w-0">
          <span className="type-footnote block truncate font-semibold">
            {displayName(fullName)}
          </span>
          <span className="type-caption-2 block truncate text-[var(--label-tertiary)]">
            {[programCode, yearSection].filter(Boolean).join(' · ') || 'Set up your profile'}
          </span>
        </span>
      </Link>
    </aside>
  )
}
