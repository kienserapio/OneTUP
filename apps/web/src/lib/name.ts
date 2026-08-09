/**
 * Names, as ERS gives them.
 *
 * The portal returns "SERAPIO, KIEN LERISS RAMOS" — surname first, all caps.
 * A student's own app should address them the way a person would, so these
 * turn that into "Kien Serapio" and "Kien".
 *
 * Plain module, no `'use client'`: both the server shell and the client
 * components need it, and a client-only helper cannot be called during render
 * on the server.
 */

export function displayName(fullName: string | null): string {
  if (!fullName) return 'Your account'
  const [surname, given] = fullName.split(',').map((part) => part.trim())
  if (!given) return titleCase(fullName)
  return titleCase(`${given.split(/\s+/)[0]} ${surname}`)
}

export function firstName(fullName: string | null): string | null {
  if (!fullName) return null
  const given = fullName.split(',')[1]?.trim()
  const first = (given ?? fullName).split(/\s+/)[0]
  return first ? titleCase(first) : null
}

export function initialsOf(fullName: string | null): string {
  if (!fullName) return '—'
  const [surname, given] = fullName.split(',').map((part) => part.trim())
  const a = given?.[0] ?? fullName[0] ?? ''
  const b = surname?.[0] ?? ''
  return `${a}${b}`.toUpperCase() || '—'
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /(^|[\s-])([a-z])/g,
      (_, boundary: string, letter: string) => boundary + letter.toUpperCase(),
    )
}
