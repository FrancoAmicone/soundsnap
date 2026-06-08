import { createClient } from '@supabase/supabase-js'

/**
 * Privileged Supabase client for use ONLY in server-side code (API
 * routes, Server Actions, Edge Functions). Uses the secret key, which
 * bypasses Row Level Security.
 *
 * Required for:
 *   - Writing/reading `game_sessions.tracks_data` for guest sessions
 *     (RLS allows the INSERT but blocks subsequent SELECT/UPDATE when
 *     user_id is NULL, which is correct for the wider app but blocks
 *     our own backend).
 *   - Invoking the `deezer-tracks` Edge Function from API routes.
 *
 * NEVER import this from a Client Component or anything that ends up
 * in the browser bundle. The build will not stop you — the secret key
 * just leaking client-side would be catastrophic.
 *
 * Cookies/auth are intentionally disabled: this client must not be
 * used to act on behalf of a particular user. If you need the calling
 * user's id, fetch it with `lib/supabase/server.ts` first.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!url || !secret) {
    throw new Error(
      'Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY',
    )
  }
  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
