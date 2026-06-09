'use client'

// =====================================================================
// SoundSnap — ArtistSearch
// =====================================================================
// User-facing "Play by Artist" widget.
//
// Flow:
//   1. User types an artist name.
//   2. Results appear (picture + name + fan count).
//   3. User picks an artist → difficulty selector appears.
//   4. User clicks "Jugar" → calls POST /api/session/start with
//      { artistId, artistName, difficulty } → redirects to play page.
//
// Guests are locked to Easy (mirrors the challenge-based flow).
// =====================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ArtistSearchResult, Difficulty } from '@/types'

interface ArtistSearchProps {
  /** Whether the viewer is a guest (not logged in). */
  isGuest?: boolean
}

const DIFFICULTIES: { value: Difficulty; label: string; description: string }[] = [
  { value: 'easy', label: 'Easy', description: '5 preguntas · Portada + opción múltiple · ×1.0' },
  { value: 'intermediate', label: 'Intermediate', description: '7 preguntas · Sin portada · Artista se revela a 15s · ×1.3' },
  { value: 'hard', label: 'Hard', description: '10 preguntas · Sin portada · Artista + título · ×1.7' },
]

export default function ArtistSearch({ isGuest = false }: ArtistSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ArtistSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<ArtistSearchResult | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/search/artist?q=${encodeURIComponent(q)}&limit=8`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { artists: ArtistSearchResult[] } = await res.json()
      setResults(data.artists)
    } catch {
      setError('No se pudo conectar con Deezer. Intentá de nuevo.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  function handleSelect(artist: ArtistSearchResult) {
    setSelectedArtist(artist)
    setResults([])
    setQuery(artist.name)
    setStartError(null)
  }

  function handleClear() {
    setSelectedArtist(null)
    setQuery('')
    setResults([])
    setStartError(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handlePlay() {
    if (!selectedArtist) return
    setStarting(true)
    setStartError(null)
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          artistId: selectedArtist.id,
          artistName: selectedArtist.name,
          difficulty,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      // Redirect to the game play page (ephemeral: no challengeId in URL)
      router.push(`/play?session=${data.sessionId}&difficulty=${difficulty}&artist=${encodeURIComponent(selectedArtist.name)}`)
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : 'No se pudo iniciar la partida.',
      )
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscá un artista… Bowie, Radiohead, Daft Punk…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (selectedArtist) setSelectedArtist(null)
          }}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-4 top-3 text-xs text-white/40">
            Buscando…
          </span>
        )}
        {selectedArtist && !loading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-2.5 rounded p-0.5 text-white/40 hover:text-white"
            aria-label="Limpiar selección"
          >
            ✕
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Results dropdown */}
      {results.length > 0 && !selectedArtist && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-xl">
          {results.map((artist) => (
            <li key={artist.id}>
              <button
                type="button"
                onClick={() => handleSelect(artist)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
              >
                {artist.picture ? (
                  <img
                    src={artist.picture}
                    alt={artist.name}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-full bg-white/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{artist.name}</p>
                  <p className="text-xs text-white/40">
                    {artist.nbFan.toLocaleString()} fans
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && !loading && results.length === 0 && !selectedArtist && !error && (
        <p className="text-sm text-white/40">
          Sin resultados para &ldquo;{query}&rdquo;
        </p>
      )}

      {/* Difficulty + Play — only shown once an artist is selected */}
      {selectedArtist && (
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
          {/* Artist banner */}
          <div className="flex items-center gap-3">
            {selectedArtist.picture ? (
              <img
                src={selectedArtist.picture}
                alt={selectedArtist.name}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-white/10" />
            )}
            <div>
              <p className="font-semibold text-white">{selectedArtist.name}</p>
              <p className="text-xs text-white/40">
                {selectedArtist.nbFan.toLocaleString()} fans
              </p>
            </div>
          </div>

          {/* Difficulty selector */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
              Dificultad
            </p>
            {DIFFICULTIES.map((d) => {
              const locked = isGuest && d.value !== 'easy'
              return (
                <label
                  key={d.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    locked
                      ? 'cursor-not-allowed border-white/5 opacity-40'
                      : difficulty === d.value
                        ? 'border-indigo-500 bg-indigo-600/10'
                        : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  <input
                    type="radio"
                    name="artist-difficulty"
                    value={d.value}
                    checked={difficulty === d.value}
                    disabled={locked}
                    onChange={() => setDifficulty(d.value)}
                    className="mt-0.5 accent-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{d.label}</p>
                    <p className="text-xs text-white/50">{d.description}</p>
                    {locked && (
                      <p className="mt-0.5 text-xs text-amber-400">
                        Requiere cuenta
                      </p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>

          {startError && (
            <p className="text-sm text-red-400">{startError}</p>
          )}

          <button
            type="button"
            onClick={handlePlay}
            disabled={starting}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? 'Iniciando…' : `Jugar con ${selectedArtist.name}`}
          </button>
        </div>
      )}
    </div>
  )
}
