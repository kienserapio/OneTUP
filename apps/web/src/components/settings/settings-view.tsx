'use client'

import { DEFAULT_ALLOWED_ABSENCES, DEFAULT_LATES_PER_ABSENCE } from '@onetup/core'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { clearLocalData, readAll } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { disablePush, enablePush, pushSupport, type PushSupport } from '@/lib/notifications/client'
import { displayName } from '@/lib/name'
import { spring, transition } from '@/design/motion'
import { NavBar } from '@/components/app/nav-bar'
import { Button } from '@/components/ui/button'
import { Card, ListGroup, ListRow, SectionHeader } from '@/components/ui/surfaces'
import { Field } from '@/components/auth/auth-form'
import { Sheet } from '@/components/ui/sheet'
import { IconCheck } from '@/components/ui/icon'

/**
 * Settings.
 *
 * The export and delete controls are not a courtesy — they are two of the six
 * published privacy commitments, and putting them behind a support email would
 * make those commitments something a student has to trust rather than something
 * they can exercise.
 */

export interface SettingsProfile {
  fullName: string | null
  studentNumber: string | null
  programCode: string | null
  yearLevel: number | null
  sectionLabel: string | null
  campus: string | null
  email: string | null
}

type Preferences = Record<string, unknown>

const SAVE_DEBOUNCE_MS = 450

