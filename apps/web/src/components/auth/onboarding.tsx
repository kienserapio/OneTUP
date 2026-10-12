'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import type {
  ParseWarning,
  ParsedCourse,
  ParsedGrade,
  ParsedTerm,
  RawRow,
  UnparsedGradeRow,
} from '@onetup/core'
import { supabaseBrowser } from '@/lib/supabase/client'
import { PasteImporter } from '@/lib/import/paste'
import { saveErsIdentity, type ErsIdentity } from '@/lib/import/identity'
import type { ImportProposal, ReviewedCourse } from '@/lib/import/types'
import { ImportReview } from '@/components/schedule/import-review'
import {
  GradesReview,
  type GradesProposal,
  type TermOption,
} from '@/components/subjects/grades-import'
import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/auth/auth-form'
import {
  IconAlarm,
  IconBellRinging,
  IconCheck,
  IconClipboard,
  IconCommute,
  IconDone,
  IconEye,
  IconGrades,
  IconKey,
  IconLock,
  IconOffline,
  IconPhone,
  IconSchedule,
  IconShield,
  IconTarget,
  IconWarning,
  IconForward,
  IconImport,
} from '@/components/ui/icon'
import { InfoTip } from '@/components/ui/info-tip'
import { Select } from '@/components/ui/select'
import {
  MinuteStepper,
  PointRow,
  StepArt,
  StepDots,
  StepFrame,
} from '@/components/auth/onboarding-parts'
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
 *
 * The ERS sign-in reads two pages, not one, and that is a consequence of the
 * first constraint rather than a feature bolted onto it. Asking for a password
 * is the expensive moment; asking twice — once here, once again later for past
 * grades — spends it twice, and the portal ends the first session when the
 * second login lands. So one set of credentials is used once and the student
 * confirms what came back in two passes: the schedule, then the grades. The
 * second pass is skippable and nothing is written until it is confirmed.
 */

type Step = 'consent' | 'connect' | 'paste' | 'review' | 'grades' | 'setup' | 'install'

const ORDER: Step[] = ['consent', 'connect', 'review', 'setup', 'install']

/** ERS handed back past grades as well, so there genuinely is one more thing to
 * confirm. The bar grows a segment rather than lying about how far along the
 * student is. */
const ORDER_WITH_GRADES: Step[] = ['consent', 'connect', 'review', 'grades', 'setup', 'install']

export interface OnboardingProps {
  studentNumber: string
  emailVerified: boolean
  areas: { id: string; name: string; city: string | null }[]
  termCode: string
  termLabel: string
  /** Every semester on file. The grades review has to offer a real one for each
   * group ERS printed, and a select that populates late is a select the student
   * has already scrolled past. */
  terms: TermOption[]
}

