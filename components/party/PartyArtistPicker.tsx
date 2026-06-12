'use client'

// =====================================================================
// SoundSnap — PartyArtistPicker
// =====================================================================
// Compact artist search for the lobby. On selection it POSTs the chosen
// artist to /api/party/artist and notifies the room. Reuses the public
// /api/search/artist endpoint (same as the single-player ArtistSearch).
// =====================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ArtistSearchResult } from '@/types'

interface PartyArtistPickerProps {
  code: string
  currentArtistName: string | null
  disabled?: boolean
  onChanged: () => void
}

export default function PartyArtistPicker({
  code,
  currentArtistName,
  disabled = false,
  onChanged,
}: PartyArtistPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ArtistSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/search/artist?q=${encodeURIComponent(q)}&limit=8`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { artists: ArtistSearchResult[] } = await res.json()
      setResults(data.artists)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

  async function handleSelect(artist: ArtistSearchResult) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/party/artist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, artistId: artist.id, artistName: artist.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Error')
      setQuery('')
      setResults([])
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el artista.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
        Tu artista
      </p>
      {currentArtistName ? (
        <p className="text-sm font-medium text-white">
          🎤 {currentArtistName}{' '}
          <span className="text-xs font-normal text-white/40">— cambiá abajo si querés</span>
        </p>
      ) : (
        <p className="text-sm text-amber-300/80">Todavía no elegiste artista.</p>
      )}

      <div className="relative">
        <input
          type="text"
          placeholder="Buscá un artista…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled || saving}
          autoComplete="off"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/25 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        {loading ? (
          <span className="absolute right-4 top-2.5 text-xs text-white/40">Buscando…</span>
        ) : null}
      </div>

      {results.length > 0 ? (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
          {results.map((artist) => (
            <li key={artist.id}>
              <button
                type="button"
                onClick={() => handleSelect(artist)}
                disabled={saving}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                {artist.picture ? (
                  <img
                    src={artist.picture}
                    alt={artist.name}
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded-full bg-white/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{artist.name}</p>
                  <p className="text-xs text-white/40">{artist.nbFan.toLocaleString()} fans</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  )
}
