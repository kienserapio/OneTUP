import { describe, expect, it } from 'vitest'
import { isPublic } from '@/proxy'

/**
 * The guarantee: a route reachable without a session is reachable, and every
 * other one is not.
 *
 * This is the gate that made the entire push stack dead code. `/api` is on the
 * private list, `/api/notifications/dispatch` was on neither list, and so the
 * proxy answered 401 before the route's own `WORKER_SECRET` check ever ran.
 * Every part of push worked — service worker, subscriptions, quiet hours, the
 * dispatch route itself — and the one door into it was locked, at the one hour
 * the feature exists for.
 *
 * Nothing caught it because nothing tested this function. A route added to the
 * public list by mistake is a data leak, and a route left off it is a feature
 * that silently does not exist. Both belong in a test.
 */

describe('isPublic', () => {
  it('lets the scheduler reach notification dispatch', () => {
    // Called by a cron with a shared secret. Nobody is signed in at 4:55 AM.
    expect(isPublic('/api/notifications/dispatch')).toBe(true)
  })

  it('still requires a session to subscribe to notifications', () => {
    // A subscription is tied to the student who made it, so this one is not
    // public — and the two paths differ by a single segment.
    expect(isPublic('/api/notifications/subscribe')).toBe(false)
  })

  it('keeps the open routes open', () => {
    for (const path of [
      '/',
      '/sign-in',
      '/sign-up',
      '/privacy',
      '/terms',
      '/contributors',
      '/docs',
      '/campus',
      '/campus/tour',
      '/api/campus/places',
      // Whoever is best placed to report that sign-up is broken is someone who
      // could not sign up.
      '/report',
      '/api/reports',
    ]) {
      expect(isPublic(path), path).toBe(true)
    }
  })

  it('keeps a student’s own records behind a session', () => {
    for (const path of [
      '/today',
      '/schedule',
      '/subjects',
      '/subjects/gwa',
      '/deadlines',
      '/announcements',
      '/classroom',
      '/evaluations',
      '/commute',
      '/ask',
      '/settings',
      '/api/ers/grades',
      '/api/study/generate',
      '/api/assistant/query',
      '/api/account/delete',
    ]) {
      expect(isPublic(path), path).toBe(false)
    }
  })

  it('treats an unclaimed path as a 404 rather than a sign-in wall', () => {
    // A URL matching no route is not a private page. Sending a signed-out
    // visitor to sign in, and then on to a page that does not exist, is worse
    // than telling them the truth immediately.
    expect(isPublic('/definitely-not-a-route')).toBe(true)
  })
})
