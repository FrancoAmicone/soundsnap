// =====================================================================
// SoundSnap — POST /api/session/start
// =====================================================================
// Creates a new game session. Accepts two variants:
//
//   { challengeId, difficulty }
//     → Play a pre-created challenge. Supports three track sources:
//       'playlist' — fetch from Deezer playlist + merge pinned_tracks
//                    - apply excluded_track_ids
//       'manual'   — use pinned_tracks directly (no Deezer call)
//       'artist'   — fetch from Deezer artist top tracks
//                    - apply excluded_track_ids
//
//   { artistId, artistName, difficulty }
//     → Ephemeral "play by artist" session. A persistent artist challenge
//       row is found or created so the leaderboard works.
//
// Common flow after track resolution:
//   1. Sample N tracks per difficulty.
//   2. Build MC decoys for Easy.
//   3. Persist server-side snapshot in game_sessions.tracks_data.
//   4. Return only safe per-track payload to the client.
//
// Track resolution + the "what is safe to expose" rules live in
// lib/tracks.ts so they can be reused by party mode (lib/party.ts).
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_QUESTION_COUNT } from '@/lib/scoring'
import {
  buildClientTrack,
  buildServerTracks,
  computeFetchLimit,
  resolveChallengeTracks,
  shuffle,
  TRACK_COUNT_COLUMN,
  type ChallengeRow,
} from '@/lib/tracks'
import type {
  ApiError,
  DeezerTrack,
  Difficulty,
  SessionStartRequest,
  SessionStartResponse,
  SessionTracksData,
  TrackOrigin,
} from '@/types'

export const dynamic = 'force-dynamic'

const VALID_DIFFICULTIES: readonly Difficulty[] = [
  'easy',
  'intermediate',
  'hard',
]

const CHALLENGE_SELECT =
  'id, is_active, is_guest_allowed, challenge_type, ' +
  'deezer_playlist_id, deezer_artist_id, pinned_tracks, excluded_track_ids, ' +
  'track_count_easy, track_count_medium, track_count_hard'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

/** Intermediate reveal origin for a challenge: artist-type reveals the cover. */
function originForChallenge(challenge: ChallengeRow): TrackOrigin {
  return challenge.challenge_type === 'artist' ? 'artist' : 'playlist'
}

