import {

  IconAnnouncement,
  IconAsk,
  IconCampus,
  IconClassroom,
  IconAttendance,
  IconCards,
  IconGrades,
  IconCommute,
  IconDeadlines,
  IconSchedule,
  IconProfile,
  IconStudy,
  IconSubjects,
  IconToday,
} from '@/components/ui/icon'
import type { Tone } from '@/components/ui/icon-tile'

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
  /** The feature's colour, on its icon tile wherever the item is drawn. */
  tone: Tone
}

/** The badge counts, read once by the app layout and handed to both navs. */
export type NavCounts = Record<NonNullable<NavItem['badge']>, number>

export const badgeFor = (item: NavItem, counts: NavCounts): number =>
  item.badge ? counts[item.badge] : 0

export interface NavGroup {
  label: string
  items: NavItem[]
}

const startsWith = (prefix: string) => (pathname: string) => pathname.startsWith(prefix)

const SUBJECT_DESTINATIONS = ['/subjects/gwa', '/subjects/catch-up']

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Daily',
    items: [
      {
        href: '/today',
        tone: 'crimson',
        label: 'Today',
        Icon: IconToday,
        match: (p) => p === '/today' || p === '/',
      },
      { href: '/commute', tone: 'green', label: 'Commute', Icon: IconCommute, match: startsWith('/commute') },
      { href: '/schedule', tone: 'blue', label: 'Schedule', short: 'Sched', Icon: IconSchedule, match: startsWith('/schedule') },
      {
        href: '/deadlines',
        tone: 'crimson',
        label: 'Deadlines',
        short: 'Due',
        Icon: IconDeadlines,
        match: startsWith('/deadlines'),
        badge: 'deadlines',
      },
      {
        href: '/announcements',
        tone: 'crimson',
        label: 'Announcements',
        short: 'News',
        Icon: IconAnnouncement,
        match: startsWith('/announcements'),
        badge: 'announcements',
      },
      /* No badge. A class post with a due date is already counted by
       * Deadlines, and counting it twice would make the two numbers disagree
       * about the same piece of work. */
      { href: '/classroom', tone: 'gray', label: 'Classroom', short: 'Class', Icon: IconClassroom, match: startsWith('/classroom') },
    ],
  },
  {
    label: 'Academics',
    items: [
      /* Grades & GWA and Attendance live under `/subjects` in the URL but are
       * destinations of their own, so a bare prefix here would light Subjects
       * alongside them — two current pages, announced twice. */
      {
        href: '/subjects',
        tone: 'gray',
        label: 'Subjects',
        Icon: IconSubjects,
        match: (p) => p.startsWith('/subjects') && !SUBJECT_DESTINATIONS.some((child) => p.startsWith(child)),
      },
      { href: '/subjects/gwa', tone: 'gray', label: 'Grades & GWA', Icon: IconGrades, match: startsWith('/subjects/gwa') },
      { href: '/subjects/catch-up', tone: 'gray', label: 'Attendance', Icon: IconAttendance, match: startsWith('/subjects/catch-up') },
      { href: '/study', tone: 'gray', label: 'Study', Icon: IconCards, match: startsWith('/study') },
      { href: '/evaluations', tone: 'gray', label: 'Faculty eval', Icon: IconStudy, match: startsWith('/evaluations') },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/ask', tone: 'crimson', label: 'Ask OneTUP', short: 'Ask', Icon: IconAsk, match: startsWith('/ask') },
      { href: '/campus', tone: 'gray', label: 'Campus', Icon: IconCampus, match: startsWith('/campus') },
      { href: '/settings', tone: 'gray', label: 'Profile', Icon: IconProfile, match: startsWith('/settings') },
    ],
  },
]

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

const byHref = (href: string): NavItem => ALL_NAV_ITEMS.find((item) => item.href === href)!

/**
 * The four that reach the phone bar, plus the assistant in the well.
 *
 * A bar with nine destinations is a menu, not navigation — but the previous cut
 * of this list left six of the twelve destinations reachable only from a
 * sidebar that phones never see, which is worse: Commute, Announcements, Grades
 * & GWA, Attendance, Faculty eval and Settings were simply unreachable on a
 * phone unless a Today card happened to link to them.
 *
 * So the fifth slot is now More, and it opens `MORE_NAV` in a sheet. That is
 * the standard answer to this exact problem (iOS has shipped it since 2007) and
 * it has the property that matters: every destination is reachable in at most
 * two taps, and the four that are opened daily still cost one.
 */
export const PHONE_NAV: NavItem[] = [
  byHref('/today'),
  byHref('/schedule'),
  byHref('/ask'),
  byHref('/deadlines'),
]

/**
 * Everything the phone bar does not carry, in the order the sidebar groups it.
 * `/ask` is excluded because it is the raised button in the middle of the bar,
 * and listing it twice would suggest they are two different things.
 */
export const MORE_NAV: NavGroup[] = NAV_GROUPS.map((group) => ({
  label: group.label,
  items: group.items.filter(
    (item) => !PHONE_NAV.includes(item) && item.href !== '/ask',
  ),
})).filter((group) => group.items.length > 0)

/** The page title shown in the top bar, matched longest-prefix-first. */
export function titleFor(pathname: string): string {
  const match = [...ALL_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => item.match(pathname))
  return match?.label ?? 'OneTUP'
}


