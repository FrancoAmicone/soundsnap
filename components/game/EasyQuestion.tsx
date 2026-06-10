'use client'

// =====================================================================
// SoundSnap — EasyQuestion
// =====================================================================
// Easy difficulty: shows the album cover + 4 multiple-choice buttons.
// The correct answer index lives server-side. We only know the 4
// option strings (mcOptions) and send back the index the user clicked.
// =====================================================================

import { useState } from 'react'
import type { ClientTrack } from '@/types'

interface EasyQuestionProps {
  track: ClientTrack
  startedAt: number
  onAnswer: (mcAnswerIndex: number, timeTakenMs: number) => void
  disabled?: boolean
}

export default function EasyQuestion({
  track,
  startedAt,
  onAnswer,
  disabled = false,
}: EasyQuestionProps) {
  const [selected, setSelected] = useState<number | null>(null)

  function handleSelect(index: number) {
    if (disabled || selected !== null) return
    setSelected(index)
    const timeTakenMs = Date.now() - startedAt
    onAnswer(index, timeTakenMs)
  }

  const options = track.mcOptions ?? []

  return (
    <div className="w-full max-w-sm space-y-5">
      {/* Album cover */}
      {track.coverUrl ? (
        <div className="overflow-hidden rounded-2xl">
          <img
            src={track.coverUrl}
            alt="Album cover"
            className="h-44 w-full object-cover sm:h-56"
          />
        </div>
      ) : (
        <div className="flex h-44 items-center justify-center rounded-2xl bg-white/5 sm:h-56">
          <span className="text-5xl opacity-20">♪</span>
        </div>
      )}

      {/* MC options */}
      <div className="space-y-2.5">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-white/30">
          ¿Cuál es la canción?
        </p>
        {options.map((option, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelect(i)}
            disabled={disabled || selected !== null}
            className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              selected === i
                ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                : selected !== null
                  ? 'cursor-default border-white/5 bg-white/[.02] text-white/30'
                  : 'cursor-pointer border-white/10 bg-white/[.04] text-white hover:border-white/20 hover:bg-white/10'
            }`}
          >
            <span className="mr-3 inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs opacity-50">
              {String.fromCharCode(65 + i)}
            </span>
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