// -------------------------------------------------------------------------
// Route handler
// -------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: Partial<
    SessionStartRequest & {
      challengeId?: string
      artistId?: string
      artistName?: string
    }
  >
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  const { difficulty } = body
  if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty as Difficulty)) {
    return jsonError(
      'difficulty must be easy | intermediate | hard',
      400,
      'invalid_difficulty',
    )
  }
  const diff = difficulty as Difficulty

  // -- Identify the caller (may be null for guests) ----------------------
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const admin = createServiceClient()

  // -----------------------------------------------------------------------
  // BRANCH A: "Play by artist" — find or create a persistent challenge
  // -----------------------------------------------------------------------
  if ('artistId' in body && body.artistId) {
    const { artistId, artistName } = body as {
      artistId: string
      artistName: string
      difficulty: Difficulty
    }

    if (!artistName || typeof artistName !== 'string') {
      return jsonError('artistName is required', 400, 'artist_name_required')
    }
    if (!userId && diff !== 'easy') {
      return jsonError(
        'Guests can only play easy difficulty',
        403,
        'guest_difficulty_locked',
      )
    }

    // ── Find or create the challenge row for this artist ──────────────
    const { data: existingRow } = await admin
      .from('challenges')
      .select(CHALLENGE_SELECT)
      .eq('deezer_artist_id', artistId)
      .eq('challenge_type', 'artist')
      .eq('is_active', true)
      .maybeSingle()

    let challenge: ChallengeRow

    if (existingRow) {
      challenge = existingRow as unknown as ChallengeRow
    } else {
      // Auto-create: fetch artist cover from Deezer
      let coverUrl: string | null = null
      try {
        const res = await fetch(`https://api.deezer.com/artist/${artistId}`)
        const data = (await res.json()) as { picture_big?: string }
        coverUrl = data.picture_big ?? null
      } catch {
        // Non-fatal: continue without a cover image
      }

      const { data: newRow, error: createErr } = await admin
        .from('challenges')
        .insert({
          title: artistName,
          challenge_type: 'artist',
          deezer_artist_id: artistId,
          cover_image_url: coverUrl,
          is_guest_allowed: true,
          is_active: true,
          track_count_easy: 5,
          track_count_medium: 7,
          track_count_hard: 10,
        })
        .select(CHALLENGE_SELECT)
        .single()

      if (createErr || !newRow) {
        console.error('[session/start] auto-create challenge failed', createErr)
        return jsonError(
          'Failed to create artist challenge',
          500,
          'challenge_create_failed',
        )
      }
      challenge = newRow as unknown as ChallengeRow
    }

    const requestedCount =
      (challenge[TRACK_COUNT_COLUMN[diff]] as number | null) ??
      DEFAULT_QUESTION_COUNT[diff]
    const fetchLimit = computeFetchLimit(requestedCount)

    let tracks: DeezerTrack[]
    try {
      tracks = await resolveChallengeTracks(challenge, fetchLimit)
    } catch (err) {
      console.error('[session/start] artist track fetch failed', err)
      return jsonError(
        'Could not reach the music provider. Try again in a moment.',
        502,
        'provider_unavailable',
      )
    }

    if (tracks.length < requestedCount) {
      return jsonError(
        `Artist has ${tracks.length} playable tracks but ${requestedCount} are required for this difficulty`,
        422,
        'insufficient_tracks',
      )
    }

    const sampled = shuffle(tracks.slice()).slice(0, requestedCount)
    const serverTracks = buildServerTracks(diff, sampled, tracks)
    const tracksData: SessionTracksData = {
      tracks: serverTracks,
      createdAt: new Date().toISOString(),
    }

    const { data: session, error: insertErr } = await admin
      .from('game_sessions')
      .insert({
        challenge_id: challenge.id,
        user_id: userId,
        difficulty: diff,
        total_questions: serverTracks.length,
        tracks_data: tracksData,
        ephemeral_artist_id: artistId,
        ephemeral_artist_name: artistName,
      })
      .select('id')
      .single()

    if (insertErr || !session) {
      console.error('[session/start] artist session insert failed', insertErr)
      return jsonError('Failed to start session', 500, 'session_insert_failed')
    }

    // Play-by-artist → artist is known → reveal the cover in Intermediate.
    const response: SessionStartResponse = {
      sessionId: session.id,
      difficulty: diff,
      totalQuestions: serverTracks.length,
      tracks: serverTracks.map((t) => buildClientTrack(diff, t, 'artist')),
    }
    return NextResponse.json(response)
  }

  // -----------------------------------------------------------------------
  // BRANCH B: Challenge-based session
  // -----------------------------------------------------------------------
  const { challengeId } = body as { challengeId?: string }
  if (typeof challengeId !== 'string' || challengeId.length === 0) {
    return jsonError(
      'Either challengeId or artistId is required',
      400,
      'challenge_or_artist_required',
    )
  }

  const { data: challengeRaw, error: challengeErr } = await admin
    .from('challenges')
    .select(CHALLENGE_SELECT)
    .eq('id', challengeId)
    .maybeSingle()

  if (challengeErr) {
    console.error('[session/start] challenge lookup failed', challengeErr)
    return jsonError('Failed to load challenge', 500, 'challenge_lookup_failed')
  }
  const challenge = challengeRaw as unknown as ChallengeRow | null
  if (!challenge || !challenge.is_active) {
    return jsonError('Challenge not found', 404, 'challenge_not_found')
  }
  if (!userId && !challenge.is_guest_allowed) {
    return jsonError(
      'This challenge requires a logged-in account',
      403,
      'guests_not_allowed',
    )
  }
  if (!userId && diff !== 'easy') {
    return jsonError(
      'Guests can only play easy difficulty',
      403,
      'guest_difficulty_locked',
    )
  }

  const requestedCount =
    (challenge[TRACK_COUNT_COLUMN[diff]] as number | null) ??
    DEFAULT_QUESTION_COUNT[diff]
  const fetchLimit = computeFetchLimit(requestedCount)

  let tracks: DeezerTrack[]
  try {
    tracks = await resolveChallengeTracks(challenge, fetchLimit)
  } catch (err) {
    console.error('[session/start] track resolution failed', err)
    return jsonError(
      'Could not reach the music provider. Try again in a moment.',
      502,
      'provider_unavailable',
    )
  }

  if (tracks.length < requestedCount) {
    return jsonError(
      `Challenge has ${tracks.length} playable tracks but ${requestedCount} are required for this difficulty`,
      422,
      'insufficient_tracks',
    )
  }

  const sampled = shuffle(tracks.slice()).slice(0, requestedCount)
  const serverTracks = buildServerTracks(diff, sampled, tracks)
  const tracksData: SessionTracksData = {
    tracks: serverTracks,
    createdAt: new Date().toISOString(),
  }

  const { data: session, error: insertErr } = await admin
    .from('game_sessions')
    .insert({
      challenge_id: challenge.id,
      user_id: userId,
      difficulty: diff,
      total_questions: serverTracks.length,
      tracks_data: tracksData,
    })
    .select('id')
    .single()

  if (insertErr || !session) {
    console.error('[session/start] insert failed', insertErr)
    return jsonError('Failed to start session', 500, 'session_insert_failed')
  }

  const origin = originForChallenge(challenge)
  const response: SessionStartResponse = {
    sessionId: session.id,
    difficulty: diff,
    totalQuestions: serverTracks.length,
    tracks: serverTracks.map((t) => buildClientTrack(diff, t, origin)),
  }
  return NextResponse.json(response)
}
