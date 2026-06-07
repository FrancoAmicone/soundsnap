import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * OAuth callback for Supabase Auth (Google provider in MVP).
 *
 * The provider redirects the browser here with a `?code=...` query param.
 * `exchangeCodeForSession` writes the resulting session cookie via the
 * server client, then we redirect the user to the requested `next` path
 * (or `/` by default).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  // Support a `next` redirect-after-login parameter, but only allow same-origin
  // relative paths to prevent open-redirect abuse.
  const rawNext = searchParams.get('next') ?? '/'
  const next = rawNext.startsWith('/') ? rawNext : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    )
  }

  return NextResponse.redirect(`${origin}${next}`)
}
