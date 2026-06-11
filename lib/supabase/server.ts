import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

/**
 * Server-side Supabase client for use in Server Components, Server Actions
 * and Route Handlers.
 *
 * The Next.js 16 `cookies()` API is async, so this factory is async too.
 * `setAll` is wrapped in a try/catch because cookies cannot be written from
 * a Server Component render — in those cases the proxy handles the refresh.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // `set` throws when called from a Server Component render.
            // Proxy refreshes the session on every request, so this is safe
            // to ignore in that context.
          }
        },
      },
    },
  )
}

/**
 * Per-request cached auth check. React.cache() deduplicates the call
 * so pages + their child Server Components (e.g. UserMenu) share one
 * round-trip to Supabase Auth instead of making one each.
 */
export const getUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
