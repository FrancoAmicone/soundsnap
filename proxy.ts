import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16 renamed the `middleware` file convention to `proxy`. Same
// behaviour, clearer name. This proxy refreshes the Supabase session on every
// request and enforces role-based access for /admin routes.
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match every request path except for:
     *   - _next/static  (static files)
     *   - _next/image   (image optimization files)
     *   - favicon.ico, sitemap.xml, robots.txt
     *   - common image extensions
     *
     * API routes are intentionally included so the session cookie is also
     * refreshed when calling /api/* from the client.
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
