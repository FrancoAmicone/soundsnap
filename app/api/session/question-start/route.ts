// =====================================================================
// SoundSnap — POST /api/session/question-start
// =====================================================================
// Records (server-side) the moment a question's audio started, so the
// /answer route can score using a trusted clock instead of the client's
// self-reported timeTakenMs.
//
// The insert is write-once per (session, track): re-tries are ignored so
// a client cannot reset its own clock by re-pinging.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { ApiError, QuestionStartRequest } from '@/types'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function POST(request: NextRequest) {
  let body: Partial<QuestionStartRequest>
  try {
    body = (await request.json()) as Partial<QuestionStartRequest>
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  const { sessionId, trackId } = body
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return jsonError('sessionId is required', 400, 'session_required')
  }
  if (typeof trackId !== 'string' || trackId.length === 0) {
    return jsonError('trackId is required', 400, 'track_required')
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const admin = createServiceClient()

  // Verify ownership (same rule as /answer).
  const { data: sessionRaw } = await admin
    .from('game_sessions')
    .select('id, user_id, completed_at')
    .eq('id', sessionId)
    .maybeSingle()
  const session = sessionRaw as
    | { id: string; user_id: string | null; completed_at: string | null }
    | null

  if (!session) return jsonError('Session not found', 404, 'session_not_found')
  if (session.user_id !== userId) {
    return jsonError('Forbidden', 403, 'session_forbidden')
  }
  if (session.completed_at) {
    return jsonError('Session already completed', 409, 'session_already_completed')
  }

  // Write-once: ignore if a start already exists for this (session, track).
  const { error } = await admin
    .from('session_question_starts')
    .upsert(
      { session_id: sessionId, track_id: trackId },
      { onConflict: 'session_id,track_id', ignoreDuplicates: true },
    )

  if (error) {
    console.error('[session/question-start] upsert failed', error)
    return jsonError('Failed to record question start', 500, 'start_insert_failed')
  }

  return NextResponse.json({ ok: true })
}
