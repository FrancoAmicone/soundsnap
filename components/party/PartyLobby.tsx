'use client'

// =====================================================================
// SoundSnap — PartyLobby
// =====================================================================
// Pre-game room: share code, roster (artist + ready + online), your own
// artist picker + ready toggle, and (host) the Start button.
// =====================================================================

import { useState } from 'react'
import type { Difficulty, PartyStateResponse } from '@/types'
import PartyArtistPicker from './PartyArtistPicker'

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  intermediate: 'Intermediate',
  hard: 'Hard',
}

interface PartyLobbyProps {
  state: PartyStateResponse
  connectedIds: string[]
  onChanged: () => void
  onStart: () => Promise<string | null>
}

export default function PartyLobby({
  state,
  connectedIds,
  onChanged,
  onStart,
}: PartyLobbyProps) {
  const me = state.members.find((m) => m.userId === state.me.userId)
  const isHost = state.me.isHost
  const allReady =
    state.members.length >= 2 &&
    state.members.every((m) => m.artistId && m.isReady)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function toggleReady() {
    if (!me) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/party/ready', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: state.code, ready: !me.isReady }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Error')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function handleStart() {
    setBusy(true)
    setError(null)
    const err = await onStart()
    if (err) setError(err)
    setBusy(false)
  }

  function copyCode() {
    navigator.clipboard?.writeText(state.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
        {/* Code */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
            Código de sala
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-white transition-colors hover:text-indigo-300"
            title="Copiar código"
          >
            {state.code}
          </button>
          <p className="mt-1 text-xs text-white/40">
            {copied ? '¡Copiado!' : 'Tocá el código para copiarlo'} ·{' '}
            {DIFFICULTY_LABEL[state.difficulty]}
          </p>
        </div>

        {/* Roster */}
        <div className="mt-8 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
            Jugadores ({state.members.length}/10)
          </p>
          {state.members.map((m) => {
            const online = connectedIds.includes(m.userId)
            return (
              <div
                key={m.userId}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2.5"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    online ? 'bg-emerald-400' : 'bg-white/20'
                  }`}
                  title={online ? 'Conectado' : 'Desconectado'}
                />
                {m.avatarUrl ? (
                  <img
                    src={m.avatarUrl}
                    alt={m.username}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs">
                    {m.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {m.username}
                    {m.isHost ? (
                      <span className="ml-1.5 rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                        HOST
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-white/40">
                    {m.artistName ? `🎤 ${m.artistName}` : 'Sin artista'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    m.isReady
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-white/5 text-white/30'
                  }`}
                >
                  {m.isReady ? 'Listo' : 'Esperando'}
                </span>
              </div>
            )
          })}
        </div>

        {/* My controls */}
        <div className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/[.03] p-5">
          <PartyArtistPicker
            code={state.code}
            currentArtistName={me?.artistName ?? null}
            disabled={busy}
            onChanged={onChanged}
          />
          <button
            type="button"
            onClick={toggleReady}
            disabled={busy || !me?.artistId}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              me?.isReady
                ? 'border border-white/15 text-white/70 hover:border-white/25'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            {me?.isReady ? 'Cancelar listo' : 'Estoy listo'}
          </button>
        </div>

        {/* Host start */}
        {isHost ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleStart}
              disabled={busy || !allReady}
              className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Empezando…' : 'Empezar partida'}
            </button>
            {!allReady ? (
              <p className="mt-2 text-center text-xs text-white/30">
                Hacen falta al menos 2 jugadores, todos con artista y listos.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-6 text-center text-xs text-white/30">
            Esperando a que el host empiece la partida…
          </p>
        )}

        {error ? (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        ) : null}
      </main>
    </div>
  )
}
