'use client'

// =====================================================================
// SoundSnap — IntermediateQuestion
// =====================================================================
// Intermediate difficulty: free-text input for the song TITLE only.
// A hint is revealed at 15s remaining (client-side only, no API call,
// no scoring penalty). What the hint is depends on track.revealKind:
//
//   'artist' (playlist/manual origin): the artist name is hidden until
//             15s, then revealed.
//   'cover'  (artist/party/mix origin): the artist is already known
//             (shown up top when `knownArtist` is set), so instead the
//             album COVER is hidden until 15s, then revealed.
// =====================================================================

import { useState, useEffect, useRef } from 'react'
import type { ClientTrack } from '@/types'

interface IntermediateQuestionProps {
  track: ClientTrack
  startedAt: number
  /** Becomes true when the timer drops to 15s. */
  revealed: boolean
  onAnswer: (userTitle: string, timeTakenMs: number, hintShown: boolean) => void
  disabled?: boolean
  /** Pre-known artist (artist-type challenge / party round). Shown up front. */
  knownArtist?: string
}

export default function IntermediateQuestion({
  track,
  startedAt,
  revealed,
  onAnswer,
  disabled = false,
  knownArtist,
}: IntermediateQuestionProps) {
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const revealKind = track.revealKind ?? 'artist'
  // A hint counts as "shown" once the cover/artist is revealed, or when the
  // artist was known from the start. Sent to the server for analytics only.
  const hintShown = knownArtist != null || revealed
  const displayArtist = knownArtist ?? track.artist

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled || submitted || !value.trim()) return
    setSubmitted(true)
    const timeTakenMs = Date.now() - startedAt
    onAnswer(value.trim(), timeTakenMs, hintShown)
  }

  return (
    <div className="w-full max-w-sm space-y-5">
      {/* Known artist (party / artist challenge): always shown up top */}
      {knownArtist ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-300">
          <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-amber-400/70">
            Artista
          </span>
          <span className="font-semibold">{knownArtist}</span>
        </div>
      ) : null}

      {/* Hint block: artist reveal (playlist) OR cover reveal (artist/mix) */}
      {revealKind === 'artist' && !knownArtist ? (
        <div
          className={`rounded-xl border px-4 py-3 text-center text-sm transition-all duration-500 ${
            revealed
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              : 'border-white/5 bg-white/[.02] text-white/20'
          }`}
        >
          {revealed ? (
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
      ) : null}

      {revealKind === 'cover' ? (
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-32 w-32 overflow-hidden rounded-xl border border-white/10 bg-white/[.03]">
            {revealed && track.coverUrl ? (
              <img
                src={track.coverUrl}
                alt="Portada del álbum"
                className="h-full w-full object-cover transition-opacity duration-500"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
                <span className="text-2xl opacity-20">♪</span>
                <span className="text-[10px] leading-tight text-white/25">
                  La portada se revela a los 15&nbsp;s
                </span>
              </div>
            )}
          </div>
        </div>
      ) : null}

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
