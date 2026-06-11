// =====================================================================
// SoundSnap — Challenge play page
// =====================================================================
// Server wrapper. Validates the difficulty param, reads auth state,
// then hands off to the GameSession client component.
// =====================================================================

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import GameSession from '@/components/game/GameSession'
import type { Difficulty } from '@/types'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ difficulty?: string }>
}

const VALID_DIFFICULTIES = new Set<string>(['easy', 'intermediate', 'hard'])

export default async function PlayPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { difficulty: rawDifficulty } = await searchParams

  // Validate difficulty param
  if (!rawDifficulty || !VALID_DIFFICULTIES.has(rawDifficulty)) {
    redirect(`/challenge/${id}`)
  }
  const difficulty = rawDifficulty as Difficulty

  // Auth + challenge fetched in parallel.
  const service = createServiceClient()
  const [user, { data: challenge }] = await Promise.all([
    getUser(),
    service
      .from('challenges')
      .select('id, title, is_active, is_guest_allowed, challenge_type')
      .eq('id', id)
      .eq('is_active', true)
      .single(),
  ])
  const isGuest = !user

  if (!challenge) redirect('/')
  if (isGuest && difficulty !== 'easy') redirect(`/challenge/${id}`)
  if (isGuest && !challenge.is_guest_allowed) redirect('/')

  // For artist-type challenges the player already knows who they're
  // playing — pass the artist name so Hard/Intermediate don't ask for it.
  const knownArtist =
    (challenge as { challenge_type: string }).challenge_type === 'artist'
      ? challenge.title
      : undefined

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Minimal nav */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link
            href={`/challenge/${id}`}
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {challenge.title}
          </Link>
          <span
            className={`text-xs font-semibold ${
              difficulty === 'easy'
                ? 'text-emerald-400'
                : difficulty === 'intermediate'
                  ? 'text-amber-400'
                  : 'text-red-400'
            }`}
          >
            {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
          </span>
        </div>
      </header>

      <main>
        <GameSession
          challengeId={id}
          difficulty={difficulty}
          isLoggedIn={!isGuest}
          knownArtist={knownArtist}
        />
      </main>
    </div>
  )
}
