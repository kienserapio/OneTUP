'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { PasteImporter } from '@/lib/import/paste'
import type { ImportProposal, ReviewedCourse } from '@/lib/import/types'
import { ImportReview } from '@/components/schedule/import-review'
import { Button } from '@/components/ui/button'
import { Card, ListGroup, ListRow } from '@/components/ui/surfaces'
import { Field, FormError } from '@/components/auth/auth-form'
import { IconCheck } from '@/components/ui/icon'
import { spring, transition } from '@/design/motion'
import { syncNow } from '@/lib/offline/sync'

/**
 * Onboarding.
 *
 * Two design constraints shape this whole flow:
 *
 *   1. Steps 2 and 3 are skippable, and visibly so. The product has to be fully
 *      usable without ever supplying ERS credentials — that is what makes the
 *      request a genuine choice rather than a toll (auth doc §3).
 *   2. The credential fields never touch a store. They live in component state,
 *      are sent once, and are cleared on both the success and the failure path
 *      (auth doc §5.1). No Zustand, no React Query cache, no storage.
 */

type Step = 'consent' | 'connect' | 'paste' | 'review' | 'setup' | 'install'

const ORDER: Step[] = ['consent', 'connect', 'review', 'setup', 'install']

export interface OnboardingProps {
  studentNumber: string
  emailVerified: boolean
  areas: { id: string; name: string; city: string | null }[]
  termCode: string
  termLabel: string
}

