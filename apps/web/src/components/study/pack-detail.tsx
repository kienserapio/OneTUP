'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import type { Flashcard } from '@onetup/core'
import {
  addCard,
  deleteCard,
  deletePack,
  editCard,
  loadPack,
  renamePack,
  type PackDetail as PackDetailData,
} from '@/lib/queries/study'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { Button, ButtonLink } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { NavBar } from '@/components/app/nav-bar'
import { IconCards, IconClock, IconWarning, IconPlay, IconSave } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { StatCard } from '@/components/subjects/stat-card'
import { CardEditor, type CardDraft } from '@/components/study/card-editor'
import { formatPackDate } from '@/components/study/study-view'
import { describeInterval } from '@/components/study/review-session'

/**
 * One pack: its cards, and the two things a student does with them — add more,
 * or start reviewing.
 *
 * The compression notice is the part worth getting right. When a pack is tied
 * to a subject with a deadline inside the week, intervals shorten so every card
 * is seen before the date — and a card coming back sooner than the button said
 * is mysterious unless the screen has already explained why.
 */
export function PackDetail({ packId }: { packId: string }) {
  const router = useRouter()
  const [data, setData] = useState<PackDetailData | null | undefined>(undefined)
  const [editing, setEditing] = useState<Flashcard | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const reload = useCallback(async () => {
    setData(await loadPack(packId, new Date()))
  }, [packId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void syncNow().then(reload)
  }, [reload])

  if (data === undefined) return <PackSkeleton />

  if (data === null) {
    return (
      <>
        <NavBar title="Pack" back={{ href: '/study', label: 'Study' }} largeTitle={false} />
        <div className="app-container stack pb-4">
          <Card>
            <EmptyState
              title="That pack is not here. It may have been deleted on another device."
              action={
                <ButtonLink href="/study" variant="plain">
                  Back to packs
                </ButtonLink>
              }
            />
          </Card>
        </div>
      </>
    )
  }

  const { pack, cards, dueCount, compressingUntil, courseCode } = data

  const onAdd = async (draft: CardDraft) => {
    await addCard({ packId, front: draft.front, back: draft.back })
    await reload()
  }

  const onEdit = async (draft: CardDraft) => {
    if (!editing) return
    await editCard(editing.id, draft)
    setEditing(null)
    await reload()
  }

  const onDeletePack = async () => {
    await deletePack(packId)
    router.replace('/study' as never)
  }

  return (
    <>
      <NavBar
        title={pack.title}
        subtitle={courseCode ?? undefined}
        back={{ href: '/study', label: 'Study' }}
        largeTitle={false}
        trailing={
          <Button size="sm" variant="plain" onClick={() => setRenaming(true)}>
            Rename
          </Button>
        }
      />

      <div className="app-container stack pb-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition(spring.ui)}
          className="grid grid-cols-2 gap-3"
        >
          <StatCard
            label="Due now"
            icon={<IconTile Icon={IconPlay} tone="crimson" size={28} />}
            value={dueCount}
            emphasis
            tone={dueCount > 0 ? 'var(--accent)' : undefined}
            note={dueCount === 0 ? 'Nothing waiting' : 'Ready to review'}
          />
          <StatCard
            label="Cards"
            icon={<IconTile Icon={IconCards} tone="gray" size={28} />}
            value={cards.length}
            note={cards.length === 0 ? 'Add your first below' : 'In this pack'}
          />
        </motion.div>

        {/* A pack that stopped says so, rather than sitting on a spinner the
            student will come back to. */}
        {pack.status !== 'ready' && (
          <div
            className="flex items-center gap-3 rounded-[var(--radius-lg)] p-3.5"
            style={{
              background:
                pack.status === 'failed' ? 'var(--tone-crimson-tint)' : 'var(--tone-crimson-tint)',
            }}
          >
            <IconTile
              Icon={pack.status === 'failed' ? IconWarning : IconClock}
              tone={pack.status === 'failed' ? 'crimson' : 'blue'}
              variant="solid"
              size={36}
            />
            <p className="type-subheadline flex-1">
              {pack.status === 'failed'
                ? 'Making cards from your notes did not finish. Nothing was lost — add cards by hand below, or try again with a new pack.'
                : 'Still reading your notes. Come back in a minute.'}
            </p>
          </div>
        )}

        {/* Stated on screen, because the behaviour is otherwise invisible
            until a card surprises somebody by coming back early. The short
            line says what is happening; the tip says why. */}
        {compressingUntil && (
          <div
            className="flex items-center gap-3 rounded-[var(--radius-lg)] p-3.5"
            style={{ background: 'var(--tone-crimson-tint)' }}
          >
            <IconTile Icon={IconClock} tone="crimson" variant="solid" size={36} />
            <p className="type-subheadline flex-1">
              Every card comes back before{' '}
              <span className="type-data font-semibold">{formatPackDate(compressingUntil)}</span>
            </p>
            <InfoTip title="Why sooner">
              There is a deadline on {courseCode ?? 'this subject'} then, so the schedule pulls
              cards in rather than using the usual spacing.
            </InfoTip>
          </div>
        )}

        {dueCount > 0 && (
          <ButtonLink href="/study/review" variant="accent" block leading={<IconPlay size={18} />}>
            Review {dueCount} card{dueCount === 1 ? '' : 's'}
          </ButtonLink>
        )}

        <section>
          <SectionHeader>Add a card</SectionHeader>
          <Card>
            <CardEditor onSubmit={onAdd} autoFocus={cards.length === 0} />
          </Card>
        </section>

        <section>
          <SectionHeader>
            {cards.length === 0 ? 'Cards' : `${cards.length} card${cards.length === 1 ? '' : 's'}`}
          </SectionHeader>
          {cards.length === 0 ? (
            <Card>
              <EmptyState
                icon={<IconTile Icon={IconCards} tone="gray" size={52} />}
                title="Nothing in this pack yet. Add the things you keep forgetting, one at a time."
              />
            </Card>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {cards.map((card) => (
                <li key={card.id} className="card overflow-hidden !rounded-[var(--radius-lg)]">
                  <CardRow card={card} onEdit={() => setEditing(card)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Button variant="destructive" block onClick={() => setConfirmingDelete(true)}>
          Delete this pack
        </Button>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Edit card">
        {editing && (
          <CardEditor
            initial={{ front: editing.front, back: editing.back }}
            submitLabel="Save changes"
            onSubmit={onEdit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Sheet>

      <RenameSheet
        open={renaming}
        title={pack.title}
        onClose={() => setRenaming(false)}
        onSave={async (next) => {
          await renamePack(packId, next)
          setRenaming(false)
          await reload()
        }}
      />

      <Sheet
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this pack?"
      >
        <div className="stack">
          <p className="type-body">
            {cards.length === 0
              ? 'There is nothing in it, so nothing is lost.'
              : `Its ${cards.length} card${cards.length === 1 ? '' : 's'} and everything recorded about reviewing them go too. This cannot be undone.`}
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" block onClick={() => void onDeletePack()}>
              Delete
            </Button>
            <Button variant="plain" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  )
}

function CardRow({ card, onEdit }: { card: Flashcard; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[0.9688rem] font-semibold">{card.front}</span>
        <span className="block truncate text-[0.8125rem] text-[var(--label-secondary)]">
          {card.back}
        </span>
        {/* `source_chunk_id` is the marker: a card with one was written by a
            model from a specific paragraph, and a card without one was written
            by the student. Only the first is generated content, and only the
            first can be checked against a source (AI spec §8.3, ADR-007). */}
        {card.source_chunk_id && (
          <span className="mt-1 inline-block">
            <Badge tone="generated">Generated</Badge>
          </span>
        )}
        <span className="type-caption-2 mt-0.5 block text-[var(--label-tertiary)]">
          {card.repetitions === 0
            ? 'New'
            : `Seen ${card.repetitions}×${card.lapses > 0 ? `, forgotten ${card.lapses}×` : ''} · back in ${describeInterval(card.interval_days)}`}
        </span>
      </button>

      {confirming ? (
        <span className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => void deleteCard(card.id)}
            aria-label={`Delete card: ${card.front}`}
          >
            Delete
          </Button>
          <Button size="sm" variant="plain" onClick={() => setConfirming(false)}>
            No
          </Button>
        </span>
      ) : (
        <Button
          size="sm"
          variant="plain"
          className="shrink-0"
          onClick={() => setConfirming(true)}
          aria-label={`Remove card: ${card.front}`}
        >
          Remove
        </Button>
      )}
    </div>
  )
}

function RenameSheet({
  open,
  title,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  onClose: () => void
  onSave: (title: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(title)

  useEffect(() => {
    if (open) setDraft(title)
  }, [open, title])

  return (
    <Sheet open={open} onClose={onClose} title="Rename pack">
      <div className="stack">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim()) void onSave(draft.trim())
          }}
          maxLength={120}
          className="field w-full"
          aria-label="Pack title"
        />
        <Button
          variant="accent"
          block
          disabled={!draft.trim()}
          onClick={() => void onSave(draft.trim())}
          leading={<IconSave size={18} />}
        >
          Save
        </Button>
      </div>
    </Sheet>
  )
}

function PackSkeleton() {
  return (
    <>
      <NavBar title="Pack" back={{ href: '/study', label: 'Study' }} largeTitle={false} />
      <div className="app-container stack" aria-busy="true" aria-label="Loading pack">
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-28 rounded-[var(--radius-lg)]" />
        </div>
        <div className="skeleton h-40 rounded-[var(--radius-lg)]" />
      </div>
    </>
  )
}
