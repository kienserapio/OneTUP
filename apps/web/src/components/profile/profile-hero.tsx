'use client'

import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { displayName, initialsOf } from '@/lib/name'
import { cx } from '@/lib/cx'
import {
  IconAlarm,
  IconAttendance,
  IconCelebrate,
  IconDeadlines,
  IconGrades,
  IconLock,
  IconStudy,
  IconSubjects,
  type IconProps,
} from '@/components/ui/icon'
import { InfoTip } from '@/components/ui/info-tip'
import type { ProfileStats } from './use-profile-stats'

/**
 * The top of the profile: who the student is, how their term is going, and
 * what they have earned.
 *
 * It is meant to be a little fun — a page about yourself should feel like
 * yours — but quiet about it: crimson for the avatar and what has been earned,
 * ink and grey for everything else. Every number and badge comes from the
 * student's own rows, so the fun never runs ahead of the facts.
 */

export interface HeroProfile {
  fullName: string | null
  studentNumber: string | null
  programCode: string | null
  yearLevel: number | null
  sectionLabel: string | null
  campus: string | null
  email: string | null
}

type Glyph = ComponentType<IconProps>

/* --- Hero ---------------------------------------------------------------- */

export function ProfileHero({
  profile,
  termLabel,
  corner,
}: {
  profile: HeroProfile
  termLabel: string | null
  /** Pinned to the card's top right — the "Saved" flag lives here. */
  corner?: ReactNode
}) {
  const still = useReducedMotion()
  const yearText = profile.yearLevel ? `${profile.yearLevel}${ordinal(profile.yearLevel)} year` : null

  return (
    <section className="card squircle relative overflow-hidden !p-0">
      {corner && <div className="absolute right-3 top-1 z-10">{corner}</div>}

      {/* One soft crimson shape behind the avatar — the only colour up here
          besides the avatar itself. A curve, not a banner. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-24 size-72 rounded-full"
        style={{ background: 'var(--tone-crimson-tint)' }}
      />

      <div className="relative flex flex-col items-center px-5 pb-5 pt-7 text-center sm:flex-row sm:items-center sm:gap-6 sm:px-7 sm:pt-6 sm:text-left">
        <motion.div
          className="relative shrink-0"
          initial={still ? false : { scale: 0.7, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={transition(spring.flick)}
        >
          <span
            aria-hidden
            className="grid size-[96px] rotate-[-4deg] place-items-center rounded-[34%] text-[2.125rem] font-bold tracking-[-0.03em]"
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              boxShadow:
                'inset 0 1px 0 rgb(255 255 255 / 0.24), 0 0 0 5px var(--bg), 0 16px 30px -14px color-mix(in srgb, var(--accent) 70%, transparent)',
            }}
          >
            <span className="rotate-[4deg]">{initialsOf(profile.fullName)}</span>
          </span>
          {profile.yearLevel && (
            <span
              className="absolute -bottom-1 -right-2 grid size-8 place-items-center rounded-full text-[0.875rem] font-bold"
              style={{ background: 'var(--ink)', color: 'var(--on-ink)', boxShadow: '0 0 0 4px var(--bg)' }}
              aria-label={yearText ?? undefined}
            >
              {profile.yearLevel}
            </span>
          )}
        </motion.div>

        <div className="mt-4 min-w-0 flex-1 sm:mt-0">
          {/* ERS hands back "SERAPIO, KIEN LERISS RAMOS". The sidebar already
              reads it back as a name; this has to agree. */}
          <h2 className="text-[1.625rem] font-bold leading-tight tracking-[-0.025em]">
            {profile.fullName ? displayName(profile.fullName) : 'Your account'}
          </h2>
          {profile.email && (
            <p className="mt-0.5 truncate text-[0.875rem] text-[var(--label-secondary)]">
              {profile.email}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
            {[profile.programCode, yearText, profile.sectionLabel, profile.campus && titleCase(profile.campus)]
              .filter(Boolean)
              .map((chip) => (
                <Chip key={chip as string}>{chip}</Chip>
              ))}
          </div>
        </div>
      </div>

      <div className="relative grid grid-cols-2 gap-2 px-5 pb-5 text-left sm:px-7">
        <Detail label="Student no." value={profile.studentNumber} mono />
        <Detail label="Term" value={termLabel} />
      </div>
    </section>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded-full px-3 py-1 text-[0.8125rem] font-semibold"
      style={{ background: 'var(--canvas)', color: 'var(--label-secondary)' }}
    >
      {children}
    </span>
  )
}

function Detail({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] px-3.5 py-2.5" style={{ background: 'var(--canvas)' }}>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--label-tertiary)]">
        {label}
      </p>
      <p className={cx('text-[0.9375rem] font-semibold leading-snug', mono ? 'type-data truncate' : 'line-clamp-2')}>
        {value ?? <span className="font-medium text-[var(--label-tertiary)]">Not set</span>}
      </p>
    </div>
  )
}

/* --- Stats --------------------------------------------------------------- */

interface Stat {
  key: string
  label: string
  value: string
  unit?: string
  Icon: Glyph
  href: string
}

export function ProfileStatTiles({ stats }: { stats: ProfileStats | null }) {
  const tiles: Stat[] = [
    {
      key: 'gwa',
      label: 'GWA',
      value: stats?.gwa != null ? stats.gwa.toFixed(2) : '—',
      Icon: IconGrades,
      href: '/gwa',
    },
    {
      key: 'attendance',
      label: 'Attendance',
      value: stats?.attendanceRate != null ? String(stats.attendanceRate) : '—',
      unit: stats?.attendanceRate != null ? '%' : undefined,
      Icon: IconAttendance,
      href: '/subjects',
    },
    {
      key: 'deadlines',
      label: 'Tasks done',
      value: stats ? String(stats.deadlinesDone) : '—',
      Icon: IconDeadlines,
      href: '/deadlines',
    },
    {
      key: 'streak',
      label: 'Study streak',
      value: stats ? String(stats.studyStreak) : '—',
      unit: stats ? (stats.studyStreak === 1 ? 'day' : 'days') : undefined,
      Icon: IconStudy,
      href: '/study',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile, index) => (
        <motion.div
          key={tile.key}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transition(spring.snap), delay: 0.05 + index * 0.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Link
            href={tile.href as never}
            className="card squircle flex h-full flex-col gap-3 p-4"
            aria-label={`${tile.label}: ${tile.value}${tile.unit ? ` ${tile.unit}` : ''}`}
          >
            <span aria-hidden className="text-[var(--label-tertiary)]">
              <tile.Icon size={22} />
            </span>
            <span>
              <span className="block text-[1.75rem] font-bold leading-none tracking-[-0.03em] tabular-nums">
                {tile.value}
                {tile.unit && (
                  <span className="ml-1 text-[0.875rem] font-semibold tracking-normal text-[var(--label-tertiary)]">
                    {tile.unit}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[0.8125rem] font-medium text-[var(--label-secondary)]">
                {tile.label}
              </span>
            </span>
          </Link>
        </motion.div>
      ))}
    </div>
  )
}

/* --- Badges -------------------------------------------------------------- */

interface Badge {
  key: string
  name: string
  /** What earns it, said plainly — shown as the badge's hint either way. */
  rule: string
  Icon: Glyph
  earned: boolean
}

/**
 * Badges, each a plain rule over the student's own data. Locked ones still
 * show, greyed, with what it takes — a goal is more fun than a gap.
 */
function badgesFor(stats: ProfileStats): Badge[] {
  return [
    {
      key: 'perfect',
      name: 'Perfect attendance',
      rule: 'No absences across at least 5 classes',
      Icon: IconAttendance,
      earned: stats.sessions >= 5 && stats.absences === 0,
    },
    {
      key: 'early',
      name: 'Early bird',
      rule: 'A class that starts before 8:00 AM',
      Icon: IconAlarm,
      earned: stats.earliestStart !== null && stats.earliestStart < '08:00',
    },
    {
      key: 'crusher',
      name: 'Deadline crusher',
      rule: '5 deadlines marked done',
      Icon: IconDeadlines,
      earned: stats.deadlinesDone >= 5,
    },
    {
      key: 'honors',
      name: 'Honor pace',
      rule: 'A GWA of 1.75 or better',
      Icon: IconGrades,
      earned: stats.gwa !== null && stats.gwa <= 1.75,
    },
    {
      key: 'streak',
      name: 'On a roll',
      rule: 'Study 3 days in a row',
      Icon: IconCelebrate,
      earned: stats.studyStreak >= 3,
    },
    {
      key: 'load',
      name: 'Full load',
      rule: '21 or more units this term',
      Icon: IconSubjects,
      earned: stats.units >= 21,
    },
  ]
}

export function ProfileBadges({ stats }: { stats: ProfileStats | null }) {
  if (!stats) return null
  const badges = badgesFor(stats).sort((a, b) => Number(b.earned) - Number(a.earned))
  const earned = badges.filter((badge) => badge.earned).length

  return (
    <section>
      <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
        <span className="flex items-center gap-1.5">
          <h2 className="type-section-header">Badges</h2>
          <InfoTip title="Badges">
            Each one is a simple rule over your own schedule, attendance, grades and deadlines.
            Locked ones show what it takes.
          </InfoTip>
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold tabular-nums"
          style={{ background: 'var(--bg)', color: 'var(--label-secondary)' }}
        >
          {earned} / {badges.length}
        </span>
      </div>

      <ul className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-6 sm:px-0">
        {badges.map((badge, index) => (
          <motion.li
            key={badge.key}
            className="card squircle relative flex w-[6.75rem] shrink-0 snap-start flex-col items-center gap-2 px-2 py-3.5 text-center sm:w-auto"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...transition(spring.flick), delay: 0.1 + index * 0.05 }}
            title={badge.rule}
          >
            <span className="relative">
              <span
                className="grid size-12 place-items-center"
                style={{ color: badge.earned ? 'var(--accent)' : 'var(--label-quaternary)' }}
              >
                <badge.Icon size={34} />
              </span>
              {!badge.earned && (
                <IconLock
                  aria-hidden
                  size={14}
                  className="absolute -bottom-0.5 -right-0.5 text-[var(--label-tertiary)]"
                />
              )}
            </span>
            <span className="text-[0.75rem] font-semibold leading-tight">
              {badge.name}
              <span className="sr-only">
                {badge.earned ? ', earned' : `, locked: ${badge.rule}`}
              </span>
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  )
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
