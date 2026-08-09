import 'server-only'

/**
 * Redaction, applied to every payload before it crosses to a provider.
 *
 * Grades and attendance counts are absent from this list on purpose: no
 * capability takes them as input, because the `own_data` route computes locally
 * and only templates the result. Nothing to redact is a stronger guarantee than
 * something redacted carefully.
 *
 * Faculty names are deliberately *not* redacted. Announcement extraction and
 * evaluation polish both need them to do their job, and a faculty name is not
 * the student's personal data.
 */

export interface RedactionContext {
  studentNumber?: string | null
  fullName?: string | null
  email?: string | null
}

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g
const PHONE = /\b(?:\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g
const STUDENT_NUMBER = /\bTUP[A-Z]?-?\d{2}-?\d{3,5}\b/gi

export function redact(text: string, context: RedactionContext = {}): string {
  let output = text

  if (context.studentNumber) {
    output = output.replaceAll(context.studentNumber, '[STUDENT_ID]')
  }

  if (context.fullName && context.fullName.trim().length > 2) {
    // Whole words only, so a surname that happens to be a common noun does not
    // shred the surrounding sentence.
    const escaped = context.fullName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    output = output.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[STUDENT_NAME]')
  }

  if (context.email) {
    output = output.replaceAll(context.email, '[EMAIL]')
  }

  return output
    .replace(STUDENT_NUMBER, '[STUDENT_ID]')
    .replace(EMAIL, '[EMAIL]')
    .replace(PHONE, '[PHONE]')
}

/** Walks an object and redacts every string leaf. */
export function redactDeep<T>(value: T, context: RedactionContext = {}, depth = 0): T {
  if (depth > 6) return value
  if (typeof value === 'string') return redact(value, context) as T
  if (Array.isArray(value)) {
    return value.map((entry) => redactDeep(entry, context, depth + 1)) as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      out[key] = redactDeep(entry, context, depth + 1)
    }
    return out as T
  }
  return value
}
