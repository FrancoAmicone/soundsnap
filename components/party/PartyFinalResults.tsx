'use client'

// =====================================================================
// SoundSnap — PartyFinalResults
// =====================================================================
// End of the party: final ranking by accumulated score, winner on top.
// =====================================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PartyStateResponse } from '@/types'

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function PartyFinalResults({
  state,
  onRematch,
}: {
  state: PartyStateResponse
  onRematch: () => Promise<string | null>
}) {
  const router = useRouter()
  const winner = state.leaderboard[0]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRematch() {
    setBusy(true)
    setError(null)
    const err = await onRematch()
    if (err) {
      setError(err)
      setBusy(false)
    }
    // On success we navigate away, so no need to reset busy.
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
            Resultado final
          </p>
          {winner ? (
            <>
              <div className="mt-3 text-5xl">🏆</div>
              <h1 className="mt-2 text-2xl font-bold text-white">
                Ganó {winner.username}
              </h1>
              <p className="mt-1 text-sm text-white/40">
                {winner.totalScore.toLocaleString()} puntos
              </p>
            </>
          ) : null}
        </div>

        <div className="mt-8 space-y-2">
          {state.leaderboard.map((entry) => {
            const isMe = entry.userId === state.me.userId
            return (
              <div
                key={entry.userId}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                  entry.rank === 1
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : isMe
                      ? 'border-indigo-500/40 bg-indigo-600/10'
                      : 'border-white/10 bg-white/[.03]'
                }`}
              >
                <span className="w-6 text-center text-lg">
                  {MEDAL[entry.rank] ?? (
                    <span className="text-sm font-bold text-white/40">{entry.rank}</span>
                  )}
                </span>
                {entry.avatarUrl ? (
                  <img
                    src={entry.avatarUrl}
                    alt={entry.username}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm">
                    {entry.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {entry.username}
                  </p>
                  <p className="text-xs text-white/40">
                    {entry.totalCorrect} aciertos
                  </p>
                </div>
                <span className="shrink-0 text-lg font-bold tabular-nums text-white">
                  {entry.totalScore.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>

        {state.me.isHost ? (
          <button
            type="button"
            onClick={handleRematch}
            disabled={busy}
            className="mt-8 w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Creando revancha…' : '🔁 Revancha (mismos jugadores)'}
          </button>
        ) : (
          <p className="mt-8 text-center text-xs text-white/30">
            Si el host arranca una revancha, te llevamos automáticamente.
          </p>
        )}

        {error ? (
          <p className="mt-3 text-center text-sm text-red-400">{error}</p>
        ) : null}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/party')}
            className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-semibold text-white/70 hover:border-white/20 hover:text-white"
          >
            Nueva partida
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Inicio
          </button>
        </div>
      </main>
    </div>
  )
}
