'use client'

import { DEFAULT_ALLOWED_ABSENCES, DEFAULT_LATES_PER_ABSENCE } from '@onetup/core'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { clearLocalData, readAll } from '@/lib/offline/db'
import { queueWrite } from '@/lib/offline/sync'
import { disablePush, enablePush, pushSupport, type PushSupport } from '@/lib/notifications/client'
import { spring, transition } from '@/design/motion'
import { TimePicker } from '@/components/ui/time-picker'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/auth/auth-form'
import { Sheet } from '@/components/ui/sheet'
import {
  IconAttendance,
  IconBellRinging,
  IconCheck,
  IconCommute,
  IconDocs,
  IconExport,
  IconShield,
  IconSignOut,
  IconWarning,
} from '@/components/ui/icon'
import { InfoTip } from '@/components/ui/info-tip'
import { ProfileBadges, ProfileHero, ProfileStatTiles } from '@/components/profile/profile-hero'
import { useProfileStats } from '@/components/profile/use-profile-stats'
import { ControlRow, LinkRow, SettingsCard, StepperRow, SwitchRow } from './settings-parts'

/**
 * The profile, and the settings under it.
 *
 * The export and delete controls are not a courtesy — they are two of the six
 * published privacy commitments, and putting them behind a support email would
 * make those commitments something a student has to trust rather than something
 * they can exercise.
 *
 * The top half is about the student — who they are, how the term is going,
 * what they have earned. The bottom half is the settings: quiet grey headings
 * over floating white rows, with crimson only on what is switched on.
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
  const stats = useProfileStats()

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
      <h1 className="sr-only">Profile</h1>
      <div className="app-container mx-auto flex max-w-[var(--dashboard-max)] flex-col gap-5 pb-6 pt-4">
        <ProfileHero
          profile={profile}
          termLabel={stats?.termLabel ?? null}
          corner={<SavedFlag saved={saved} />}
        />
        <ProfileStatTiles stats={stats} />
        <ProfileBadges stats={stats} />

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-4">
            <SettingsCard
              Icon={IconBellRinging}
              title="Reminders"
              aside={
                support === 'ready' ? (
                  <Button size="sm" onClick={() => void disablePush()}>
                    Turn off
                  </Button>
                ) : support === 'needs_permission' ? (
                  <Button
                    size="sm"
                    variant="accent"
                    onClick={() => void enablePush()}
                    leading={<IconBellRinging size={18} />}
                  >
                    Turn on
                  </Button>
                ) : null
              }
            >
              <p className="flex items-center gap-2 px-1 text-[0.875rem] text-[var(--label-secondary)]">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: support === 'ready' ? 'var(--accent)' : 'var(--label-quaternary)' }}
                />
                {pushLabel[support]}
              </p>

              <ControlRow label="Quiet from" htmlFor="quiet-start">
                <TimeField
                  id="quiet-start"
                  value={String(preferences?.quiet_hours_start ?? '22:00').slice(0, 5)}
                  onChange={(value) => save({ quiet_hours_start: value })}
                />
              </ControlRow>
              <ControlRow label="Quiet until" htmlFor="quiet-end">
                <TimeField
                  id="quiet-end"
                  value={String(preferences?.quiet_hours_end ?? '06:00').slice(0, 5)}
                  onChange={(value) => save({ quiet_hours_end: value })}
                />
              </ControlRow>
              <p className="flex items-center gap-1.5 px-1 text-[0.8125rem] text-[var(--label-tertiary)]">
                Quiet hours
                <InfoTip title="Quiet hours">
                  Everything is held back except your wake alarm and class suspensions.
                </InfoTip>
              </p>

              {support === 'requires_install' && (
                <p
                  className="type-footnote rounded-[var(--radius-md)] px-3.5 py-3"
                  style={{ background: 'var(--bg)', color: 'var(--label-secondary)' }}
                >
                  On iPhone, Safari can only send reminders once OneTUP is on your home screen.
                  Until then everything still works in the app, and the catch-up list covers
                  anything you missed.
                </p>
              )}

              {support === 'denied' && (
                <p
                  className="type-footnote rounded-[var(--radius-md)] px-3.5 py-3"
                  style={{ background: 'var(--bg)', color: 'var(--label-secondary)' }}
                >
                  Reminders are off because notifications are blocked. You can still see
                  everything in the app, and there&rsquo;s a catch-up list for anything you
                  missed.
                </p>
              )}
            </SettingsCard>

            <SettingsCard
              Icon={IconCommute}
              title="Getting to campus"
              info={
                <InfoTip title="Getting to campus">
                  These feed your wake-up plan: how long you take to get ready, how early you like
                  to arrive, and what to pad the trip for.
                </InfoTip>
              }
            >
              <StepperRow
                id="prep"
                label="Get ready"
                unit="m"
                step={5}
                value={Number(preferences?.preparation_minutes ?? 45)}
                min={0}
                max={240}
                onChange={(value) => save({ preparation_minutes: value })}
              />
              <StepperRow
                id="early"
                label="Arrive early"
                unit="m"
                step={5}
                value={Number(preferences?.arrive_early_minutes ?? 15)}
                min={0}
                max={120}
                onChange={(value) => save({ arrive_early_minutes: value })}
              />
              <SwitchRow
                label="Rush hour"
                hint="Add time for peak traffic"
                on={Boolean(preferences?.apply_peak_adjustment ?? true)}
                onChange={(on) => save({ apply_peak_adjustment: on })}
              />
              <SwitchRow
                label="Rain"
                hint="Add time when rain is likely"
                on={Boolean(preferences?.apply_weather_adjustment ?? true)}
                onChange={(on) => save({ apply_weather_adjustment: on })}
              />
            </SettingsCard>

            <SettingsCard
              Icon={IconAttendance}
              title="Attendance"
              info={
                <InfoTip title="Defaults">
                  The real limit comes from each syllabus. Override it per subject on the subject
                  screen.
                </InfoTip>
              }
            >
              <StepperRow
                id="allowed"
                label="Absences allowed"
                value={Number(preferences?.default_allowed_absences ?? DEFAULT_ALLOWED_ABSENCES)}
                min={0}
                max={40}
                onChange={(value) => save({ default_allowed_absences: value })}
              />
              <StepperRow
                id="lates"
                label="Lates per absence"
                value={Number(preferences?.lates_per_absence ?? DEFAULT_LATES_PER_ABSENCE)}
                min={1}
                max={10}
                onChange={(value) => save({ lates_per_absence: value })}
              />
            </SettingsCard>
          </div>

          <div className="flex flex-col gap-4">
            {/* The guide and the bug form were linked only from the landing
                footer, and the only people who can hit a bug are signed in. */}
            <SettingsCard Icon={IconDocs} title="Help">
              <LinkRow Icon={IconDocs} label="How OneTUP works" href="/docs" />
              <LinkRow Icon={IconWarning} label="Report a problem" href="/report" />
            </SettingsCard>

            <SettingsCard Icon={IconShield} title="Your data">
              <LinkRow
                Icon={IconExport}
                label="Export everything"
                hint="One JSON file"
                onClick={() => void exportData()}
              />
              <LinkRow Icon={IconShield} label="Privacy" href="/privacy" />
              <LinkRow
                Icon={IconWarning}
                label="Delete my account"
                hint="Real deletion, not a flag"
                onClick={() => setConfirmingDelete(true)}
                danger
              />
            </SettingsCard>

            <Link href={'/auth/sign-out' as never} className="glass glass-block">
              <IconSignOut size={18} />
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

function TimeField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <TimePicker
      id={id}
      value={value}
      onChange={(next) => next && onChange(next)}
      className="!min-h-[40px] !w-[9.25rem] !rounded-full !px-3"
    />
  )
}

/** Occupies its space whether or not it is showing, so the title never shifts. */
function SavedFlag({ saved }: { saved: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="type-footnote flex min-h-[var(--target-min)] min-w-[4.5rem] items-center justify-end gap-1.5"
      style={{ color: 'var(--label-secondary)' }}
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
