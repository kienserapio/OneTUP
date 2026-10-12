'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import type { ImportProposal, ReviewedCourse } from '@/lib/import/types'
import { syncNow } from '@/lib/offline/sync'
import { spring, transition } from '@/design/motion'
import { Card } from '@/components/ui/surfaces'
import { NavBar } from '@/components/app/nav-bar'
import { IconCheck, IconClipboard, IconEye, IconKey, IconShield } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { ImportReview } from '@/components/schedule/import-review'
import { ErsConnect, PasteBox } from '@/components/schedule/import-source'
import { Row } from '@/components/ui/row'

/**
 * Importing a schedule after onboarding.
 *
 * The same pipeline as onboarding — collect, parse, review, commit — with the
 * same two entry points and the same rule that nothing is committed until the
 * student has looked at every row (TDD §3.2). Re-importing replaces the
 * imported blocks of the courses in the proposal and leaves manual blocks
 * alone, so a student can safely re-run this after ERS fixes a typo.
 */

type Step = 'choose' | 'connect' | 'paste' | 'review'

export interface ScheduleImportProps {
  studentNumber: string
  emailVerified: boolean
  termCode: string
  termLabel: string
}

export function ScheduleImport({
  studentNumber,
  emailVerified,
  termCode,
  termLabel,
}: ScheduleImportProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('choose')
  const [proposal, setProposal] = useState<ImportProposal | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [source, setSource] = useState<'ers_import' | 'paste'>('ers_import')

  async function commit(courses: ReviewedCourse[]) {
    const response = await fetch('/api/schedule/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term_code: termCode, source, job_id: jobId, courses }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.error?.message ?? 'That did not save. Try again.')
    }

    await syncNow()
    router.push('/schedule' as never)
    router.refresh()
  }

  return (
    <>
      <NavBar
        title="Import"
        subtitle={termLabel || undefined}
        back={{ href: '/schedule', label: 'Schedule' }}
      />

      <div className="app-container pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={transition(spring.ui)}
          >
            {step === 'choose' && (
              <ChooseStep
                termLabel={termLabel}
                onConnect={() => setStep('connect')}
                onPaste={() => setStep('paste')}
              />
            )}

            {step === 'connect' && (
              <ErsConnect
                studentNumber={studentNumber}
                termCode={termCode}
                termLabel={termLabel}
                emailVerified={emailVerified}
                submitLabel="Import my schedule"
                busyLabel="Reading your schedule…"
                onImported={(result, job) => {
                  setProposal(result)
                  setJobId(job)
                  setSource('ers_import')
                  setStep('review')
                }}
                onPaste={() => setStep('paste')}
                onCancel={() => setStep('choose')}
              />
            )}

            {step === 'paste' && (
              <PasteBox
                title="Paste your schedule"
                submitLabel="Read it"
                onParsed={(result) => {
                  setProposal(result)
                  setJobId(null)
                  setSource('paste')
                  setStep('review')
                }}
                onCancel={() => setStep('choose')}
              />
            )}

            {step === 'review' && proposal && (
              <ImportReview
                proposal={proposal}
                onCancel={() => setStep('choose')}
                onCommit={commit}
                commitLabel="Save my schedule"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}

function ChooseStep({
  termLabel,
  onConnect,
  onPaste,
}: {
  termLabel: string
  onConnect: () => void
  onPaste: () => void
}) {
  return (
    <div className="stack">
      <header>
        <h2 className="type-title-2 flex items-center gap-1.5">
          Bring in your schedule
          <InfoTip title="Before it saves">
            {termLabel
              ? `Whatever you import lands in ${termLabel}. You review every row before anything saves.`
              : 'You review every row before anything saves.'}
          </InfoTip>
        </h2>
        <p className="type-subheadline mt-1 text-[var(--label-secondary)]">Pick a way in.</p>
      </header>

      {/* Two ways in, and the promise that governs both — side by side once
          there is room, because they are read as one decision. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="row-list">
          <Row
            as="div"
            onClick={onConnect}
            leading={<IconTile Icon={IconKey} tone="blue" size={40} />}
            title="Connect ERS"
            detail="One sign-in, password discarded"
          />
          <Row
            as="div"
            onClick={onPaste}
            leading={<IconTile Icon={IconClipboard} tone="blue" size={40} />}
            title="Paste it instead"
            detail="No password, works when ERS is down"
          />
        </div>

        <Card>
          <p className="type-subheadline font-semibold">Either way</p>
          <ul className="mt-3 space-y-3">
            {[
              { Icon: IconEye, text: 'Nothing is saved until you have checked it.' },
              { Icon: IconCheck, text: 'Anything the reader was unsure about is flagged for you.' },
              { Icon: IconShield, text: 'Blocks you added by hand are left exactly as they are.' },
            ].map((point) => (
              <li key={point.text} className="type-subheadline flex items-center gap-3">
                <IconTile Icon={point.Icon} tone="green" size={32} />
                <span>{point.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
