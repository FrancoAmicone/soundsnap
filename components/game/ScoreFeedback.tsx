'use client'

// =====================================================================
// SoundSnap — ScoreFeedback
// =====================================================================
// Shown between questions after the user answers (or times out).
// Reveals the correct answer, shows points earned, and has a "Next"
// button to advance to the next question (or finish).
// Enter or Space also trigger the next action.
// =====================================================================

import { useEffect } from 'react'
import type { Difficulty } from '@/types'

interface ScoreFeedbackProps {
  isCorrect: boolean
  pointsEarned: number
  correctTitle: string
  correctArtist: string
  /** Hard mode per-field feedback */
  artistOk?: boolean
  titleOk?: boolean
  trackIndex: number
  totalQuestions: number
  difficulty: Difficulty
  onNext: () => void
}

export default function ScoreFeedback({
  isCorrect,
  pointsEarned,
  correctTitle,
  correctArtist,
  artistOk,
  titleOk,
  trackIndex,
  totalQuestions,
  difficulty,
  onNext,
}: ScoreFeedbackProps) {
  const isLast = trackIndex + 1 >= totalQuestions

  // Enter / Space advance to the next question
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onNext])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm space-y-6">
        {/* Result indicator */}
        <div className="flex flex-col items-center gap-3">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
              isCorrect
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {isCorrect ? '✓' : '✗'}
          </div>

          <p
            className={`text-lg font-semibold ${
              isCorrect ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {isCorrect ? '¡Correcto!' : 'Incorrecto'}
          </p>
        </div>

        {/* Points */}
        {pointsEarned > 0 && (
          <div className="text-center">
            <span className="text-5xl font-bold text-white">
              +{pointsEarned}
            </span>
            <span className="ml-1 text-sm text-white/50">pts</span>
          </div>
        )}

        {/* Correct answer reveal */}
        <div className="rounded-xl border border-white/10 bg-white/[.04] px-5 py-4 text-center">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/30">
            La canción era
          </p>
          <p className="text-lg font-bold text-white">{correctTitle}</p>
          <p className="mt-0.5 text-sm text-white/60">{correctArtist}</p>
        </div>

        {/* Hard mode per-field breakdown */}
        {difficulty === 'hard' && !isCorrect && (
          <div className="flex gap-3 text-sm">
            <div
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 ${
                artistOk
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              <span>{artistOk ? '✓' : '✗'}</span>
              <span>Artista</span>
            </div>
            <div
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 ${
                titleOk
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              <span>{titleOk ? '✓' : '✗'}</span>
              <span>Título</span>
            </div>
          </div>
        )}

        {/* Progress */}
        <p className="text-center text-sm text-white/30">
          Pregunta {trackIndex + 1} de {totalQuestions}
        </p>

        {/* Next / Finish */}
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {isLast ? 'Ver resultado final' : 'Siguiente →'}
        </button>
      </div>
    </div>
  )
}
