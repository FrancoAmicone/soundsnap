'use client'

// =====================================================================
// SoundSnap — IntermediateQuestion
// =====================================================================
// Intermediate difficulty: no album cover, free-text input for the
// song TITLE only. The artist name is revealed at 15s remaining
// (client-side only, no API call, no scoring penalty).
// =====================================================================

import { useState, useEffect, useRef } from 'react'
import type { ClientTrack } from '@/types'

interface IntermediateQuestionProps {
  track: ClientTrack
  startedAt: number
  /** Passed down from Timer: when timeLeft drops to 15 this becomes true. */
  artistRevealed: boolean
  onAnswer: (userTitle: string, timeTakenMs: number, artistRevealed: boolean) => void
  disabled?: boolean
  /** Pre-known artist (artist-type challenge). Show immediately, skip countdown. */
  knownArtist?: string
}

export default function IntermediateQuestion({
  track,
  startedAt,
  artistRevealed,
  onAnswer,
  disabled = false,
  knownArtist,
}: IntermediateQuestionProps) {
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // When the artist is known up front, it's always "revealed"
  const isRevealed = knownArtist != null || artistRevealed
  const displayArtist = knownArtist ?? track.artist

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled || submitted || !value.trim()) return
    setSubmitted(true)
    const timeTakenMs = Date.now() - startedAt
    onAnswer(value.trim(), timeTakenMs, isRevealed)
  }

  return (
    <div className="w-full max-w-sm space-y-5">
      {/* Artist reveal banner */}
      <div
        className={`rounded-xl border px-4 py-3 text-center text-sm transition-all duration-500 ${
          isRevealed
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            : 'border-white/5 bg-white/[.02] text-white/20'
        }`}
      >
        {isRevealed ? (
          <>
            <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-amber-400/70">
              Artista
            </span>
            <span className="font-semibold">{displayArtist}</span>
          </>
        ) : (
          <span>El artista se revela a los 15&nbsp;s</span>
        )}
      </div>

      {/* Title input */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="song-title"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/30"
          >
            ¿Cuál es el título?
          </label>
          <input
            ref={inputRef}
            id="song-title"
            type="text"
            placeholder="Escribí el nombre de la canción…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled || submitted}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-40"
          />
        </div>

        <button
          type="submit"
          disabled={disabled || submitted || !value.trim()}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {submitted ? 'Respondido' : 'Confirmar'}
        </button>
      </form>
    </div>
  )
}
