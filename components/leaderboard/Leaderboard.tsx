// =====================================================================
// SoundSnap — Leaderboard
// =====================================================================
// Server Component. Fetches the top 15 scores for a specific challenge
// + difficulty combo from the `leaderboard` view and renders a table.
// =====================================================================

import { createClient } from '@/lib/supabase/server'
import type { Difficulty } from '@/types'

interface LeaderboardProps {
  challengeId: string
  difficulty: Difficulty
}

interface LeaderboardRow {
  username: string
  avatar_url: string | null
  score: number
  correct_answers: number
  total_questions: number
  duration_ms: number
  rank: number
}

export default async function Leaderboard({
  challengeId,
  difficulty,
}: LeaderboardProps) {
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('leaderboard')
    .select(
      'username, avatar_url, score, correct_answers, total_questions, duration_ms, rank',
    )
    .eq('challenge_id', challengeId)
    .eq('difficulty', difficulty)
    .order('rank', { ascending: true })
    .limit(15)

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-white/30">
        No se pudo cargar el leaderboard.
      </p>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-4xl opacity-10">🏆</p>
        <p className="mt-3 text-sm text-white/30">
          Todavía no hay scores para esta dificultad.{' '}
          <span className="text-white/50">¡Sé el primero!</span>
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
      {(rows as LeaderboardRow[]).map((row, i) => (
        <div
          key={row.username + i}
          className={`flex items-center gap-4 px-4 py-3 ${
            i === 0 ? 'bg-amber-500/5' : 'bg-white/[.015]'
          }`}
        >
          {/* Rank */}
          <span
            className={`w-7 text-center font-mono text-sm font-bold ${
              row.rank === 1
                ? 'text-amber-400'
                : row.rank === 2
                  ? 'text-zinc-300'
                  : row.rank === 3
                    ? 'text-amber-700'
                    : 'text-white/30'
            }`}
          >
            {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
          </span>

          {/* Avatar */}
          {row.avatar_url ? (
            <img
              src={row.avatar_url}
              alt={row.username}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full bg-indigo-600/30 text-center text-xs leading-8 text-indigo-300">
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
