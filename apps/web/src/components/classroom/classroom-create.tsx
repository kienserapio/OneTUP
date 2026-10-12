'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CAMPUSES,
  CAMPUS_LABEL,
  campusOf,
  parseSectionCode,
  parseSectionParts,
  type Campus,
} from '@onetup/core'
import { supabaseBrowser } from '@/lib/supabase/client'
import { syncNow } from '@/lib/offline/sync'
import { NavBar } from '@/components/app/nav-bar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/surfaces'
import { Field, FormError } from '@/components/auth/auth-form'
import { IconClassroom, IconWarning, IconJoin, IconPlus } from '@/components/ui/icon'
import { IconTile } from '@/components/ui/icon-tile'
import { InfoTip } from '@/components/ui/info-tip'
import { Select } from '@/components/ui/select'

/**
 * Starting a classroom.
 *
 * The canonical code is echoed under the fields as they are typed, so `bscs 4b`
 * visibly becomes `BSCS-4B-M` before anyone commits to it. That is the whole
 * defence against four spellings becoming four classrooms, and it works because
 * the student sees the transformation rather than being told about it.
 *
 * A campus that disagrees with the profile warns and does not block. Students
 * do transfer, and a warning that refuses to be overridden is a bug report
 * waiting to be filed.
 */

export function ClassroomCreate() {
  const router = useRouter()

  const [program, setProgram] = useState('')
  const [year, setYear] = useState('')
  const [block, setBlock] = useState('')
  const [campus, setCampus] = useState<Campus>('M')
  const [profileCampus, setProfileCampus] = useState<Campus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offer, setOffer] = useState<{
    id: string
    section_code: string | null
    member_count: number
    rep_name: string | null
  } | null>(null)

  useEffect(() => {
    void (async () => {
      const supabase = supabaseBrowser()
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('program_code, year_level, section_label, campus')
        .eq('id', user.user.id)
        .maybeSingle()

      /* Lenient on the way in: a stored `BSCS 4-B` has no campus letter, and
       * asking a student to retype a section the app already knows because of
       * a character it never collected is the wrong end of the trade. */
      const fromProfile = profile?.section_label ? parseSectionParts(profile.section_label) : null
      const home = campusOf(profile?.campus)

      setProgram(fromProfile?.program ?? profile?.program_code ?? '')
      setYear(String(fromProfile?.year ?? profile?.year_level ?? ''))
      setBlock(fromProfile?.block ?? '')
      setProfileCampus(home)
      setCampus(fromProfile?.campus ?? home ?? 'M')
    })()
  }, [])

  const parsed = useMemo(
    () => parseSectionCode(`${program}-${year}${block}-${campus}`),
    [program, year, block, campus],
  )

  const campusMismatch = profileCampus !== null && parsed !== null && parsed.campus !== profileCampus

  async function create() {
    if (!parsed) return
    setBusy(true)
    setError(null)
    setOffer(null)

    try {
      const response = await fetch('/api/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: parsed.canonical }),
      })

      const body = (await response.json()) as {
        classroom?: { id: string } | null
        existing?: {
          id: string
          section_code: string | null
          member_count: number
          rep_name: string | null
        }
        error?: { message: string }
      }

      if (!response.ok) {
        setError(body.error?.message ?? 'That did not go through. Try again.')
        return
      }

      if (body.existing) {
        setOffer(body.existing)
        return
      }

      await syncNow()
      router.push('/classroom')
    } catch {
      setError('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function askToJoin(groupId: string) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/classrooms/${groupId}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = (await response.json()) as { error?: { message: string } }
      if (!response.ok) {
        setError(body.error?.message ?? 'That did not go through. Try again.')
        return
      }
      router.push('/classroom')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <NavBar
        title="Start a classroom"
        subtitle="One per block section, per term"
        back={{ href: '/classroom', label: 'Classroom' }}
        info={
          <InfoTip title="Being the rep">
            You approve who joins, and you can hand that over later. Nothing here is checked against
            the registrar — what protects your class is that the invite link only goes where you
            send it.
          </InfoTip>
        }
      />

      <div className="app-container stack pb-6">
        {error && <FormError>{error}</FormError>}

        {offer ? (
          <Card>
            <p className="type-subheadline font-medium">
              {offer.rep_name ?? 'Someone'} already started {offer.section_code}.
            </p>
            <p className="type-footnote mt-1 text-[var(--label-secondary)]">
              {offer.member_count} {offer.member_count === 1 ? 'person is' : 'people are'} in it.
              Ask to join rather than starting a second one — a section with two classrooms is a
              section where half the class misses every announcement.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="accent"
                disabled={busy}
                onClick={() => void askToJoin(offer.id)}
                leading={<IconJoin size={18} />}
              >
                Ask to join {offer.section_code}
              </Button>
              <Button variant="plain" onClick={() => setOffer(null)}>
                Change the code
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="stack">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  id="program"
                  label="Program"
                  value={program}
                  onChange={(value) => setProgram(value.toUpperCase())}
                  placeholder="BSCS"
                  spellCheck={false}
                />
                <Field
                  id="year"
                  label="Year"
                  value={year}
                  onChange={setYear}
                  placeholder="4"
                  inputMode="numeric"
                />
                <Field
                  id="block"
                  label="Block"
                  value={block}
                  onChange={(value) => setBlock(value.toUpperCase())}
                  placeholder="B"
                  spellCheck={false}
                />
              </div>

              <div>
                <label htmlFor="campus" className="type-subheadline mb-1.5 block font-medium">
                  Campus
                </label>
                <Select
                  id="campus"
                  value={campus}
                  onChange={(value) => setCampus(value as Campus)}
                  label="Campus"
                  options={CAMPUSES.map((letter) => ({
                    value: letter,
                    label: CAMPUS_LABEL[letter],
                  }))}
                />
              </div>

              <div
                className="flex items-center gap-3 rounded-[var(--radius-lg)] p-3"
                style={{ background: 'var(--tone-green-tint)' }}
              >
                <IconTile Icon={IconClassroom} tone="green" variant="solid" size={40} />
                <span className="min-w-0">
                  <p className="type-footnote text-[var(--tone-green-ink)]">
                    Your classroom will be called
                  </p>
                  <p className="type-data type-title-3 mt-0.5">{parsed?.canonical ?? '—'}</p>
                </span>
              </div>
              <div>
                {!parsed && (
                  <p className="type-footnote mt-1 text-[var(--label-secondary)]">
                    Fill in all four. A block is one letter or digit, and the year is 1 to 6.
                  </p>
                )}
              </div>

              {campusMismatch && (
                <p
                  className="type-footnote inline-flex items-start gap-2"
                  style={{ color: 'var(--tone-crimson-ink)' }}
                >
                  <IconWarning size={16} />
                  Your profile says {CAMPUS_LABEL[profileCampus!]}. If you have transferred, carry
                  on — otherwise this will be a different section from your classmates&rsquo;.
                </p>
              )}

              <Button
                variant="accent"
                block
                disabled={!parsed || busy}
                onClick={() => void create()}
                leading={<IconPlus size={18} />}
              >
                {busy ? 'Starting…' : 'Start this classroom'}
              </Button>

            </div>
          </Card>
        )}
      </div>
    </>
  )
}
