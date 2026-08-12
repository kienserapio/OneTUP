import { ApiError } from '@/lib/api/errors'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * One account, one ERS record.
 *
 * Nothing stopped a student signing in as themselves and then importing from a
 * classmate's ERS account — the import form takes a student number as free
 * text, and every downstream row is written against *their* user id. The result
 * would be somebody else's grades and absences living permanently in your
 * profile, indistinguishable from your own.
 *
 * So the two identities are checked against each other, twice:
 *
 *   before  the number typed into the form, against the number on the account,
 *           so a mismatch costs nothing — no ERS login, no attempt spent, and
 *           no risk of tripping the portal's three-try lockout on an account
 *           that was never yours to sign into.
 *
 *   after   the number the portal itself reports for the session, against the
 *           same account. This is the one that actually matters: the first
 *           check tests what was typed, and only the portal knows who was let
 *           in. If ERS says the session belongs to somebody else, the proposal
 *           is discarded whatever the form said.
 *
 * A profile with no student number yet adopts the one ERS reports — that is how
 * a student who signed up without one gets it filled in, and it is safe because
 * there is nothing to contradict.
 */

/** Student numbers are written with and without dashes and spaces, and ERS is
 * not consistent about it either. Compare the digits and letters only. */
export function normaliseStudentNumber(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.replace(/[^a-z0-9]/gi, '').toUpperCase()
  return cleaned.length > 0 ? cleaned : null
}

/** The number recorded on the signed-in account, or null if it has none yet. */
export async function accountStudentNumber(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from('profiles')
    .select('student_number')
    .eq('id', userId)
    .maybeSingle()

  return normaliseStudentNumber(data?.student_number)
}

const MISMATCH_MESSAGE =
  'That ERS account belongs to a different student number than the one on this OneTUP account. ' +
  'Sign in to OneTUP as that student, or import the account this profile belongs to — ' +
  'grades and absences are only ever kept under the student they belong to.'

/**
 * Refuses a mismatch before any credential leaves the server.
 *
 * Returns the account's number so the caller can reuse it without a second
 * round trip; null means the account has none and anything is acceptable.
 */
export async function assertRequestedIdentity(
  userId: string,
  requestedStudentNumber: string,
): Promise<string | null> {
  const onAccount = await accountStudentNumber(userId)
  if (!onAccount) return null

  if (normaliseStudentNumber(requestedStudentNumber) !== onAccount) {
    throw new ApiError('FORBIDDEN', MISMATCH_MESSAGE)
  }
  return onAccount
}

/**
 * Refuses a mismatch after the portal has said who it actually signed in.
 *
 * A portal that reports nothing is not treated as a failure: `readIdentity`
 * parses a page header that has changed before and will change again, and
 * refusing an import because a regex missed would punish the student for our
 * problem. The pre-flight check has already compared what they typed.
 */
export function assertScrapedIdentity(
  onAccount: string | null,
  scrapedStudentNumber: string | null | undefined,
): void {
  const scraped = normaliseStudentNumber(scrapedStudentNumber)
  if (!onAccount || !scraped) return
  if (scraped !== onAccount) throw new ApiError('FORBIDDEN', MISMATCH_MESSAGE)
}
