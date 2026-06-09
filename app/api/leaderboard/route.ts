// =====================================================================
// SoundSnap — GET /api/leaderboard
// =====================================================================
// Returns top 15 scores for a given challengeId + difficulty.
// Uses the service client so it can read from game_sessions regardless
// of the requester's auth state (the leaderboard is public data).
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const challengeId = searchParams.get('challengeId')
  const difficulty = searchParams.get('difficulty')

  if (
    !challengeId ||
    !['easy', 'intermediate', 'hard'].includes(difficulty ?? '')
  ) {
    return NextResponse.json(
      { error: 'Missing or invalid challengeId / difficulty.' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('leaderboard')
    .select(
      'rank, username, avatar_url, score, correct_answers, total_questions, duration_ms',
    )
    .eq('challenge_id', challengeId)
    .eq('difficulty', difficulty)
    .order('rank', { ascending: true })
    .limit(15)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rows: data ?? [] })
}
