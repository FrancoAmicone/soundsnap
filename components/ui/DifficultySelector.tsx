'use client'

// =====================================================================
// SoundSnap — DifficultySelector
// =====================================================================
// Lets the user pick a difficulty before playing a challenge.
// Guests are locked to Easy. Clicking a difficulty navigates to the
// play page.
// =====================================================================

import { useRouter } from 'next/navigation'
import type { Difficulty } from '@/types'

interface DifficultySelectorProps {
  challengeId: string
  isGuest: boolean
}

const DIFFICULTIES: {
  value: Difficulty
  label: string
  description: string
  questions: number
  multiplier: string
  color: string
  lockedColor: string
  btnClass: string
}[] = [
  {
    value: 'easy',
    label: 'Easy',
    description: 'Portada visible · Opción múltiple',
    questions: 5,
    multiplier: '×1.0',
    color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    lockedColor: '',
    btnClass:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Sin portada · Artista se revela a 15s',
    questions: 7,
    multiplier: '×1.3',
    color: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    lockedColor: 'border-white/5 bg-white/[.02] text-white/20',
    btnClass:
      'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50',
  },
  {
    value: 'hard',
    label: 'Hard',
    description: 'Sin portada · Sin pistas · Artista + Título',
    questions: 10,
    multiplier: '×1.7',
    color: 'border-red-500/40 bg-red-500/10 text-red-300',
    lockedColor: 'border-white/5 bg-white/[.02] text-white/20',
    btnClass:
      'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/50',
  },
]

export default function DifficultySelector({
  challengeId,
  isGuest,
}: DifficultySelectorProps) {
  const router = useRouter()

  function handlePlay(difficulty: Difficulty) {
    if (isGuest && difficulty !== 'easy') return
    router.push(`/challenge/${challengeId}/play?difficulty=${difficulty}`)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
        Elegí una dificultad
      </p>

      {DIFFICULTIES.map((d) => {
        const locked = isGuest && d.value !== 'easy'

        return (
          <button
            key={d.value}
            type="button"
            onClick={() => handlePlay(d.value)}
            disabled={locked}
            title={locked ? 'Iniciá sesión para desbloquear' : undefined}
            className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              locked
                ? 'cursor-not-allowed border-white/5 bg-white/[.02] opacity-40'
                : d.btnClass
            }`}
          >
            {/* Label + description */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{d.label}</span>
                {locked && (
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/40">
                    🔒
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs opacity-70">{d.description}</p>
            </div>

            {/* Stats */}
            <div className="text-right text-xs opacity-60">
              <p className="font-semibold">{d.multiplier}</p>
              <p>{d.questions} preguntas</p>
            </div>

            {/* Arrow */}
            {!locked && (
              <svg
                className="ml-1 h-4 w-4 shrink-0 opacity-50"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )
      })}

      {isGuest && (
        <p className="text-center text-xs text-white/30">
          <a href="/login" className="text-indigo-400 hover:underline">
            Iniciá sesión
          </a>{' '}
          para desbloquear Intermediate y Hard.
        </p>
      )}
    </div>
  )
}
