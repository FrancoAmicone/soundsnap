'use client'

// =====================================================================
// SoundSnap — PartyEntry
// =====================================================================
// Create a room (pick difficulty) or join an existing one by code.
// Joining just navigates to /party/<code> — the room page auto-joins.
// =====================================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Difficulty, PartyCreateResponse } from '@/types'

const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Portada + opción múltiple · ×1.0' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Tapa se revela a 15s · ×1.3' },
  { value: 'hard', label: 'Hard', hint: 'Artista + título · ×1.7' },
]

export default function PartyEntry() {
  const router = useRouter()
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate')
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/party/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ difficulty }),
      })
      const data: PartyCreateResponse & { error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      router.push(`/party/${data.code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sala.')
      setCreating(false)
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) {
      setError('Ingresá un código válido.')
      return
    }
    router.push(`/party/${clean}`)
  }

  return (
    <div className="space-y-8">
      {/* Create */}
      <section className="rounded-2xl border border-white/10 bg-white/[.03] p-6">
        <h2 className="text-lg font-semibold text-white">Crear una sala</h2>
        <p className="mt-1 text-sm text-white/40">
          Elegí la dificultad para todos los jugadores.
        </p>
        <div className="mt-4 space-y-2">
          {DIFFICULTIES.map((d) => (
            <label
              key={d.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                difficulty === d.value
                  ? 'border-indigo-500 bg-indigo-600/10'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="party-difficulty"
                value={d.value}
                checked={difficulty === d.value}
                onChange={() => setDifficulty(d.value)}
                className="mt-0.5 accent-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-white">{d.label}</p>
                <p className="text-xs text-white/50">{d.hint}</p>
              </div>
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {creating ? 'Creando…' : 'Crear sala'}
        </button>
      </section>

      {/* Join */}
      <section className="rounded-2xl border border-white/10 bg-white/[.03] p-6">
        <h2 className="text-lg font-semibold text-white">Unirme con código</h2>
        <form onSubmit={handleJoin} className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="CÓDIGO"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-lg tracking-widest text-white placeholder-white/25 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoComplete="off"
          />
          <button
            type="submit"
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white"
          >
            Entrar
          </button>
        </form>
      </section>

      {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
    </div>
  )
}
