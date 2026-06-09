// =====================================================================
// SoundSnap — Home page
// =====================================================================
// Server Component. Resolves auth state and passes it down to any
// client islands that need it (e.g. ArtistSearch).
//
// The challenge grid is implemented in Fase 4 (Agente 5). This page
// already includes the "Jugar por artista" section that was added in
// the challenge-types plan.
// =====================================================================

import { createClient } from '@/lib/supabase/server'
import ArtistSearch from '@/components/ui/ArtistSearch'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isGuest = !user

  return (
    <main className="min-h-screen bg-black text-white">
      {/* ---------------------------------------------------------------- */}
      {/* Hero */}
      {/* ---------------------------------------------------------------- */}
      <section className="px-4 pb-16 pt-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Sound<span className="text-indigo-400">Snap</span>
        </h1>
        <p className="mt-3 text-base text-white/50 sm:text-lg">
          Escuchá 5 segundos. Adiviná la canción.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Challenge grid — implemented in Fase 4 */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="mb-6 text-lg font-semibold text-white/70">
          Challenges disponibles
        </h2>
        {/* ChallengeGrid will be added here in Fase 4 */}
        <p className="rounded-xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-white/30">
          Los challenges aparecerán aquí.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Play by artist */}
      {/* ---------------------------------------------------------------- */}
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
    </main>
  )
}
