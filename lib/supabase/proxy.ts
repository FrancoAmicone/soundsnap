import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refresh the Supabase session and enforce role-based access for /admin.
 *
 * Called from `proxy.ts` (the Next.js 16 successor of `middleware.ts`).
 *
 * - Always rebuilds the response so cookie writes from the Supabase client
 *   are propagated back to the browser. Skipping this leads to silent logouts
 *   when refresh tokens rotate.
 * - For routes under /admin, looks up the caller's profile and redirects to
 *   `/` (or `/login` when unauthenticated) if `role !== 'admin'`. RLS on the
 *   `challenges` table provides a second layer of defense.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

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

  // IMPORTANT: getUser() must be called before returning the response so that
  // a refreshed session is committed to the response cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  if (path.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', path)
      return NextResponse.redirect(url)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return response
}