export function Onboarding({
  studentNumber,
  emailVerified,
  areas,
  termCode,
  termLabel,
}: OnboardingProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('consent')
  const [proposal, setProposal] = useState<ImportProposal | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [importSource, setImportSource] = useState<'ers_import' | 'paste'>('ers_import')

  const position = Math.max(0, ORDER.indexOf(step === 'paste' ? 'connect' : step))

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="app-container py-4 safe-top">
        <Progress current={position} total={ORDER.length} />
      </header>

      <main id="main" className="app-container flex-1 pb-12">
        <div className="mx-auto w-full max-w-[34rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={transition(spring.ui)}
            >
              {step === 'consent' && (
                <ConsentStep
                  emailVerified={emailVerified}
                  onConnect={() => setStep('connect')}
                  onPaste={() => setStep('paste')}
                  onSkip={() => setStep('setup')}
                />
              )}

              {step === 'connect' && (
                <ConnectStep
                  studentNumber={studentNumber}
                  termCode={termCode}
                  termLabel={termLabel}
                  onImported={(result, job) => {
                    setProposal(result)
                    setJobId(job)
                    setImportSource('ers_import')
                    setStep('review')
                  }}
                  onPaste={() => setStep('paste')}
                  onBack={() => setStep('consent')}
                />
              )}

              {step === 'paste' && (
                <PasteStep
                  onParsed={(result) => {
                    setProposal(result)
                    setJobId(null)
                    setImportSource('paste')
                    setStep('review')
                  }}
                  onBack={() => setStep('consent')}
                />
              )}

              {step === 'review' && proposal && (
                <ImportReview
                  proposal={proposal}
                  onCancel={() => setStep('consent')}
                  onCommit={async (courses) => {
                    await commitSchedule(courses, termCode, importSource, jobId)
                    await syncNow()
                    setStep('setup')
                  }}
                />
              )}

              {step === 'setup' && (
                <SetupStep areas={areas} onDone={() => setStep('install')} />
              )}

              {step === 'install' && (
                <InstallStep
                  onDone={async () => {
                    await finishOnboarding()
                    router.push('/today')
                    router.refresh()
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

function Progress({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={current + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${current + 1} of ${total}`}
      className="flex gap-1.5"
    >
      {Array.from({ length: total }, (_, index) => (
        <motion.span
          key={index}
          className="h-1 flex-1 rounded-full"
          initial={false}
          animate={{
            backgroundColor: index <= current ? 'var(--accent)' : 'var(--fill-tertiary)',
          }}
          transition={transition(spring.snap)}
        />
      ))}
    </div>
  )
}

/**
 * The consent screen. Copy is taken verbatim from the content spec — including
 * the sentence admitting the residual risk, which is stated rather than buried
 * because a student cannot consent to something they were not told.
 */
function ConsentStep({
  emailVerified,
  onConnect,
  onPaste,
  onSkip,
}: {
  emailVerified: boolean
  onConnect: () => void
  onPaste: () => void
  onSkip: () => void
}) {
  return (
    <div className="stack">
      <h1 className="type-title-1">About your ERS password</h1>

      <p className="type-body">
        To import your schedule, OneTUP signs in to ERS as you, once, and reads your schedule page.
        Here&rsquo;s exactly what happens:
      </p>

      <ul className="stack">
        {[
          'Your student number, ERS password, and birthdate are sent over an encrypted connection.',
          "They're used to sign in, read your schedule, and then discarded.",
          'Your schedule is saved. Your password is not — there’s nowhere in OneTUP that stores it.',
          'Nothing in your ERS account is changed, submitted, or read beyond the schedule page.',
        ].map((point) => (
          <li key={point} className="type-body flex gap-2.5">
            <IconCheck size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--ok)' }} />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <Card>
        <p className="type-body">
          Being straight with you: your password does pass through our server while this happens,
          and exists in memory for a few seconds. We don&rsquo;t keep it, but it isn&rsquo;t zero
          risk.
        </p>
      </Card>

      <p className="type-body">
        If you&rsquo;d rather not, paste your schedule instead. Everything else works the same.
      </p>

      {!emailVerified && (
        <FormError>
          Verify your email first — check your inbox. ERS connection stays locked until you do.
        </FormError>
      )}

      <div className="stack pt-2">
        <Button variant="accent" block onClick={onConnect} disabled={!emailVerified}>
          Connect ERS
        </Button>
        <Button block onClick={onPaste}>
          Paste it instead
        </Button>
        <Button variant="plain" block onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  )
}

function ConnectStep({
  studentNumber,
  termCode,
  termLabel,
  onImported,
  onPaste,
  onBack,
}: {
  studentNumber: string
  termCode: string
  termLabel: string
  onImported: (proposal: ImportProposal, jobId: string | null) => void
  onPaste: () => void
  onBack: () => void
}) {
  // These three live here and nowhere else. See the note at the top of the file.
  const [number, setNumber] = useState(studentNumber)
  const [password, setPassword] = useState('')
  const [birthdate, setBirthdate] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      const response = await fetch('/api/ers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_number: number.trim(),
          password,
          birthdate,
          term_code: termCode,
        }),
      })

      const body = await response.json()

      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not work. Try again, or paste your schedule.')
        return
      }

      onImported(
        {
          parserVersion: body.parser_version ?? 'unknown',
          courses: body.courses ?? [],
          unparsed: body.unparsed ?? [],
          warnings: body.warnings ?? [],
        },
        body.job_id ?? null,
      )
    } catch {
      setError("We couldn't reach ERS. Try again in a bit, or paste your schedule instead.")
    } finally {
      // Cleared on both paths, always.
      setPassword('')
      setBirthdate('')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <h1 className="type-title-1">Connect ERS</h1>
      {termLabel && (
        <p className="type-subheadline text-[var(--label-secondary)]">
          Importing your {termLabel} schedule.
        </p>
      )}

      {error && <FormError>{error}</FormError>}

      <Field
        id="ers-student-number"
        label="Student number"
        value={number}
        onChange={setNumber}
        autoComplete="off"
        spellCheck={false}
        required
      />

      <Field
        id="ers-password"
        label="ERS password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="off"
        spellCheck={false}
        required
        hint="Used once, then discarded. Never saved."
      />

      <Field
        id="ers-birthdate"
        label="Birthdate"
        type="date"
        value={birthdate}
        onChange={setBirthdate}
        autoComplete="off"
        required
        hint="ERS asks for this too, and it has to match your record exactly."
      />

      <Button type="submit" variant="accent" block disabled={busy}>
        {busy ? 'Reading your schedule…' : 'Import my schedule'}
      </Button>

      <div className="flex gap-2">
        <Button variant="plain" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button variant="plain" onClick={onPaste} disabled={busy} block>
          Paste it instead
        </Button>
      </div>
    </form>
  )
}

function PasteStep({
  onParsed,
  onBack,
}: {
  onParsed: (proposal: ImportProposal) => void
  onBack: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function parse() {
    setError(null)
    setBusy(true)
    const result = await new PasteImporter().import({ termCode: '', pasted: text })
    setBusy(false)

    if (result.courses.length === 0) {
      setError(
        "Nothing in that looked like a schedule. Try copying the whole table from the ERS page, or add your subjects by hand.",
      )
      return
    }
    onParsed(result)
  }

  return (
    <div className="stack">
      <h1 className="type-title-1">Paste your schedule</h1>
      <p className="type-body text-[var(--label-secondary)]">
        Open your schedule in ERS, select the table, copy it, and paste it here. No password needed.
      </p>

      {error && <FormError>{error}</FormError>}

      <label htmlFor="paste-area" className="sr-only">
        Your ERS schedule
      </label>
      <textarea
        id="paste-area"
        rows={10}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste here"
        className="field type-data font-mono text-[0.9375rem]"
      />

      <Button variant="accent" block onClick={() => void parse()} disabled={busy || !text.trim()}>
        {busy ? 'Reading…' : 'Read it'}
      </Button>
      <Button variant="plain" block onClick={onBack}>
        Back
      </Button>
    </div>
  )
}

function SetupStep({
  areas,
  onDone,
}: {
  areas: { id: string; name: string; city: string | null }[]
  onDone: () => void
}) {
  const [areaId, setAreaId] = useState('')
  const [preparation, setPreparation] = useState(45)
  const [arriveEarly, setArriveEarly] = useState(15)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      setBusy(false)
      return
    }

    await supabase.from('user_preferences').upsert({
      user_id: userId,
      home_area_id: areaId || null,
      preparation_minutes: preparation,
      arrive_early_minutes: arriveEarly,
    })

    const targetValue = Number.parseFloat(target)
    if (Number.isFinite(targetValue) && targetValue >= 1 && targetValue <= 5) {
      await supabase.from('user_thresholds').insert({
        user_id: userId,
        kind: 'gwa',
        label: 'My target',
        scope: 'term',
        comparator: '<=',
        value: targetValue,
      })
    }

    setBusy(false)
    onDone()
  }

  return (
    <div className="stack">
      <h1 className="type-title-1">A few settings</h1>
      <p className="type-body text-[var(--label-secondary)]">
        These make the wake-up times and the GWA warnings actually useful. You can change all of
        them later.
      </p>

      <div>
        <label htmlFor="home-area" className="type-subheadline mb-1.5 block font-medium">
          Where do you commute from?
        </label>
        <select
          id="home-area"
          value={areaId}
          onChange={(event) => setAreaId(event.target.value)}
          className="field"
        >
          <option value="">Not now</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
              {area.city ? ` · ${area.city}` : ''}
            </option>
          ))}
        </select>
        <p className="type-footnote mt-1.5 text-[var(--label-secondary)]">
          Not there? You can add a route later — the list comes from students.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="prep-minutes"
          label="Getting ready (min)"
          inputMode="numeric"
          value={String(preparation)}
          onChange={(value) => setPreparation(Number(value) || 0)}
        />
        <Field
          id="arrive-early"
          label="Arrive early by (min)"
          inputMode="numeric"
          value={String(arriveEarly)}
          onChange={(value) => setArriveEarly(Number(value) || 0)}
        />
      </div>

      <Field
        id="gwa-target"
        label="GWA target"
        inputMode="numeric"
        value={target}
        onChange={setTarget}
        placeholder="1.75"
        hint="Optional. We'll warn you when a projection slips below it."
      />

      <Button variant="accent" block onClick={() => void save()} disabled={busy}>
        {busy ? 'Saving…' : 'Continue'}
      </Button>
    </div>
  )
}

/**
 * The install step.
 *
 * On iOS, Web Push only works from a home-screen install, and a student who
 * never installs will simply never hear from the app and conclude it is broken.
 * Saying so here, at the moment it is relevant, is cheaper than explaining it
 * later.
 */
function InstallStep({ onDone }: { onDone: () => Promise<void> }) {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop')
  const [installed, setInstalled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    if (/iPad|iPhone|iPod/.test(ua)) setPlatform('ios')
    else if (/Android/.test(ua)) setPlatform('android')
    setInstalled(window.matchMedia('(display-mode: standalone)').matches)
  }, [])

  const instructions =
    platform === 'ios'
      ? ['Tap the Share button in Safari', 'Choose "Add to Home Screen"', 'Open OneTUP from there']
      : platform === 'android'
        ? ['Tap the menu in Chrome', 'Choose "Add to Home screen"', 'Open OneTUP from there']
        : ['Use the install icon in the address bar', 'Or open OneTUP on your phone']

  return (
    <div className="stack">
      <h1 className="type-title-1">Add it to your home screen</h1>

      {installed ? (
        <p className="type-body">
          You&rsquo;re already installed. Reminders and offline access are on.
        </p>
      ) : (
        <>
          <p className="type-body text-[var(--label-secondary)]">
            {platform === 'ios'
              ? "On iPhone this is what turns on reminders at all — Safari can't send them from a browser tab. It also lets your schedule load without signal."
              : 'This is what turns on reminders and lets your schedule load without signal.'}
          </p>

          <ListGroup>
            {instructions.map((instruction, index) => (
              <ListRow
                key={instruction}
                leading={
                  <span className="type-data grid size-6 place-items-center rounded-full text-[0.75rem]" style={{ background: 'var(--fill-tertiary)' }}>
                    {index + 1}
                  </span>
                }
                title={instruction}
              />
            ))}
          </ListGroup>
        </>
      )}

      <Button
        variant="accent"
        block
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void onDone()
        }}
      >
        {busy ? 'Setting up…' : 'Done — take me in'}
      </Button>
    </div>
  )
}

async function commitSchedule(
  courses: ReviewedCourse[],
  termCode: string,
  source: 'ers_import' | 'paste',
  jobId: string | null,
): Promise<void> {
  const response = await fetch('/api/schedule/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ term_code: termCode, source, job_id: jobId, courses }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'That did not save. Try again.')
  }
}

async function finishOnboarding(): Promise<void> {
  const supabase = supabaseBrowser()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return
  await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', data.user.id)
}
