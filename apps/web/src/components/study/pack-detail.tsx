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
import { Card, EmptyState, SectionHeader } from '@/components/ui/surfaces'
import { Button, ButtonLink } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { NavBar } from '@/components/app/nav-bar'
import { IconCards } from '@/components/ui/icon'
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
            value={dueCount}
            emphasis
            tone={dueCount > 0 ? 'var(--accent)' : undefined}
            note={dueCount === 0 ? 'Nothing waiting' : 'Ready to review'}
          />
          <StatCard
            label="Cards"
            value={cards.length}
            note={cards.length === 0 ? 'Add your first below' : 'In this pack'}
          />
        </motion.div>

        {/* Stated in words, because the behaviour is otherwise invisible until
            a card surprises somebody by coming back early. */}
        {compressingUntil && (
          <Card className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: 'var(--warning)' }}
            />
            <p className="type-subheadline flex-1">
              There is a deadline on {courseCode ?? 'this subject'} on{' '}
              <span className="type-data">{formatPackDate(compressingUntil)}</span>, so the
              schedule is pulling cards in — every card before then, rather than the usual
              spacing.
            </p>
          </Card>
        )}

        {dueCount > 0 && (
          <ButtonLink href="/study/review" variant="accent" block>
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
                icon={<IconCards size={26} />}
                title="Nothing in this pack yet. Add the things you keep forgetting, one at a time."
              />
            </Card>
          ) : (
            <ul className="squircle divide-y divide-[var(--separator)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--separator)]">
              {cards.map((card) => (
                <li key={card.id}>
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
    <div className="flex items-start gap-3 px-4 py-3">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="type-subheadline block truncate">{card.front}</span>
        <span className="type-footnote block truncate text-[var(--label-secondary)]">
          {card.back}
        </span>
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
        <Button variant="accent" block disabled={!draft.trim()} onClick={() => void onSave(draft.trim())}>
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
          <div className="skeleton h-28 rounded-[var(--radius-md)]" />
          <div className="skeleton h-28 rounded-[var(--radius-md)]" />
        </div>
        <div className="skeleton h-40 rounded-[var(--radius-md)]" />
      </div>
    </>
  )
}
