'use client'

// =====================================================================
// SoundSnap — PlaylistValidator
// =====================================================================
// Admin component that validates a Deezer playlist or artist source
// and shows preview availability stats.
//
// Props:
//   type     — 'playlist' | 'artist'
//   sourceId — the playlist ID or artist ID to validate
//
// Calls GET /api/admin/validate-playlist?type=...&id=...
// =====================================================================

import { useState, useEffect } from 'react'
import type { DeezerTrack } from '@/types'

interface ValidationResult {
  total: number
  withPreview: number
  withoutPreview: number
  sufficient: boolean
  tracks: DeezerTrack[]
}

interface PlaylistValidatorProps {
  type: 'playlist' | 'artist'
  sourceId: string
  /** If true, triggers validation automatically when sourceId changes. */
  autoValidate?: boolean
}

export default function PlaylistValidator({
  type,
  sourceId,
  autoValidate = false,
}: PlaylistValidatorProps) {
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastValidated, setLastValidated] = useState<string>('')

  async function validate() {
    if (!sourceId.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(
        `/api/admin/validate-playlist?type=${type}&id=${encodeURIComponent(sourceId.trim())}`,
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResult(data as ValidationResult)
      setLastValidated(sourceId.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al validar')
    } finally {
      setLoading(false)
    }
  }

  // Auto-validate when sourceId changes (with debounce)
  useEffect(() => {
    if (!autoValidate || !sourceId.trim() || sourceId === lastValidated) return
    const timer = setTimeout(validate, 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, autoValidate])

  if (!sourceId.trim()) return null

  return (
    <div className="space-y-3">
      {!autoValidate && (
        <button
          type="button"
          onClick={validate}
          disabled={loading || sourceId === lastValidated}
          className="rounded-lg border border-indigo-500/40 px-4 py-2 text-sm text-indigo-400 transition-colors hover:border-indigo-400 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading
            ? 'Validando…'
            : sourceId === lastValidated
              ? '✓ Validado'
              : 'Validar fuente'}
        </button>
      )}

      {loading && (
        <p className="text-sm text-white/40">
          Consultando Deezer…
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Stats */}
          <div
            className={`rounded-lg border px-4 py-3 ${
              result.sufficient
                ? 'border-green-500/30 bg-green-500/10'
                : 'border-amber-500/30 bg-amber-500/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <p
                className={`text-sm font-medium ${
                  result.sufficient ? 'text-green-400' : 'text-amber-400'
                }`}
              >
                {result.sufficient
                  ? '✓ Suficiente para todas las dificultades'
                  : '⚠ Tracks insuficientes para Hard'}
              </p>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-white/50">
              <span>{result.total} tracks totales</span>
              <span className="text-green-400">{result.withPreview} con preview</span>
              {result.withoutPreview > 0 && (
                <span className="text-red-400">
                  {result.withoutPreview} sin preview
                </span>
              )}
            </div>
          </div>

          {/* Track list preview */}
          {result.tracks.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-white/40 hover:text-white/60">
                Ver tracks ({result.tracks.length})
              </summary>
              <ul className="mt-2 max-h-64 divide-y divide-white/5 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                {result.tracks.slice(0, 50).map((track) => (
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
                      <p className="truncate text-xs font-medium text-white">
                        {track.name}
                      </p>
                      <p className="truncate text-xs text-white/40">
                        {track.artist}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
