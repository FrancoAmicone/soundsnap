'use client'

// =====================================================================
// SoundSnap — PartyRound
// =====================================================================
// Wraps GameSession in "pre-created session" mode for the current round.
// The session + safe track payload come from the party state, so the
// usual /api/session/answer + /complete flow drives the round unchanged.
// =====================================================================

import GameSession from '@/components/game/GameSession'
import type { PartyStateResponse, SessionCompleteResponse } from '@/types'

interface PartyRoundProps {
  state: PartyStateResponse
  onComplete: (result: SessionCompleteResponse) => void
}

export default function PartyRound({ state, onComplete }: PartyRoundProps) {
  const session = state.mySession
  const round = state.round
  if (!session || !round) return null

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <span className="text-sm font-semibold text-white">
            Ronda {round.roundNumber}
            <span className="text-white/30">/{state.totalRounds}</span>
          </span>
          <span className="truncate pl-3 text-sm text-indigo-300">
            🎤 {round.artistLabel}
          </span>
        </div>
      </header>

      <main>
        <GameSession
          key={session.sessionId}
          difficulty={session.difficulty}
          isLoggedIn
          knownArtist={session.knownArtist}
          initialSessionId={session.sessionId}
          initialTracks={session.tracks}
          initialTotalQuestions={session.totalQuestions}
          onComplete={onComplete}
        />
      </main>
    </div>
  )
}
