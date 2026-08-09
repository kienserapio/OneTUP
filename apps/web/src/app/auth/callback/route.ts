import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * The PKCE landing point for email verification, password recovery and magic
 * links. Exchanges the one-time code for a session and sends the student on to
 * wherever they were headed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/today'

  // Only same-origin destinations, so a crafted link cannot bounce a freshly
  // authenticated student somewhere else.
  const destination = next.startsWith('/') ? next : '/today'

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=link_expired', url.origin))
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=link_expired', url.origin))
  }

  return NextResponse.redirect(new URL(destination, url.origin))
}
