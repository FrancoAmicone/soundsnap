// =====================================================================
// SoundSnap — POST /api/session/answer
// =====================================================================
// Validates one answer (Easy / Intermediate / Hard) against the
// server-held snapshot in `game_sessions.tracks_data`, persists a row
// in `session_answers`, and replies with the verdict + raw points.
//
// The multiplier is NOT applied here — that's the job of /complete.
// We persist `points_earned` raw so analytics can reason about the
// per-question performance independently of the difficulty.
//
// Authorization rules:
//   - Logged-in user: session.user_id MUST equal auth.uid().
//   - Guest: session.user_id MUST be NULL (and the original /start
//     enforced that the challenge accepts guests).
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isCorrectAnswer, validateHardAnswer } from '@/lib/matchAnswer'
import { calcQuestionPoints } from '@/lib/scoring'
import type {
  AnswerRequest,
  AnswerResponse,
  ApiError,
  Difficulty,
  ServerTrack,
  SessionTracksData,
} from '@/types'

export const dynamic = 'force-dynamic'

const VALID_DIFFICULTIES: readonly Difficulty[] = [
  'easy',
  'intermediate',
  'hard',
]

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

interface SessionRow {
  id: string
  user_id: string | null
  difficulty: Difficulty
  completed_at: string | null
  tracks_data: SessionTracksData | null
}

function findTrack(
  data: SessionTracksData | null,
  trackId: string,
): ServerTrack | null {
  if (!data || !Array.isArray(data.tracks)) return null
  return data.tracks.find((t) => t.trackId === trackId) ?? null
}

export async function POST(request: NextRequest) {
  let body: Partial<AnswerRequest>
  try {
    body = (await request.json()) as Partial<AnswerRequest>
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  const { sessionId, trackId, difficulty, timeTakenMs } = body as {
    sessionId?: unknown
    trackId?: unknown
    difficulty?: unknown
    timeTakenMs?: unknown
  }

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return jsonError('sessionId is required', 400, 'session_required')
  }
  if (typeof trackId !== 'string' || trackId.length === 0) {
    return jsonError('trackId is required', 400, 'track_required')
  }
  if (
    typeof difficulty !== 'string' ||
    !VALID_DIFFICULTIES.includes(difficulty as Difficulty)
  ) {
    return jsonError('difficulty is required', 400, 'invalid_difficulty')
  }
  if (typeof timeTakenMs !== 'number' || !Number.isFinite(timeTakenMs)) {
    return jsonError('timeTakenMs must be a number', 400, 'invalid_time')
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const admin = createServiceClient()

  // ---------------------------------------------------------------------
  // Load session + verify ownership
  // ---------------------------------------------------------------------
  const { data: sessionRaw, error: sessionErr } = await admin
    .from('game_sessions')
    .select('id, user_id, difficulty, completed_at, tracks_data')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionErr) {
    console.error('[session/answer] session lookup failed', sessionErr)
    return jsonError('Failed to load session', 500, 'session_lookup_failed')
  }
  if (!sessionRaw) {
    return jsonError('Session not found', 404, 'session_not_found')
  }
  const session = sessionRaw as unknown as SessionRow

  if (session.completed_at) {
    return jsonError(
      'Session is already completed',
      409,
      'session_already_completed',
    )
  }
  if (session.user_id !== userId) {
    // Either a logged-in user is touching another user's session, or a
    // guest is touching a logged-in session. Both are rejected.
    return jsonError('Forbidden', 403, 'session_forbidden')
  }
  if (session.difficulty !== difficulty) {
    return jsonError(
      'Difficulty mismatch with session',
      400,
      'difficulty_mismatch',
    )
  }

  // ---------------------------------------------------------------------
  // Locate the track in the server snapshot
  // ---------------------------------------------------------------------
  const track = findTrack(session.tracks_data, trackId)
  if (!track) {
    return jsonError('Track not in session', 404, 'track_not_found')
  }

  // ---------------------------------------------------------------------
  // Per-difficulty validation
  // ---------------------------------------------------------------------
  let isCorrect = false
  let titleCorrect: boolean | null = null
  let artistCorrect: boolean | null = null
  let mcAnswerIndex: number | null = null
  let userTitle: string | null = null
  let userArtist: string | null = null
  let artistRevealed = false

  if (difficulty === 'easy') {
    const idx = (body as { mcAnswerIndex?: unknown }).mcAnswerIndex
    if (typeof idx !== 'number' || !Number.isInteger(idx)) {
      return jsonError(
        'mcAnswerIndex must be an integer',
        400,
        'invalid_mc_index',
      )
    }
    if (
      !track.mcOptions ||
      track.mcCorrectIndex === null ||
      idx < 0 ||
      idx >= track.mcOptions.length
    ) {
      return jsonError('Invalid MC option', 400, 'invalid_mc_index')
    }
    mcAnswerIndex = idx
    isCorrect = idx === track.mcCorrectIndex
    titleCorrect = isCorrect
  } else if (difficulty === 'intermediate') {
    const value = (body as { userTitle?: unknown }).userTitle
    if (typeof value !== 'string') {
      return jsonError('userTitle is required', 400, 'invalid_user_title')
    }
    userTitle = value
    const ok = isCorrectAnswer(value, track.correctTitle)
    titleCorrect = ok
    isCorrect = ok
    const reveal = (body as { artistRevealed?: unknown }).artistRevealed
    artistRevealed = reveal === true
  } else {
    // hard
    const a = (body as { userArtist?: unknown }).userArtist
    const t = (body as { userTitle?: unknown }).userTitle
    if (typeof a !== 'string' || typeof t !== 'string') {
      return jsonError(
        'userArtist and userTitle are required for hard mode',
        400,
        'invalid_hard_input',
      )
    }
    userArtist = a
    userTitle = t
    const verdict = validateHardAnswer(
      a,
      track.correctArtist,
      t,
      track.correctTitle,
    )
    artistCorrect = verdict.artistOk
    titleCorrect = verdict.titleOk
    isCorrect = verdict.isCorrect
  }

  // ---------------------------------------------------------------------
  // Score (raw — no multiplier yet)
  // ---------------------------------------------------------------------
  const pointsEarned = calcQuestionPoints(isCorrect, timeTakenMs, difficulty)

  // ---------------------------------------------------------------------
  // Persist the answer row
  // ---------------------------------------------------------------------
  const { error: insertErr } = await admin.from('session_answers').insert({
    session_id: session.id,
    deezer_track_id: track.trackId,
    difficulty,
    mc_answer_index: mcAnswerIndex,
    mc_correct_index:
      difficulty === 'easy' ? track.mcCorrectIndex ?? null : null,
    user_title: userTitle,
    title_correct: titleCorrect,
    user_artist: userArtist,
    artist_correct: artistCorrect,
    is_correct: isCorrect,
    time_taken_ms: Math.max(0, Math.round(timeTakenMs)),
    artist_revealed: artistRevealed,
    points_earned: pointsEarned,
  })

  if (insertErr) {
    console.error('[session/answer] insert failed', insertErr)
    return jsonError('Failed to save answer', 500, 'answer_insert_failed')
  }

  const response: AnswerResponse = {
    isCorrect,
    pointsEarned,
    correctTitle: track.correctTitle,
    correctArtist: track.correctArtist,
    ...(difficulty === 'hard'
      ? {
          artistOk: artistCorrect ?? false,
          titleOk: titleCorrect ?? false,
        }
      : {}),
  }
  return NextResponse.json(response)
}
