'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { loadStudy, type PackSummary, type StudyData } from '@/lib/queries/study'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { ButtonLink } from '@/components/ui/button'
import { NavBar } from '@/components/app/nav-bar'
import { IconCards, IconCelebrate, IconPlay, IconPlus } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { Row, RowList, RowPill } from '@/components/ui/row'
import { StatCard } from '@/components/subjects/stat-card'

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
        info={
          <InfoTip title="How review works">
            Each card comes back just before you would forget it. Answer honestly and the gaps
            stretch out; miss one and it comes back tomorrow.
          </InfoTip>
        }
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
              icon={<IconTile Icon={IconCards} tone="crimson" variant="solid" size={64} />}
              title="Make a pack for a subject, then add what you keep forgetting."
              action={
                <ButtonLink href="/study/new" variant="accent" leading={<IconPlus size={18} />}>
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
                icon={<IconTile Icon={IconPlay} tone="crimson" size={28} />}
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
                icon={<IconTile Icon={IconCards} tone="gray" size={28} />}
                value={data.totalCards}
                note={`In ${data.packs.length} pack${data.packs.length === 1 ? '' : 's'}`}
              />

              <StatCard
                label="Streak"
                icon={<IconTile Icon={IconCelebrate} tone="crimson" size={28} />}
                value={data.streak === 0 ? '—' : data.streak}
                note={
                  data.streak === 0
                    ? 'Review today to start one'
                    : `day${data.streak === 1 ? '' : 's'} in a row`
                }
              />
            </motion.div>

            {data.dueToday > 0 && (
              <ButtonLink
                href="/study/review"
                variant="accent"
                block
                leading={<IconPlay size={18} />}
              >
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

/** Every pack its own floating row; two-up above `lg`. */
function PackGrid({ packs }: { packs: PackSummary[] }) {
  return (
    <RowList label="Your packs" className="lg:!grid lg:grid-cols-2 lg:gap-3">
      {packs.map((pack) => (
        <Row
          key={pack.id}
          href={`/study/${pack.id}`}
          leading={<IconTile Icon={IconCards} tone="gray" size={40} />}
          title={pack.title}
          detail={
            pack.status === 'processing'
              ? 'Reading your notes…'
              : pack.status === 'failed'
                ? 'Could not read your notes'
                : pack.cardCount === 0
                  ? 'No cards yet'
                  : `${pack.cardCount} card${pack.cardCount === 1 ? '' : 's'}`
          }
          meta={
            pack.courseCode || pack.dueCount > 0 || pack.status === 'failed' || pack.compressingUntil ? (
              <>
                {pack.courseCode && <RowPill>{pack.courseCode}</RowPill>}
                {pack.status === 'failed' ? (
                  <RowPill tone="crimson">Failed</RowPill>
                ) : pack.dueCount > 0 ? (
                  <RowPill tone="crimson">{pack.dueCount} due</RowPill>
                ) : null}
                {/* Compression is stated rather than left to look like a bug
                    when a card comes back sooner than the button said. */}
                {pack.compressingUntil && (
                  <RowPill tone="crimson">
                    every card before {formatPackDate(pack.compressingUntil)}
                  </RowPill>
                )}
              </>
            ) : undefined
          }
        />
      ))}
    </RowList>
  )
}

function StudySkeleton() {
  return (
    <>
      <NavBar title="Study" />
      <div className="app-container stack" aria-busy="true" aria-label="Loading study packs">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="skeleton col-span-2 h-28 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
        </div>
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-[72px] rounded-[var(--radius-lg)]" />
          ))}
        </div>
      </div>
    </>
  )
}
