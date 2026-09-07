import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the session on every request and gates the authenticated area.
 *
 * This is Next 16's `proxy` convention — the same thing `middleware.ts` used to
 * be, renamed.
 *
 * `getClaims()` runs before any response is generated, because a token refresh
 * that completes after the response is committed cannot write its cookies back
 * — and the next request then refreshes again, forever.
 */

const PUBLIC_PREFIXES = [
  '/',
  '/campus',
  // Campus data is non-personal and serving it without an account is a product
  // requirement, not an oversight (ADR-012).
  '/api/campus',
  '/sign-in',
  '/sign-up',
  '/reset-password',
  '/auth',
  '/offline',
  '/privacy',
  '/terms',
  '/contributors',
  // Reporting a problem must not require an account: the person best placed to
  // tell us sign-up is broken is someone who could not sign up. The route
  // enforces its own rate limit and honeypot precisely because it is open.
  '/report',
  '/api/reports',
  // Linked from the public footer, and was redirecting anonymous readers to
  // sign-in — documentation nobody can read without an account is not
  // documentation.
  '/docs',
]

/**
 * The authenticated area, named explicitly.
 *
 * The gate used to be "everything that is not on the public list", which meant
 * a signed-out visitor mistyping a URL was sent to sign in — and then, having
 * signed in, forwarded to a page that does not exist. A URL that matches no
 * route is not a private page; it is a 404, and it should say so to everyone.
 *
 * This list is an optimisation, not the gate. `(app)/layout.tsx` redirects an
 * unauthenticated visitor itself, so a route added here and forgotten fails
 * closed rather than open.
 */
const PRIVATE_PREFIXES = [
  '/today',
  '/schedule',
  '/subjects',
  '/deadlines',
  '/announcements',
  '/classroom',
  '/evaluations',
  '/commute',
  '/ask',
  '/settings',
  '/welcome',
  '/share',
  '/api',
]

function isPublic(pathname: string): boolean {
  if (pathname === '/') return true
  if (PUBLIC_PREFIXES.some((prefix) => prefix !== '/' && pathname.startsWith(prefix))) return true
  // Anything the app does not claim falls through to the router, which renders
  // the 404 rather than a sign-in wall.
  return !PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)

  const { pathname } = request.nextUrl

  if (!signedIn && !isPublic(pathname)) {
    // An API route answers in its own error envelope. Redirecting it would send
    // a `fetch` an HTML sign-in page, which then fails at `response.json()`
    // somewhere far from the actual cause.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'You need to sign in first.',
            retryable: false,
            request_id: request.headers.get('X-Request-Id') ?? 'req_proxy',
          },
        },
        { status: 401 },
      )
    }

    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    // Come back to where they were trying to go, not to a generic home.
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (signedIn && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const url = request.nextUrl.clone()
    url.pathname = '/today'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the service worker. The worker in
     * particular must not be rewritten or it loses its scope.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|woff2?|html)$).*)',
  ],
}
