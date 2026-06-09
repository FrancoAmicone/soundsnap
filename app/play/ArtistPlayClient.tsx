'use client'

// =====================================================================
// SoundSnap — ArtistPlayClient
// =====================================================================
// Reads artistId, artistName and difficulty from the URL, then renders
// GameSession which handles the /api/session/start call on mount.
//
// URL shape: /play?artistId=<id>&artistName=<name>&difficulty=<d>
// No sessionStorage involved — session is created client-side on mount.
// =====================================================================

import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import GameSession from '@/components/game/GameSession'
import type { Difficulty } from '@/types'

const VALID_DIFFICULTIES = new Set<string>(['easy', 'intermediate', 'hard'])

interface ArtistPlayClientProps {
  isLoggedIn: boolean
}

export default function ArtistPlayClient({ isLoggedIn }: ArtistPlayClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const artistId = searchParams.get('artistId')
  const artistName = searchParams.get('artistName') ?? undefined
  const rawDifficulty = searchParams.get('difficulty')

  if (!artistId || !rawDifficulty || !VALID_DIFFICULTIES.has(rawDifficulty)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-4 text-center text-white">
        <p className="text-lg">Parámetros inválidos.</p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500"
        >
          Volver al inicio
        </button>
      </div>
    )
  }

  const difficulty = rawDifficulty as Difficulty

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Minimal nav */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link
            href="/"
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
            {artistName ?? 'Artista'}
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
          artistId={artistId}
          artistName={artistName}
          difficulty={difficulty}
          isLoggedIn={isLoggedIn}
          knownArtist={artistName}
        />
      </main>
    </div>
  )
}
