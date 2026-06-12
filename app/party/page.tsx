// =====================================================================
// SoundSnap — Party entry page
// =====================================================================
// Server Component. Requires login (party mode is logged-in only). Shows
// the create-room / join-by-code entry island.
// =====================================================================

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getUser } from '@/lib/supabase/server'
import UserMenu from '@/components/ui/UserMenu'
import PartyEntry from '@/components/party/PartyEntry'

export const metadata: Metadata = {
  title: 'Party — SoundSnap',
  description: 'Jugá SoundSnap con amigos: cada uno elige un artista y compiten ronda a ronda.',
}

export default async function PartyEntryPage() {
  const user = await getUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent('/party')}`)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-sm font-bold tracking-tight text-white">
            Sound<span className="text-indigo-400">Snap</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Modo Party</h1>
          <p className="mt-2 text-sm text-white/50">
            De 2 a 10 jugadores. Cada uno elige un artista y se juega una ronda por
            jugador. Gana quien acumula más puntos.
          </p>
        </div>
        <PartyEntry />
      </main>
    </div>
  )
}
