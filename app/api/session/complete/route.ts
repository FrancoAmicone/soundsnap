// =====================================================================
// SoundSnap — POST /api/session/complete
// =====================================================================
// Finalises a session by:
//   1. Summing all `session_answers.points_earned` for that session.
//   2. Applying the difficulty multiplier (×1.0 / ×1.3 / ×1.7).
//   3. Computing duration as (now - game_sessions.created_at).
//   4. Updating `game_sessions` with `score`, `correct_answers`,
//      `duration_ms`, `completed_at`.
//
// For guest sessions (user_id NULL) we still update the row so the
// player can see their breakdown in the UI, but the row will not
// appear on the leaderboard view (which filters user_id IS NULL out).
//
// Idempotency: if the session is already completed we return the
// existing breakdown instead of erroring, so a noisy network does not
// cause double scoring.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcFinalScore, getMultiplier } from '@/lib/scoring'
import type {
  ApiError,
  Difficulty,
  SessionCompleteRequest,
  SessionCompleteResponse,
} from '@/types'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

interface SessionRow {
  id: string
  user_id: string | null
  difficulty: Difficulty
  total_questions: number
  created_at: string
  completed_at: string | null
  score: number
  correct_answers: number
  duration_ms: number | null
}

export async function POST(request: NextRequest) {
  let body: Partial<SessionCompleteRequest>
  try {
    body = (await request.json()) as Partial<SessionCompleteRequest>
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  const sessionId = body.sessionId
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return jsonError('sessionId is required', 400, 'session_required')
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const admin = createServiceClient()

  const { data: sessionRaw, error: sessionErr } = await admin
    .from('game_sessions')
    .select(
      'id, user_id, difficulty, total_questions, created_at, completed_at, ' +
        'score, correct_answers, duration_ms',
    )
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionErr) {
    console.error('[session/complete] session lookup failed', sessionErr)
    return jsonError('Failed to load session', 500, 'session_lookup_failed')
  }
  if (!sessionRaw) {
    return jsonError('Session not found', 404, 'session_not_found')
  }
  const session = sessionRaw as unknown as SessionRow

  if (session.user_id !== userId) {
    return jsonError('Forbidden', 403, 'session_forbidden')
  }

  // Idempotent path: already completed → return existing summary.
  if (session.completed_at) {
    const response: SessionCompleteResponse = {
      sessionId: session.id,
      difficulty: session.difficulty,
      totalQuestions: session.total_questions,
      correctAnswers: session.correct_answers,
      // The multiplier was already applied; we cannot recover the raw
      // sum without re-querying answers, but the score is what matters
      // for the UI. Re-derive raw from final to keep the contract.
      rawPoints: Math.round(session.score / getMultiplier(session.difficulty)),
      finalScore: session.score,
      durationMs: session.duration_ms ?? 0,
      saved: session.user_id !== null,
    }
    return NextResponse.json(response)
  }

  // ---------------------------------------------------------------------
  // Sum the answers
  // ---------------------------------------------------------------------
  const { data: answers, error: answersErr } = await admin
    .from('session_answers')
    .select('points_earned, is_correct')
    .eq('session_id', session.id)

  if (answersErr) {
    console.error('[session/complete] answers lookup failed', answersErr)
    return jsonError('Failed to load answers', 500, 'answers_lookup_failed')
  }

  const points = (answers ?? []).map((a) => a.points_earned ?? 0)
  const correctCount = (answers ?? []).filter((a) => a.is_correct).length
  const rawPoints = points.reduce((sum, p) => sum + p, 0)
  const finalScore = calcFinalScore(points, session.difficulty)

  const completedAt = new Date()
  const durationMs = Math.max(
    0,
    completedAt.getTime() - new Date(session.created_at).getTime(),
  )

  // ---------------------------------------------------------------------
  // Persist the final state
  // ---------------------------------------------------------------------
  const { error: updateErr } = await admin
    .from('game_sessions')
    .update({
      score: finalScore,
      correct_answers: correctCount,
      duration_ms: durationMs,
      completed_at: completedAt.toISOString(),
    })
    .eq('id', session.id)

  if (updateErr) {
    console.error('[session/complete] update failed', updateErr)
    return jsonError(
      'Failed to finalise session',
      500,
      'session_update_failed',
    )
  }

  const response: SessionCompleteResponse = {
    sessionId: session.id,
    difficulty: session.difficulty,
    totalQuestions: session.total_questions,
    correctAnswers: correctCount,
    rawPoints,
    finalScore,
    durationMs,
    saved: session.user_id !== null,
  }
  return NextResponse.json(response)
}
