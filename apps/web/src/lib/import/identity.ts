import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * The student's own details, as ERS reports them.
 *
 * This lives on its own rather than inside the onboarding screen because there
 * are two ways into an ERS import — first-run onboarding, and the Schedule
 * screen's import/resync — and for a while only the first one wrote any of it
 * down. A student who connected ERS from the Schedule screen got their whole
 * timetable and a Settings page that claimed to know nothing about them.
 *
 * One function, imported by both, is the only version of this that cannot drift
 * apart again.
 */

export interface ErsIdentity {
  fullName: string | null
  studentNumber: string | null
  programName: string | null
}

/**
 * Fills in what the student would otherwise have to type, and correctly.
 *
 * Every field is optional and only written when ERS actually returned it: a
 * partial read must never blank out something the student typed themselves.
 * Failures are swallowed on purpose — the schedule is the thing they asked for,
 * and losing the profile patch is not worth failing the import over.
 */
export async function saveErsIdentity(identity: ErsIdentity | null | undefined): Promise<void> {
  if (!identity) return

  const patch = {
    ...(identity.fullName ? { full_name: identity.fullName } : {}),
    ...(identity.studentNumber ? { student_number: identity.studentNumber } : {}),
    ...(identity.programName ? { program_code: identity.programName } : {}),
  }
  if (Object.keys(patch).length === 0) return

  try {
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    await supabase.from('profiles').update(patch).eq('id', data.user.id)
  } catch {
    // Deliberately silent. See the note above.
  }
}
