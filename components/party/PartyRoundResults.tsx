'use client'

// =====================================================================
// SoundSnap — PartyRoundResults
// =====================================================================
// Shown between rounds (and while waiting for others to finish). Displays
// the accumulated leaderboard with this round's points, the finished
// counter, and (host) the advance button once everyone is done.
// =====================================================================

import { useState } from 'react'
import type { PartyStateResponse } from '@/types'

interface PartyRoundResultsProps {
  state: PartyStateResponse
  connectedIds: string[]
  onNext: () => Promise<string | null>
}

export default function PartyRoundResults({
  state,
  onNext,
}: PartyRoundResultsProps) {
  const round = state.round
  const isHost = state.me.isHost
  const finished = round?.finishedCount ?? 0
  const total = round?.totalMembers ?? state.members.length
  const allDone = finished >= total
  const isLastRound = state.currentRound >= state.totalRounds

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNext() {
    setBusy(true)
    setError(null)
    const err = await onNext()
    if (err) setError(err)
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
            Ronda {state.currentRound}/{state.totalRounds}
          </p>
          {round ? (
            <h1 className="mt-1 text-xl font-bold text-white">🎤 {round.artistLabel}</h1>
          ) : null}
          <p className="mt-2 text-sm text-white/40">
            {allDone
              ? 'Todos terminaron la ronda'
              : `Terminaron ${finished} de ${total}…`}
          </p>
        </div>

        {/* Leaderboard */}
        <div className="mt-6 space-y-2">
          {state.leaderboard.map((entry) => {
            const roundPts = entry.roundScores[state.currentRound]
            const isMe = entry.userId === state.me.userId
            return (
              <div
                key={entry.userId}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  isMe
                    ? 'border-indigo-500/40 bg-indigo-600/10'
                    : 'border-white/10 bg-white/[.03]'
                }`}
              >
                <span className="w-5 text-center text-sm font-bold text-white/40">
                  {entry.rank}
                </span>
                {entry.avatarUrl ? (
                  <img
                    src={entry.avatarUrl}
                    alt={entry.username}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs">
                    {entry.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {entry.username}
                  </p>
                  <p className="text-xs text-white/40">
                    {roundPts != null ? `+${roundPts} esta ronda` : 'Jugando…'}
                  </p>
                </div>
                <span className="shrink-0 text-lg font-bold tabular-nums text-white">
                  {entry.totalScore.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>

        {/* Host advance */}
        {isHost ? (
          <div className="mt-8">
            <button
              type="button"
              onClick={handleNext}
              disabled={busy || !allDone}
              className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? 'Cargando…'
                : isLastRound
                  ? 'Ver resultado final'
                  : 'Siguiente ronda'}
            </button>
            {!allDone ? (
              <p className="mt-2 text-center text-xs text-white/30">
                Esperá a que todos terminen para avanzar.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-8 text-center text-xs text-white/30">
            {allDone
              ? 'Esperando a que el host avance…'
              : 'Esperando a los demás jugadores…'}
          </p>
        )}

        {error ? (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        ) : null}
      </main>
    </div>
  )
}
