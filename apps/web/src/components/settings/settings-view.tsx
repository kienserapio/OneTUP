'use client'

import { DEFAULT_ALLOWED_ABSENCES, DEFAULT_LATES_PER_ABSENCE } from '@onetup/core'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'
import { clearLocalData } from '@/lib/offline/db'
import { disablePush, enablePush, pushSupport, type PushSupport } from '@/lib/notifications/client'
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
export function SettingsView() {
  const [preferences, setPreferences] = useState<Record<string, unknown> | null>(null)
  const [support, setSupport] = useState<PushSupport>('unsupported')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteWord, setDeleteWord] = useState('')

  useEffect(() => {
    setSupport(pushSupport())
    void (async () => {
      const supabase = supabaseBrowser()
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) return
      const { data } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.user.id)
        .maybeSingle()
      setPreferences(data as Record<string, unknown> | null)
    })()
  }, [])

  async function save(patch: Record<string, unknown>) {
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return

    setBusy(true)
    await supabase
      .from('user_preferences')
      .update(patch as never)
      .eq('user_id', data.user.id)
    setPreferences((prev) => ({ ...(prev ?? {}), ...patch }))
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

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
    window.location.href = '/'
  }

  const pushLabel: Record<PushSupport, string> = {
    ready: 'On',
    needs_permission: 'Turn on',
    denied: 'Blocked in your browser settings',
    requires_install: 'Add OneTUP to your home screen first',
    unsupported: 'Not available on this browser',
  }

  return (
    <>
      <NavBar title="Settings" />

      <div className="app-container stack">
        <section>
          <SectionHeader>Getting to campus</SectionHeader>
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                id="prep"
                label="Getting ready (min)"
                inputMode="numeric"
                value={String(preferences?.preparation_minutes ?? 45)}
                onChange={(value) => save({ preparation_minutes: Number(value) || 0 })}
              />
              <Field
                id="early"
                label="Arrive early by (min)"
                inputMode="numeric"
                value={String(preferences?.arrive_early_minutes ?? 15)}
                onChange={(value) => save({ arrive_early_minutes: Number(value) || 0 })}
              />
            </div>

            <Toggle
              label="Add time for rush hour"
              on={Boolean(preferences?.apply_peak_adjustment ?? true)}
              onChange={(on) => save({ apply_peak_adjustment: on })}
            />
            <Toggle
              label="Add time when rain is forecast"
              on={Boolean(preferences?.apply_weather_adjustment ?? true)}
              onChange={(on) => save({ apply_weather_adjustment: on })}
            />
          </Card>
        </section>

        <section>
          <SectionHeader>Attendance</SectionHeader>
          <Card className="grid grid-cols-2 gap-3">
            <Field
              id="allowed"
              label="Absences allowed"
              inputMode="numeric"
              value={String(preferences?.default_allowed_absences ?? DEFAULT_ALLOWED_ABSENCES)}
              onChange={(value) => save({ default_allowed_absences: Number(value) || 0 })}
            />
            <Field
              id="lates"
              label="Lates per absence"
              inputMode="numeric"
              value={String(preferences?.lates_per_absence ?? DEFAULT_LATES_PER_ABSENCE)}
              onChange={(value) => save({ lates_per_absence: Number(value) || 1 })}
            />
          </Card>
          <p className="type-footnote mt-2 px-1 text-[var(--label-secondary)]">
            The real limit comes from each syllabus. Override it per subject on the subject screen.
          </p>
        </section>

        <section>
          <SectionHeader>Reminders</SectionHeader>
          <ListGroup>
            <ListRow
              title="Notifications"
              subtitle={pushLabel[support]}
              trailing={
                support === 'ready' ? (
                  <Button size="sm" variant="plain" onClick={() => void disablePush()}>
                    Turn off
                  </Button>
                ) : support === 'needs_permission' ? (
                  <Button size="sm" onClick={() => void enablePush()}>
                    Turn on
                  </Button>
                ) : undefined
              }
            />
            <ListRow
              title="Quiet hours"
              subtitle="Everything except your wake alarm and class suspensions"
              trailing={
                <span className="type-data type-footnote text-[var(--label-secondary)]">
                  {String(preferences?.quiet_hours_start ?? '22:00').slice(0, 5)}–
                  {String(preferences?.quiet_hours_end ?? '06:00').slice(0, 5)}
                </span>
              }
            />
          </ListGroup>

          {support === 'requires_install' && (
            <Card className="mt-2">
              <p className="type-footnote text-[var(--label-secondary)]">
                On iPhone, Safari can only send reminders once OneTUP is on your home screen. Until
                then everything still works in the app, and the catch-up list covers anything you
                missed.
              </p>
            </Card>
          )}
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

        <div className="pt-2">
          <Link href="/auth/sign-out" className="glass glass-plain glass-block">
            Sign out
          </Link>
        </div>

        {saved && (
          <p className="type-footnote flex items-center justify-center gap-1.5 text-[var(--ok)]">
            <IconCheck size={15} />
            Saved
          </p>
        )}
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

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string
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
      <span className="type-body">{label}</span>
      <span
        aria-hidden
        className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200"
        style={{ background: on ? 'var(--ok)' : 'var(--fill)' }}
      >
        <span
          className="absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: `translateX(${on ? 22 : 2}px)` }}
        />
      </span>
    </button>
  )
}
