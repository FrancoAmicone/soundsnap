'use client'

// =====================================================================
// SoundSnap — TrackSearchPanel
// =====================================================================
// Admin component for searching Deezer tracks and adding them to a
// challenge's pinned_tracks list.
//
// Props:
//   pinnedTracks   — current list of manually pinned tracks (controlled)
//   onAdd          — called when admin clicks "+ Agregar" on a result
//   onRemove       — called when admin removes a pinned track
//
// Communicates with GET /api/admin/search-tracks?q=...
// =====================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import type { DeezerTrack } from '@/types'

interface TrackSearchPanelProps {
  pinnedTracks: DeezerTrack[]
  onAdd: (track: DeezerTrack) => void
  onRemove: (trackId: string) => void
}

export default function TrackSearchPanel({
  pinnedTracks,
  onAdd,
  onRemove,
}: TrackSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DeezerTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinnedIds = new Set(pinnedTracks.map((t) => t.id))

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/search-tracks?q=${encodeURIComponent(q)}&limit=20`,
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data: { tracks: DeezerTrack[] } = await res.json()
      setResults(data.tracks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          placeholder="Buscar canción o artista…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/40 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {loading && (
          <span className="absolute right-3 top-2.5 text-xs text-white/40">
            Buscando…
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {/* Search results */}
      {results.length > 0 && (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/5">
          {results.map((track) => {
            const added = pinnedIds.has(track.id)
            return (
              <li key={track.id} className="flex items-center gap-3 px-3 py-2.5">
                {track.coverUrl ? (
                  <img
                    src={track.coverUrl}
                    alt={track.albumName}
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded bg-white/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {track.name}
                  </p>
                  <p className="truncate text-xs text-white/50">{track.artist}</p>
                </div>
                <button
                  type="button"
                  onClick={() => (added ? onRemove(track.id) : onAdd(track))}
                  className={
                    added
                      ? 'shrink-0 rounded px-2.5 py-1 text-xs font-medium text-green-400 ring-1 ring-green-400/40 hover:bg-red-500/10 hover:text-red-400 hover:ring-red-400/40'
                      : 'shrink-0 rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500'
                  }
                >
                  {added ? '✓ Agregado' : '+ Agregar'}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {query.trim().length >= 2 && !loading && results.length === 0 && !error && (
        <p className="text-sm text-white/40">
          Sin resultados para &ldquo;{query}&rdquo;
        </p>
      )}

      {/* Pinned tracks list */}
      {pinnedTracks.length > 0 && (
        <div className="mt-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
            Canciones agregadas ({pinnedTracks.length})
          </p>
          <ul className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/5">
            {pinnedTracks.map((track) => (
              <li
                key={track.id}
                className="flex items-center gap-3 px-3 py-2"
              >
                {track.coverUrl ? (
                  <img
                    src={track.coverUrl}
                    alt={track.albumName}
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded bg-white/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{track.name}</p>
                  <p className="truncate text-xs text-white/40">{track.artist}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(track.id)}
                  className="shrink-0 rounded p-1 text-white/40 hover:text-red-400"
                  aria-label={`Quitar ${track.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
