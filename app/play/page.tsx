// =====================================================================
// SoundSnap — /play  (server wrapper)
// =====================================================================
// Reads auth server-side and passes isLoggedIn down to the client
// component. Suspense boundary is required because ArtistPlayClient
// uses useSearchParams().
// =====================================================================

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import ArtistPlayClient from './ArtistPlayClient'

export default async function ArtistPlayPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400" />
        </div>
      }
    >
      <ArtistPlayClient isLoggedIn={!!user} />
    </Suspense>
  )
}
