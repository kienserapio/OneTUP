import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_NAV_ITEMS, MORE_NAV, PHONE_NAV, titleFor } from '@/components/app/nav-items'

/**
 * The guarantee: wherever a student is, exactly one place in the navigation
 * says so.
 *
 * Two items lit at once is two accent rows in the sidebar and two elements
 * claiming `aria-current="page"`, so a screen reader announces two current
 * pages. That is what `/subjects/gwa` did for as long as Subjects matched on a
 * bare prefix — and nothing caught it, because nothing tested the matchers.
 */

const APP = resolve(__dirname, '../src/app')

/** A page lives either inside the signed-in `(app)` group or, like Campus,
 * outside it because signed-out visitors can open it too. */
const isPage = (href: string) =>
  ['(app)', '.'].some((group) => existsSync(resolve(APP, group, `.${href}`, 'page.tsx')))

/** Every page a signed-in student can land on, including the nested ones. */
const PATHS = [
  '/today',
  '/commute',
  '/schedule',
  '/schedule/import',
  '/deadlines',
  '/announcements',
  '/classroom',
  '/classroom/abc123',
  '/subjects',
  '/subjects/abc123',
  '/subjects/gwa',
  '/subjects/gwa/import',
  '/subjects/catch-up',
  '/study',
  '/study/abc123',
  '/evaluations',
  '/ask',
  '/campus',
  '/campus/tour',
  '/settings',
]

const active = (pathname: string) =>
  ALL_NAV_ITEMS.filter((item) => item.match(pathname)).map((item) => item.href)

describe('navigation matchers', () => {
  it.each(PATHS)('marks exactly one item current on %s', (pathname) => {
    expect(active(pathname)).toHaveLength(1)
  })

  it('keeps a page nested under Grades & GWA on Grades & GWA', () => {
    expect(active('/subjects/gwa/import')).toEqual(['/subjects/gwa'])
  })

  it('keeps a single subject on Subjects', () => {
    expect(active('/subjects/abc123')).toEqual(['/subjects'])
  })

  it('titles the top bar after the item that is current', () => {
    expect(titleFor('/subjects/gwa')).toBe('Grades & GWA')
    expect(titleFor('/subjects/catch-up')).toBe('Attendance')
    expect(titleFor('/subjects/abc123')).toBe('Subjects')
  })
})

describe('navigation destinations', () => {
  it.each(ALL_NAV_ITEMS.map((item) => item.href))('%s is a real page', (href) => {
    expect(isPage(href)).toBe(true)
  })

  it('reaches every destination on a phone, in the bar or the More sheet', () => {
    const onPhone = new Set([
      ...PHONE_NAV.map((item) => item.href),
      ...MORE_NAV.flatMap((group) => group.items.map((item) => item.href)),
    ])
    expect([...onPhone].sort()).toEqual(ALL_NAV_ITEMS.map((item) => item.href).sort())
  })
})
