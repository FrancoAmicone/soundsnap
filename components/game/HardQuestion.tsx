'use client'

// =====================================================================
// SoundSnap — HardQuestion
// =====================================================================
// Hard difficulty: no cover, no hints. Player must write the title.
// If knownArtist is provided (artist-type challenge), the artist field
// is hidden and pre-filled automatically — asking for it would be
// giving away the answer since the user already knows who they're
// playing.
// =====================================================================

import { useState, useEffect, useRef } from 'react'

interface HardQuestionProps {
  trackId: string
  startedAt: number
  onAnswer: (userArtist: string, userTitle: string, timeTakenMs: number) => void
  disabled?: boolean
  /** Pre-known artist (artist-type challenge). Hides the artist field. */
  knownArtist?: string
}

export default function HardQuestion({
  trackId,
  startedAt,
  onAnswer,
  disabled = false,
  knownArtist,
}: HardQuestionProps) {
  const [artist, setArtist] = useState(knownArtist ?? '')
  const [title, setTitle] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const artistRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus artist input if shown, otherwise title
    if (knownArtist) {
      titleRef.current?.focus()
    } else {
      artistRef.current?.focus()
    }
  }, [knownArtist])

  // Reset when track changes
  useEffect(() => {
    setArtist(knownArtist ?? '')
    setTitle('')
    setSubmitted(false)
    setTimeout(() => {
      if (knownArtist) {
        titleRef.current?.focus()
      } else {
        artistRef.current?.focus()
      }
    }, 50)
  }, [trackId, knownArtist])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const artistVal = knownArtist ?? artist
    if (disabled || submitted || !artistVal.trim() || !title.trim()) return
    setSubmitted(true)
    const timeTakenMs = Date.now() - startedAt
    onAnswer(artistVal.trim(), title.trim(), timeTakenMs)
  }

  const canSubmit = !disabled && !submitted && title.trim() && (knownArtist || artist.trim())

  return (
    <div className="w-full max-w-sm space-y-5">
      {/* Header banner */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-center">
        {knownArtist ? (
          <span className="text-xs font-semibold uppercase tracking-widest text-red-400/70">
            Hard — adiviná el título
          </span>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-widest text-red-400/70">
            Hard — sin pistas
          </span>
        )}
      </div>

      {/* Known artist pill (replaces the input) */}
      {knownArtist && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400/60">
            Artista
          </span>
          <span className="ml-auto font-semibold text-indigo-300">{knownArtist}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Artist input — only shown when artist is NOT pre-known */}
        {!knownArtist && (
          <div>
            <label
              htmlFor="hard-artist"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/30"
            >
              Artista
            </label>
            <input
              ref={artistRef}
              id="hard-artist"
              type="text"
              placeholder="Nombre del artista o banda…"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              disabled={disabled || submitted}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-red-500/60 focus:outline-none focus:ring-1 focus:ring-red-500/60 disabled:opacity-40"
            />
          </div>
        )}

        {/* Title input — always shown */}
        <div>
          <label
            htmlFor="hard-title"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/30"
          >
            Título de la canción
          </label>
          <input
            ref={titleRef}
            id="hard-title"
            type="text"
            placeholder="Título exacto de la canción…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={disabled || submitted}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-red-500/60 focus:outline-none focus:ring-1 focus:ring-red-500/60 disabled:opacity-40"
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          {submitted ? 'Respondido' : 'Confirmar'}
        </button>
      </form>
    </div>
  )
}