export function SettingsView({ profile }: { profile: SettingsProfile }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [support, setSupport] = useState<PushSupport>('unsupported')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteWord, setDeleteWord] = useState('')

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Preferences>({})
  // A debounced write fires after the render that scheduled it, so the optimistic
  // record has to be built from the latest values rather than a captured copy.
  const latest = useRef<Preferences | null>(null)

  useEffect(() => {
    setSupport(pushSupport())

    void (async () => {
      // Local first: preferences are in the offline set, so the controls come up
      // with the student's real values even with no network.
      const cached = await readAll<{ id: string; user_id?: string }>('user_preferences')
      if (cached[0]) setPreferences(cached[0] as Preferences)

      const supabase = supabaseBrowser()
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) return
      setUserId(user.user.id)

      const { data } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.user.id)
        .maybeSingle()
      if (data) setPreferences(data as Preferences)
    })()
  }, [])

  const flushSave = useCallback(async () => {
    const patch = pending.current
    pending.current = {}
    if (!userId || Object.keys(patch).length === 0) return

    await queueWrite({
      entity: 'user_preferences',
      // An upsert, not an update: the sync engine's update path keys on `id`,
      // and this table is keyed on `user_id`. Upserting on the primary key both
      // creates the row for a student who has never touched a setting and
      // merges the changed columns for everyone else.
      operation: 'insert',
      payload: { user_id: userId, ...patch },
      optimistic: { ...(latest.current ?? {}), ...patch, id: userId, user_id: userId },
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [userId])

  const save = useCallback(
    (patch: Preferences) => {
      setPreferences((prev) => ({ ...(prev ?? {}), ...patch }))
      pending.current = { ...pending.current, ...patch }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS)
    },
    [flushSave],
  )

  useEffect(() => {
    latest.current = preferences
  }, [preferences])

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )

  async function exportData() {
    const supabase = supabaseBrowser()
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const tables = [
      'profiles',
      'user_preferences',
      'user_thresholds',
      'enrollments',
      'schedule_blocks',
      'attendance_records',
      'grades',
      'grade_components',
      'deadlines',
      'deadline_subtasks',
      'departure_plans',
    ] as const

    const bundle: Record<string, unknown> = { exported_at: new Date().toISOString() }
    for (const table of tables) {
      const { data } = await supabase.from(table).select('*')
      bundle[table] = data ?? []
    }

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `onetup-export-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function deleteAccount() {
    setBusy(true)
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: deleteWord }),
    })
    setBusy(false)
    if (!response.ok) return

    // Nothing to sign out of any more, but the local store still holds a copy
    // of everything that was just deleted server-side.
    await clearLocalData()
    await supabaseBrowser().auth.signOut()
    /* A hard navigation on purpose, not an oversight. `router.push` keeps the
     * React tree, the Supabase client and every cached query belonging to an
     * account that no longer exists. After a deletion the only safe next state
     * is a fresh document. */
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/'
  }

  // The state of the thing, not a second copy of the button beside it.
  const pushLabel: Record<PushSupport, string> = {
    ready: 'On — deadline and departure reminders will reach you',
    needs_permission: 'Off — nothing will reach you until you turn this on',
    denied: 'Blocked in your browser settings',
    requires_install: 'Add OneTUP to your home screen first',
    unsupported: 'Not available on this browser',
  }

  return (
    <>
      <NavBar title="Settings" trailing={<SavedFlag saved={saved} />} />

      <div className="app-container pb-6">
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-4">
            <section>
              <SectionHeader>Profile</SectionHeader>
              <Card className="flex flex-col gap-2">
                {/* ERS hands back "SERAPIO, KIEN LERISS RAMOS". The sidebar
                    already reads it back as a name; this has to agree. */}
                <p className="type-title-3">
                  {profile.fullName ? displayName(profile.fullName) : 'Your account'}
                </p>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <Detail label="Student number" value={profile.studentNumber} data />
                  <Detail label="Program" value={profile.programCode} data />
                  <Detail
                    label="Year and section"
                    value={
                      [
                        profile.yearLevel ? `${profile.yearLevel}${ordinal(profile.yearLevel)} year` : null,
                        profile.sectionLabel,
                      ]
                        .filter(Boolean)
                        .join(' · ') || null
                    }
                  />
                  <Detail label="Campus" value={titleCase(profile.campus)} />
                </dl>

                {profile.email && (
                  <p className="type-footnote text-[var(--label-secondary)]">
                    Signed in as {profile.email}
                  </p>
                )}
              </Card>
            </section>

            <section>
              <SectionHeader>Getting to campus</SectionHeader>
              <Card className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    id="prep"
                    label="Getting ready (min)"
                    value={Number(preferences?.preparation_minutes ?? 45)}
                    min={0}
                    max={240}
                    onCommit={(value) => save({ preparation_minutes: value })}
                  />
                  <NumberField
                    id="early"
                    label="Arrive early by (min)"
                    value={Number(preferences?.arrive_early_minutes ?? 15)}
                    min={0}
                    max={120}
                    onCommit={(value) => save({ arrive_early_minutes: value })}
                  />
                </div>

                <Toggle
                  label="Add time for rush hour"
                  hint="Peak-hour traffic on your saved route"
                  on={Boolean(preferences?.apply_peak_adjustment ?? true)}
                  onChange={(on) => save({ apply_peak_adjustment: on })}
                />
                <Toggle
                  label="Add time when rain is forecast"
                  hint="Only when the chance of rain is high"
                  on={Boolean(preferences?.apply_weather_adjustment ?? true)}
                  onChange={(on) => save({ apply_weather_adjustment: on })}
                />
              </Card>
            </section>

            <section>
              <SectionHeader>Attendance</SectionHeader>
              <Card className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    id="allowed"
                    label="Absences allowed"
                    value={Number(preferences?.default_allowed_absences ?? DEFAULT_ALLOWED_ABSENCES)}
                    min={0}
                    max={40}
                    onCommit={(value) => save({ default_allowed_absences: value })}
                  />
                  <NumberField
                    id="lates"
                    label="Lates per absence"
                    value={Number(preferences?.lates_per_absence ?? DEFAULT_LATES_PER_ABSENCE)}
                    min={1}
                    max={10}
                    onCommit={(value) => save({ lates_per_absence: value })}
                  />
                </div>
                <p className="type-footnote text-[var(--label-secondary)]">
                  The real limit comes from each syllabus. Override it per subject on the subject
                  screen.
                </p>
              </Card>
            </section>
          </div>

          <div className="flex flex-col gap-4">
            <section>
              <SectionHeader>Reminders</SectionHeader>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="type-body">Notifications</p>
                    <p className="type-footnote text-[var(--label-secondary)]">
                      {pushLabel[support]}
                    </p>
                  </div>
                  {support === 'ready' ? (
                    <Button variant="plain" className="!px-3" onClick={() => void disablePush()}>
                      <span className="type-subheadline font-medium">Turn off</span>
                    </Button>
                  ) : support === 'needs_permission' ? (
                    <Button className="!px-4" onClick={() => void enablePush()}>
                      <span className="type-subheadline font-semibold">Turn on</span>
                    </Button>
                  ) : null}
                </div>

                <div className="border-t pt-3" style={{ borderColor: 'var(--separator-soft)' }}>
                  <p className="type-body">Quiet hours</p>
                  <p className="type-footnote text-[var(--label-secondary)]">
                    Everything except your wake alarm and class suspensions
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-3">
                    <TimeField
                      id="quiet-start"
                      label="From"
                      value={String(preferences?.quiet_hours_start ?? '22:00').slice(0, 5)}
                      onChange={(value) => save({ quiet_hours_start: value })}
                    />
                    <TimeField
                      id="quiet-end"
                      label="Until"
                      value={String(preferences?.quiet_hours_end ?? '06:00').slice(0, 5)}
                      onChange={(value) => save({ quiet_hours_end: value })}
                    />
                  </div>
                </div>

                {support === 'requires_install' && (
                  <p
                    className="type-footnote rounded-[var(--radius-sm)] px-3 py-2.5 text-[var(--label-secondary)]"
                    style={{ background: 'var(--fill-quaternary)' }}
                  >
                    On iPhone, Safari can only send reminders once OneTUP is on your home screen.
                    Until then everything still works in the app, and the catch-up list covers
                    anything you missed.
                  </p>
                )}

                {support === 'denied' && (
                  <p
                    className="type-footnote rounded-[var(--radius-sm)] px-3 py-2.5 text-[var(--label-secondary)]"
                    style={{ background: 'var(--fill-quaternary)' }}
                  >
                    Reminders are off because notifications are blocked. You can still see
                    everything in the app, and there&rsquo;s a catch-up list for anything you
                    missed.
                  </p>
                )}
              </Card>
            </section>

            <section>
              <SectionHeader>Your data</SectionHeader>
              <ListGroup>
                <ListRow
                  title="Export everything"
                  subtitle="One JSON file with every row we hold about you"
                  onClick={() => void exportData()}
                />
                <ListRow title="Privacy" subtitle="What we do and don't do" href="/privacy" />
                <ListRow
                  title="Delete my account"
                  subtitle="Real deletion, not a flag"
                  onClick={() => setConfirmingDelete(true)}
                />
              </ListGroup>
            </section>

            <Link href={'/auth/sign-out' as never} className="glass glass-plain glass-block">
              Sign out
            </Link>
          </div>
        </div>
      </div>

      <Sheet
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete your account"
        footer={
          <Button
            variant="destructive"
            block
            disabled={deleteWord !== 'DELETE' || busy}
            onClick={() => void deleteAccount()}
          >
            {busy ? 'Deleting…' : 'Delete everything'}
          </Button>
        }
      >
        <div className="stack">
          <p className="type-body">
            This removes your schedule, attendance, grades, deadlines and everything else you have
            entered. It is not recoverable, and it is not a flag — the rows are gone.
          </p>
          <p className="type-body text-[var(--label-secondary)]">
            Export your data first if you want to keep a copy.
          </p>
          <Field
            id="confirm-delete"
            label="Type DELETE to confirm"
            value={deleteWord}
            onChange={setDeleteWord}
            spellCheck={false}
          />
        </div>
      </Sheet>
    </>
  )
}

function Detail({
  label,
  value,
  data,
}: {
  label: string
  value: string | null
  data?: boolean
}) {
  return (
    <div>
      <dt className="type-caption-2 uppercase tracking-[0.06em] text-[var(--label-tertiary)]">
        {label}
      </dt>
      <dd className={data ? 'type-data type-subheadline' : 'type-subheadline'}>
        {value ?? <span className="text-[var(--label-tertiary)]">Not set</span>}
      </dd>
    </div>
  )
}

/**
 * Holds the typed text rather than the parsed number, so clearing the box to
 * retype does not snap it to zero under the student's cursor.
 */
function NumberField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  const [raw, setRaw] = useState(String(value))

  useEffect(() => {
    setRaw(String(value))
  }, [value])

  return (
    <div>
      <label htmlFor={id} className="type-subheadline mb-1.5 block font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={raw}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d]/g, '')
          setRaw(next)
          if (next === '') return
          onCommit(Math.min(max, Math.max(min, Number(next))))
        }}
        onBlur={() => {
          if (raw === '') setRaw(String(value))
        }}
        className="field type-data"
      />
    </div>
  )
}

function TimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="type-footnote mb-1 block text-[var(--label-secondary)]">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="field type-data"
      />
    </div>
  )
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string
  hint?: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-[var(--target-min)] w-full items-center justify-between gap-3 text-left"
    >
      <span className="min-w-0">
        <span className="type-body block">{label}</span>
        {hint && (
          <span className="type-footnote block text-[var(--label-secondary)]">{hint}</span>
        )}
      </span>
      <span
        aria-hidden
        className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors"
        style={{ background: on ? 'var(--ok)' : 'var(--fill)' }}
      >
        <span
          className="absolute top-[2px] size-[27px] rounded-full transition-transform"
          style={{
            background: 'var(--bg-grouped-secondary)',
            boxShadow: 'var(--shadow-chip)',
            transform: `translateX(${on ? 22 : 2}px)`,
          }}
        />
      </span>
    </button>
  )
}

/** Occupies its space whether or not it is showing, so the title never shifts. */
function SavedFlag({ saved }: { saved: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="type-footnote flex min-h-[var(--target-min)] min-w-[4.5rem] items-center justify-end gap-1.5"
      style={{ color: 'var(--ok)' }}
    >
      <AnimatePresence>
        {saved && (
          <motion.span
            className="inline-flex items-center gap-1.5"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={transition(spring.snap)}
          >
            <IconCheck size={15} />
            Saved
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}

function titleCase(value: string | null): string | null {
  if (!value) return null
  return value.charAt(0).toUpperCase() + value.slice(1)
}
