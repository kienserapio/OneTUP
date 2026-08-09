import {

  IconAnnouncement,
  IconAsk,
  IconCampus,
  IconCheck,
  IconClock,
  IconCommute,
  IconDeadlines,
  IconSchedule,
  IconSettings,
  IconStudy,
  IconSubjects,
  IconToday,
} from '@/components/ui/icon'

/**
 * The navigation, in one place.
 *
 * The sidebar and the phone bar render from the same list, so the two can never
 * disagree about what exists or what is currently selected.
 *
 * Grouping is by *when a student reaches for it*, not by module number: the
 * things opened every day sit above the things opened when a grade lands or a
 * term ends. Every label names its contents — "Grades & GWA", not "Academics" —
 * because a specific label is what makes a destination predictable.
 */

export interface NavItem {
  href: string
  label: string
  /** Shorter form for the phone bar, where five labels share the width. */
  short?: string
  Icon: typeof IconToday
  match: (pathname: string) => boolean
  /** Which count, if any, this item shows as a badge. */
  badge?: 'deadlines' | 'announcements'
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

const startsWith = (prefix: string) => (pathname: string) => pathname.startsWith(prefix)

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Daily',
    items: [
      {
        href: '/today',
        label: 'Today',
        Icon: IconToday,
        match: (p) => p === '/today' || p === '/',
      },
      { href: '/commute', label: 'Commute', Icon: IconCommute, match: startsWith('/commute') },
      { href: '/schedule', label: 'Schedule', short: 'Sched', Icon: IconSchedule, match: startsWith('/schedule') },
      {
        href: '/deadlines',
        label: 'Deadlines',
        short: 'Due',
        Icon: IconDeadlines,
        match: startsWith('/deadlines'),
        badge: 'deadlines',
      },
      {
        href: '/announcements',
        label: 'Announcements',
        short: 'News',
        Icon: IconAnnouncement,
        match: startsWith('/announcements'),
        badge: 'announcements',
      },
    ],
  },
  {
    label: 'Academics',
    items: [
      { href: '/subjects', label: 'Subjects', Icon: IconSubjects, match: startsWith('/subjects') },
      { href: '/subjects/gwa', label: 'Grades & GWA', Icon: IconCheck, match: (p) => p === '/subjects/gwa' },
      { href: '/subjects/catch-up', label: 'Attendance', Icon: IconClock, match: (p) => p === '/subjects/catch-up' },
      { href: '/evaluations', label: 'Faculty eval', Icon: IconStudy, match: startsWith('/evaluations') },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/ask', label: 'Ask OneTUP', short: 'Ask', Icon: IconAsk, match: startsWith('/ask') },
      { href: '/campus', label: 'Campus', Icon: IconCampus, match: startsWith('/campus') },
      { href: '/settings', label: 'Settings', Icon: IconSettings, match: startsWith('/settings') },
    ],
  },
]

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

/**
 * The five that reach the phone bar. Everything else is one tap deeper, from
 * Today — a bar with nine destinations is a menu, not navigation.
 */
export const PHONE_NAV: NavItem[] = [
  ALL_NAV_ITEMS.find((item) => item.href === '/today')!,
  ALL_NAV_ITEMS.find((item) => item.href === '/schedule')!,
  ALL_NAV_ITEMS.find((item) => item.href === '/ask')!,
  ALL_NAV_ITEMS.find((item) => item.href === '/deadlines')!,
  ALL_NAV_ITEMS.find((item) => item.href === '/subjects')!,
]

/** The page title shown in the top bar, matched longest-prefix-first. */
export function titleFor(pathname: string): string {
  const match = [...ALL_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => item.match(pathname))
  return match?.label ?? 'OneTUP'
}


