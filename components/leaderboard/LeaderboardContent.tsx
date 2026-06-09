'use client'

// =====================================================================
// SoundSnap — LeaderboardContent
// =====================================================================
// Client Component that fetches leaderboard data via the API route
// (which uses the service client to bypass RLS). Renders a loading
// state while fetching and gracefully handles errors.
// =====================================================================

import { useEffect, useState } from 'react'
import type { Difficulty } from '@/types'

interface LeaderboardRow {
  rank: number
  username: string
  avatar_url: string | null
  score: number
  correct_answers: number
  total_questions: number
  duration_ms: number
}

interface LeaderboardContentProps {
  challengeId: string
  difficulty: Difficulty
}

export default function LeaderboardContent({
  challengeId,
  difficulty,
}: LeaderboardContentProps) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setRows(null)
    setError(false)

    fetch(
      `/api/leaderboard?challengeId=${encodeURIComponent(challengeId)}&difficulty=${difficulty}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setRows(data.rows ?? [])
      })
      .catch(() => setError(true))
  }, [challengeId, difficulty])

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-white/30">
        No se pudo cargar el leaderboard.
      </p>
    )
  }

  if (rows === null) {
    return (
      <div className="space-y-2 py-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-xl bg-white/5"
          />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-4xl opacity-10">🏆</p>
        <p className="mt-3 text-sm text-white/30">
          Todavía no hay scores.{' '}
          <span className="text-white/50">¡Sé el primero!</span>
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
      {rows.map((row, i) => (
        <div
          key={row.username + i}
          className={`flex items-center gap-4 px-4 py-3 ${
            i === 0 ? 'bg-amber-500/5' : 'bg-white/[.015]'
          }`}
        >
          {/* Rank */}
          <span
            className={`w-7 shrink-0 text-center font-mono text-sm font-bold ${
              row.rank === 1
                ? 'text-amber-400'
                : row.rank === 2
                  ? 'text-zinc-300'
                  : row.rank === 3
                    ? 'text-amber-700'
                    : 'text-white/30'
            }`}
          >
            {row.rank === 1
              ? '🥇'
              : row.rank === 2
                ? '🥈'
                : row.rank === 3
                  ? '🥉'
                  : `#${row.rank}`}
          </span>

          {/* Avatar */}
          {row.avatar_url ? (
            <img
              src={row.avatar_url}
              alt={row.username}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 text-xs font-bold text-indigo-300">
              {row.username[0]?.toUpperCase()}
            </div>
          )}

          {/* Username */}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
            {row.username}
          </span>

          {/* Accuracy */}
          <span className="hidden text-xs text-white/30 sm:block">
            {row.correct_answers}/{row.total_questions}
          </span>

          {/* Time */}
          <span className="hidden text-xs text-white/30 sm:block">
            {Math.round(row.duration_ms / 1000)}s
          </span>

          {/* Score */}
          <span className="font-mono text-sm font-bold text-white">
            {row.score.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}
