'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { loadStudy, type PackSummary, type StudyData } from '@/lib/queries/study'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { IconCards } from '@/components/ui/icon'
import { StatCard } from '@/components/subjects/stat-card'
import { cx } from '@/lib/cx'

/**
 * Study.
 *
 * The screen opens with the one number a student came for — how many cards are
 * waiting — and puts the button that acts on it directly underneath. Everything
 * else is the packs those cards live in.
 *
 * Same shape as Subjects, deliberately: a figure strip, then a list that
 * becomes a two-up grid above `lg`. A student who has learnt one of these
 * screens has learnt both.
 */
export function StudyView() {
  const [data, setData] = useState<StudyData | null>(null)

  const reload = useCallback(async () => {
    setData(await loadStudy(new Date()))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void syncNow().then(reload)
  }, [reload])

  if (!data) return <StudySkeleton />

  const hasPacks = data.packs.length > 0

  return (
    <>
      <NavBar
        title="Study"
        trailing={
          hasPacks ? (
            <ButtonLink href="/study/new" size="sm" variant="plain">
              New pack
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="app-container stack pb-4">
        {!hasPacks ? (
          <Card>
            <EmptyState
              icon={<IconCards size={28} />}
              title="No packs yet. Make one for a subject and add the things you keep forgetting."
              action={
                <ButtonLink href="/study/new" variant="accent">
                  Make a pack
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition(spring.ui)}
              className="grid grid-cols-2 gap-3 lg:grid-cols-4"
            >
              <StatCard
                className="col-span-2"
                label="Due today"
                value={data.dueToday}
                emphasis
                tone={data.dueToday > 0 ? 'var(--accent)' : undefined}
                note={
                  data.dueToday === 0
                    ? 'Nothing waiting. Come back tomorrow.'
                    : `Across ${packsWithWork(data.packs)} pack${packsWithWork(data.packs) === 1 ? '' : 's'}`
                }
              />

              <StatCard
                label="Cards"
                value={data.totalCards}
                note={`In ${data.packs.length} pack${data.packs.length === 1 ? '' : 's'}`}
              />

              <StatCard
                label="Streak"
                value={data.streak === 0 ? '—' : data.streak}
                note={
                  data.streak === 0
                    ? 'Review today to start one'
                    : `day${data.streak === 1 ? '' : 's'} in a row`
                }
              />
            </motion.div>

            {data.dueToday > 0 && (
              <ButtonLink href="/study/review" variant="accent" block>
                Review {data.dueToday} card{data.dueToday === 1 ? '' : 's'}
              </ButtonLink>
            )}

            <section>
              <SectionHeader>Your packs</SectionHeader>
              <PackGrid packs={data.packs} />
            </section>
          </>
        )}
      </div>
    </>
  )
}

/** A date in the compact form the strip uses: "Fri 12 Sep". */
export function formatPackDate(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
}

function packsWithWork(packs: readonly PackSummary[]): number {
  return packs.filter((pack) => pack.dueCount > 0).length
}

/** One list on a phone, a two-up grid above `lg`. Mirrors `SubjectGrid`. */
function PackGrid({ packs }: { packs: PackSummary[] }) {
  return (
    <ul
      className={cx(
        'squircle overflow-hidden rounded-[var(--radius-md)] border border-[var(--separator)]',
        'divide-y divide-[var(--separator)]',
        'lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:overflow-visible',
        'lg:rounded-none lg:border-0',
      )}
    >
      {packs.map((pack) => (
        <li
          key={pack.id}
          className="squircle lg:rounded-[var(--radius-md)] lg:border lg:border-[var(--separator)]"
        >
          <PackRow pack={pack} />
        </li>
      ))}
    </ul>
  )
}

function PackRow({ pack }: { pack: PackSummary }) {
  return (
    <Link
      href={`/study/${pack.id}` as never}
      className="flex min-h-[var(--target-min)] flex-col gap-1.5 px-4 py-3.5 lg:h-full"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          {pack.courseCode && (
            <span className="type-headline type-data shrink-0">{pack.courseCode}</span>
          )}
          <span className="type-subheadline truncate">{pack.title}</span>
        </span>
        <span
          className="type-headline type-data shrink-0"
          style={pack.dueCount > 0 ? { color: 'var(--accent)' } : { color: 'var(--label-tertiary)' }}
        >
          {pack.dueCount > 0 ? pack.dueCount : '—'}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="type-footnote text-[var(--label-secondary)]">
          {pack.cardCount === 0
            ? 'No cards yet'
            : `${pack.cardCount} card${pack.cardCount === 1 ? '' : 's'}`}
          {pack.dueCount > 0 && ' · due now'}
        </span>
        {/* Compression is stated rather than left to look like a bug when a
            card comes back sooner than the interval on the button said. */}
        {pack.compressingUntil && (
          <span className="type-footnote type-data text-[var(--warning)]">
            every card before {formatPackDate(pack.compressingUntil)}
          </span>
        )}
      </div>
    </Link>
  )
}

function StudySkeleton() {
  return (
    <>
      <NavBar title="Study" />
      <div className="app-container stack" aria-busy="true" aria-label="Loading study packs">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="skeleton col-span-2 h-28 rounded-[var(--radius-md)]" />
          <div className="skeleton h-28 rounded-[var(--radius-md)]" />
          <div className="skeleton h-28 rounded-[var(--radius-md)]" />
        </div>
        <div className="skeleton h-48 rounded-[var(--radius-md)]" />
      </div>
    </>
  )
}
