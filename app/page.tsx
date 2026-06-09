// =====================================================================
// SoundSnap — Home page
// =====================================================================
// Server Component. Loads active challenges from DB and renders the
// challenge grid. Also shows the "Play by artist" section and a top nav
// with auth state.
// =====================================================================

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import ArtistSearch from '@/components/ui/ArtistSearch'
import UserMenu from '@/components/ui/UserMenu'
import ChallengeGrid, { type ChallengeItem } from '@/components/ui/ChallengeGrid'

interface Challenge {
  id: string
  title: string
  description: string | null
  genre_tag: string | null
  decade_tag: string | null
  cover_image_url: string | null
  is_guest_allowed: boolean
  challenge_type: string
}

export default async function HomePage() {
  // Auth state
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isGuest = !user

  // Load active challenges + play counts in parallel
  const service = createServiceClient()
  const [{ data: challenges }, { data: playCounts }] = await Promise.all([
    service
      .from('challenges')
      .select('id, title, description, genre_tag, decade_tag, cover_image_url, is_guest_allowed, challenge_type')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    service
      .from('game_sessions')
      .select('challenge_id')
      .eq('status', 'completed'),
  ])

  // Build a map of challenge_id → session count
  const countMap: Record<string, number> = {}
  for (const row of playCounts ?? []) {
    countMap[row.challenge_id] = (countMap[row.challenge_id] ?? 0) + 1
  }

  const rows = ((challenges ?? []) as Challenge[]).map((c) => ({
    ...c,
    play_count: countMap[c.id] ?? 0,
  }))

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Top nav ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-sm font-bold tracking-tight text-white"
          >
            Sound<span className="text-indigo-400">Snap</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="px-4 pb-14 pt-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Sound<span className="text-indigo-400">Snap</span>
        </h1>
        <p className="mt-3 text-base text-white/50 sm:text-lg">
          Escuchá 5 segundos. Adiviná la canción.
        </p>
      </section>

      {/* ── Challenge grid ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="mb-6 text-lg font-semibold text-white/70">
          Challenges disponibles
        </h2>
        <ChallengeGrid challenges={rows as ChallengeItem[]} />
      </section>

      {/* ── Play by artist ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <div className="rounded-2xl border border-white/10 bg-white/[.03] px-6 py-10">
          <h2 className="mb-1 text-lg font-semibold text-white">
            Jugar por artista
          </h2>
          <p className="mb-6 text-sm text-white/50">
            Buscá cualquier artista y arrancá una partida al instante con sus
            canciones más populares de Deezer.
          </p>
          <ArtistSearch isGuest={isGuest} />
        </div>
      </section>
    </div>
  )
}