export function Onboarding({
  studentNumber,
  emailVerified,
  areas,
  termCode,
  termLabel,
  terms,
}: OnboardingProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('consent')
  const [proposal, setProposal] = useState<ImportProposal | null>(null)
  const [grades, setGrades] = useState<GradesProposal | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [importSource, setImportSource] = useState<'ers_import' | 'paste'>('ers_import')

  const order = grades ? ORDER_WITH_GRADES : ORDER
  const position = Math.max(0, order.indexOf(step === 'paste' ? 'connect' : step))

  /* Forward slides in from the right, back from the left — so going back
   * feels like going back. */
  const [lastPosition, setLastPosition] = useState(position)
  const [direction, setDirection] = useState(1)
  if (position !== lastPosition) {
    setDirection(position > lastPosition ? 1 : -1)
    setLastPosition(position)
  }

  /* The two review steps are tables a student checks row by row; they get a
   * wider card and no picture. Every other step is the narrow, centred one. */
  const wide = step === 'review' || step === 'grades'

  return (
    <div className="min-h-dvh sm:grid sm:place-items-center sm:p-6">
      <motion.div
        layout
        transition={transition(spring.ui)}
        className="flex min-h-dvh w-full flex-col overflow-hidden bg-white sm:min-h-0 sm:rounded-[32px]"
        style={{
          maxWidth: wide ? '46rem' : '28rem',
          boxShadow: 'var(--shadow-pop)',
        }}
      >
        <header className="flex items-center justify-between px-5 pb-2 pt-[calc(env(safe-area-inset-top)+18px)] sm:px-8 sm:pt-7">
          <StepDots current={position} total={order.length} />
          <span className="text-[0.75rem] font-semibold tabular-nums text-[var(--label-tertiary)]">
            {position + 1} / {order.length}
          </span>
        </header>

        <main id="main" className="relative flex flex-1 flex-col">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={{
                enter: (dir: number) => ({ opacity: 0, x: 40 * dir }),
                center: { opacity: 1, x: 0 },
                exit: (dir: number) => ({ opacity: 0, x: -40 * dir }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition(spring.ui)}
              className={wide ? 'flex flex-1 flex-col px-5 pb-8 pt-2 sm:px-8' : 'flex flex-1 flex-col'}
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
                  termLabel={termLabel}
                  onImported={(schedule, pastGrades, job) => {
                    setProposal(schedule)
                    setGrades(pastGrades)
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
                    // A paste is a schedule and only a schedule. Anything an
                    // earlier ERS attempt left behind would otherwise reappear
                    // two steps later as grades this import never read.
                    setGrades(null)
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
                    /* The schedule is in. Past grades are a second, separate
                     * confirmation and only when there is something to confirm —
                     * a student whose grades page came back empty, or would not
                     * come at all, simply never sees this step. */
                    setStep(grades ? 'grades' : 'setup')
                  }}
                />
              )}

              {step === 'grades' && grades && (
                <GradesReview
                  proposal={grades}
                  terms={terms}
                  currentTermCode={termCode || null}
                  heading="And your past grades"
                  cancelLabel="Skip for now"
                  onCancel={() => setStep('setup')}
                  onSaved={() => setStep('setup')}
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
        </main>
      </motion.div>
    </div>
  )
}

/**
 * The consent screen.
 *
 * Three short promises up front, the content spec's five points verbatim one
 * tap away under "Exactly what happens", and the sentence admitting the
 * residual risk left on screen in full — stated rather than buried, because a
 * student cannot consent to something they were not told.
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
    <StepFrame
      art={<StepArt tone="blue" Icon={IconShield} satellites={[IconLock, IconKey, IconEye]} />}
      title="Bring in your ERS"
      subtitle="One sign-in reads your schedule and past grades. Or paste it — everything else works the same."
      actions={
        <>
          {!emailVerified && (
            <FormError>Verify your email first — check your inbox. ERS stays locked until you do.</FormError>
          )}
          <Button
            variant="accent"
            size="lg"
            block
            onClick={onConnect}
            disabled={!emailVerified}
            leading={<IconKey size={20} />}
          >
            Connect ERS
          </Button>
          <Button size="lg" block onClick={onPaste}>
            Paste it instead
          </Button>
          <Button variant="plain" block onClick={onSkip}>
            Skip for now
          </Button>
        </>
      }
    >
      <PointRow Icon={IconLock} tone="blue" title="Used once, never stored" />
      <PointRow Icon={IconEye} tone="gray" title="You check it before it saves" />
      <PointRow Icon={IconShield} tone="green" title="Read-only — ERS stays untouched" />

      {/* Stated, not buried: a student cannot consent to what they were not told. */}
      <p
        className="flex gap-2.5 rounded-[18px] p-3.5 text-left text-[0.8125rem] leading-snug"
        style={{ background: 'var(--tone-crimson-tint)', color: 'var(--tone-crimson-ink)' }}
      >
        <IconWarning size={18} className="mt-px shrink-0" />
        <span>
          Being straight with you: your password does pass through our server while this happens,
          and exists in memory for a few seconds. We don&rsquo;t keep it, but it isn&rsquo;t zero
          risk.
        </span>
      </p>

      <details className="group rounded-[18px] p-3.5 text-left" style={{ background: 'var(--surface-sunken)' }}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-[0.875rem] font-semibold">
          Exactly what happens
          <span aria-hidden className="text-[var(--label-tertiary)] transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <ul className="mt-3 flex flex-col gap-2.5">
          {[
            'Your student number, ERS password, and birthdate are sent over an encrypted connection.',
            "They're used to sign in once, read those two pages, and then discarded.",
            'Your schedule is saved. Your password is not — there’s nowhere in OneTUP that stores it.',
            'You see both before anything is saved, and past grades are yours to skip.',
            'Nothing in your ERS account is changed or submitted, and no other page is opened.',
          ].map((point) => (
            <li key={point} className="flex gap-2 text-[0.8125rem] leading-snug text-[var(--label-secondary)]">
              <IconCheck size={16} className="mt-px shrink-0" style={{ color: 'var(--ok)' }} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </details>
    </StepFrame>
  )
}

/**
 * What the response to one sign-in looks like.
 *
 * Written out rather than left as whatever `response.json()` hands back, because
 * every field below is optional on purpose: the grades half is allowed to come
 * back missing, and a shape that admits that is the only one that makes the
 * next thirty lines read honestly.
 */
interface ImportAllResponse {
  job_id?: string | null
  schedule?: {
    parser_version?: string
    courses?: ParsedCourse[]
    unparsed?: RawRow[]
    warnings?: ParseWarning[]
    identity?: ErsIdentity | null
  } | null
  grades?: {
    parser_version?: string
    courses?: ParsedGrade[]
    unparsed?: UnparsedGradeRow[]
    warnings?: string[]
    terms?: ParsedTerm[]
    debug?: GradesProposal['debug']
  } | null
  error?: { message?: string }
}

function ConnectStep({
  studentNumber,
  termLabel,
  onImported,
  onPaste,
  onBack,
}: {
  studentNumber: string
  termLabel: string
  onImported: (
    schedule: ImportProposal,
    grades: GradesProposal | null,
    jobId: string | null,
  ) => void
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
      const response = await fetch('/api/ers/import-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_number: number.trim(), password, birthdate }),
      })

      const body = (await response.json()) as ImportAllResponse

      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not work. Try again, or paste your schedule.')
        return
      }

      // ERS knows the student's real name and program; the sign-up form only
      // knows what they typed. Saving it here means announcements and class-rep
      // verification have something true to work with.
      await saveErsIdentity(body.schedule?.identity)

      const pastGrades = body.grades?.courses?.length
        ? {
            parserVersion: body.grades.parser_version ?? 'unknown',
            courses: body.grades.courses,
            unparsed: body.grades.unparsed ?? [],
            warnings: body.grades.warnings ?? [],
            terms: body.grades.terms ?? [],
            debug: body.grades.debug ?? null,
          }
        : null

      onImported(
        {
          parserVersion: body.schedule?.parser_version ?? 'unknown',
          courses: body.schedule?.courses ?? [],
          unparsed: body.schedule?.unparsed ?? [],
          warnings: body.schedule?.warnings ?? [],
        },
        /* Null covers three different disappointments — the page would not load,
         * it loaded and said nothing, or it said something we could not read —
         * and onboarding treats all three the same way, by carrying on. The
         * student can import grades later from the GWA screen, where the failure
         * can be looked at properly. */
        pastGrades,
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
    <StepFrame
      onSubmit={submit}
      art={<StepArt tone="gray" Icon={IconKey} satellites={[IconSchedule, IconGrades, IconLock]} />}
      title="Connect ERS"
      subtitle={termLabel ? `Your ${termLabel} schedule and past grades, in one sign-in.` : 'Your schedule and past grades, in one sign-in.'}
      info={
        <InfoTip title="What gets read">
          Two ERS pages: this term&rsquo;s schedule and your finished semesters. You check both
          before anything is saved.
        </InfoTip>
      }
      actions={
        <>
          <Button
            type="submit"
            variant="accent"
            size="lg"
            block
            disabled={busy}
            leading={<IconImport size={20} />}
          >
            {busy ? 'Reading your record…' : 'Read my ERS record'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onBack} disabled={busy}>
              Back
            </Button>
            <Button onClick={onPaste} disabled={busy}>
              Paste instead
            </Button>
          </div>
        </>
      }
    >
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
        hint="Has to match your ERS record exactly."
      />
    </StepFrame>
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
    <StepFrame
      art={<StepArt tone="crimson" Icon={IconClipboard} satellites={[IconSchedule, IconCheck, IconDone]} />}
      title="Paste your schedule"
      subtitle="Copy the table from ERS and drop it here."
      info={
        <InfoTip title="How to copy it">
          Open your schedule in ERS, select the whole table, copy it, and paste it here. No password
          needed.
        </InfoTip>
      }
      actions={
        <>
          <Button
            variant="accent"
            size="lg"
            block
            onClick={() => void parse()}
            disabled={busy || !text.trim()}
            leading={<IconClipboard size={20} />}
          >
            {busy ? 'Reading…' : 'Read it'}
          </Button>
          <Button variant="plain" block onClick={onBack}>
            Back
          </Button>
        </>
      }
    >
      {error && <FormError>{error}</FormError>}

      <label htmlFor="paste-area" className="sr-only">
        Your ERS schedule
      </label>
      <textarea
        id="paste-area"
        rows={7}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste here"
        className="field type-data font-mono text-[0.9375rem]"
      />
    </StepFrame>
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
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    // A session can lapse while a student reads four steps of onboarding. This
    // used to stop the spinner and do nothing, which reads as a dead button.
    if (!userId) {
      setError('You were signed out while setting up. Sign in again to pick up where you left off.')
      setBusy(false)
      return
    }

    const { error: saveError } = await supabase.from('user_preferences').upsert({
      user_id: userId,
      home_area_id: areaId || null,
      preparation_minutes: preparation,
      arrive_early_minutes: arriveEarly,
    })
    if (saveError) {
      setError('Those settings did not save. Check your connection and try again.')
      setBusy(false)
      return
    }

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
    <StepFrame
      art={<StepArt tone="green" Icon={IconCommute} satellites={[IconAlarm, IconTarget, IconSchedule]} />}
      title="A few settings"
      subtitle="For wake-up times and GWA warnings. All changeable later."
      actions={
        <>
          {error && <FormError>{error}</FormError>}
          <Button
            variant="accent"
            size="lg"
            block
            onClick={() => void save()}
            disabled={busy}
            trailing={<IconForward size={20} />}
          >
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </>
      }
    >
      <div>
        <label
          htmlFor="home-area"
          className="mb-1.5 flex items-center gap-1.5 text-[0.875rem] font-semibold"
        >
          Where you commute from
          <InfoTip title="Not on the list?">
            The list comes from students. Pick &ldquo;Not now&rdquo; and add your route later from
            Commute.
          </InfoTip>
        </label>
        <Select
          id="home-area"
          value={areaId}
          onChange={setAreaId}
          label="Where you commute from"
          options={[
            { value: '', label: 'Not now' },
            ...areas.map((area) => ({
              value: area.id,
              label: area.name,
              description: area.city ?? undefined,
            })),
          ]}
        />
      </div>

      <MinuteStepper
        id="prep-minutes"
        label="Get ready"
        Icon={IconAlarm}
        tone="crimson"
        value={preparation}
        onChange={setPreparation}
        info={
          <InfoTip title="Get ready">
            From your alarm to walking out the door. Used to work out when to wake you.
          </InfoTip>
        }
      />
      <MinuteStepper
        id="arrive-early"
        label="Arrive early"
        Icon={IconSchedule}
        tone="gray"
        value={arriveEarly}
        onChange={setArriveEarly}
        max={60}
        info={
          <InfoTip title="Arrive early">
            How long before class you like to be there. Leave times include it.
          </InfoTip>
        }
      />

      <Field
        id="gwa-target"
        label="GWA target (optional)"
        inputMode="numeric"
        value={target}
        onChange={setTarget}
        placeholder="1.75"
        hint="We'll warn you when a projection slips below it."
      />
    </StepFrame>
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
  const [error, setError] = useState<string | null>(null)

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
    <StepFrame
      art={
        <StepArt tone="crimson" Icon={IconPhone} satellites={[IconBellRinging, IconOffline, IconDone]} />
      }
      title={installed ? "You're installed" : 'Add to home screen'}
      subtitle={
        installed
          ? 'Reminders and offline access are on.'
          : 'Turns on reminders and lets your schedule load without signal.'
      }
      info={
        platform === 'ios' && !installed ? (
          <InfoTip title="Why on iPhone">
            Safari can&rsquo;t send reminders from a browser tab. Installing is what turns them on.
          </InfoTip>
        ) : undefined
      }
      actions={
        <>
          {error && <FormError>{error}</FormError>}
          <Button
            variant="accent"
            size="lg"
            block
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setError(null)
              onDone().catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : 'That did not save. Try again.')
                setBusy(false)
              })
            }}
            trailing={<IconForward size={20} />}
          >
            {busy ? 'Setting up…' : error ? 'Try again' : 'Done — take me in'}
          </Button>
        </>
      }
    >
      {!installed && (
        <ol className="flex flex-col gap-3">
          {instructions.map((instruction, index) => (
            <li key={instruction} className="flex items-center gap-3 text-left">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full text-[0.875rem] font-bold"
                style={{ background: 'var(--tone-crimson-tint)', color: 'var(--tone-crimson-ink)' }}
              >
                {index + 1}
              </span>
              <span className="text-[0.9375rem] font-medium">{instruction}</span>
            </li>
          ))}
        </ol>
      )}
    </StepFrame>
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

/**
 * The write that ends onboarding, and the one whose failure costs the most.
 *
 * If `onboarded_at` stays null the app layout sends the student back to
 * `/welcome` at step 1, with a schedule already committed that they would then
 * import a second time. So a failure throws, and the install step keeps them
 * where they are with a retry, rather than pushing them into that redirect.
 */
async function finishOnboarding(): Promise<void> {
  const supabase = supabaseBrowser()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    throw new Error('You were signed out while setting up. Sign in again to finish.')
  }
  const { error } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', data.user.id)
  if (error) throw new Error('That did not save. Check your connection and try again.')
}
