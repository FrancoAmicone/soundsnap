// =====================================================================
// SoundSnap — POST /api/session/start
// =====================================================================
// Creates a new game session for a given challenge + difficulty.
//
// Flow:
//   1. Resolve the calling user (may be a guest).
//   2. Load the challenge (must be active; guests need is_guest_allowed).
//   3. Fetch a buffered list of playlist tracks via the deezer-tracks
//      Edge Function and filter out tracks without a preview.
//   4. Randomly sample N tracks (N depends on difficulty).
//   5. For Easy, build 4 MC options per track with 3 decoys pulled
//      from the playlist's title pool.
//   6. Persist the snapshot in `game_sessions.tracks_data` (server-
//      only) so /answer can validate without trusting the client.
//   7. Return only the safe per-track payload to the client (no
//      correct titles, artist included only on Intermediate).
//
// Why a SERVICE client?
//   - Guest sessions store user_id = NULL. RLS allows the INSERT but
//     prevents the same client from SELECTing its own row afterwards
//     (which is correct for the public app). The /answer route needs
//     to read tracks_data on every call, so the API path uses the
//     secret key, which bypasses RLS.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlaylistTracks } from '@/lib/deezer'
import { DEFAULT_QUESTION_COUNT } from '@/lib/scoring'
import type {
  ApiError,
  ClientTrack,
  DeezerTrack,
  Difficulty,
  ServerTrack,
  SessionStartRequest,
  SessionStartResponse,
  SessionTracksData,
} from '@/types'

export const dynamic = 'force-dynamic'

const VALID_DIFFICULTIES: readonly Difficulty[] = [
  'easy',
  'intermediate',
  'hard',
]

const TRACK_COUNT_COLUMN: Record<Difficulty, string> = {
  easy: 'track_count_easy',
  intermediate: 'track_count_medium',
  hard: 'track_count_hard',
}

/** Fisher–Yates shuffle (in place). Returns the same array for chaining. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/**
 * Pick `count` distinct decoy titles from the pool, excluding the
 * track's own title. If the pool is too small, fall back to whatever
 * is available (the resulting MC just has fewer options).
 */
function pickDecoys(
  pool: DeezerTrack[],
  excludeTrackId: string,
  count: number,
): string[] {
  const candidates = pool
    .filter((t) => t.id !== excludeTrackId)
    .map((t) => t.name)
  // Deduplicate by normalized title so we don't show the same song
  // twice (catalogs often have "Song" and "Song - Remastered").
  const seen = new Set<string>()
  const unique: string[] = []
  for (const name of candidates) {
    const key = name.toLowerCase().trim()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(name)
    }
  }
  return shuffle(unique).slice(0, count)
}

function buildClientTrack(
  difficulty: Difficulty,
  track: ServerTrack,
): ClientTrack {
  return {
    trackId: track.trackId,
    previewUrl: track.previewUrl,
    coverUrl: difficulty === 'easy' ? track.coverUrl : null,
    artist: difficulty === 'intermediate' ? track.correctArtist : null,
    mcOptions: difficulty === 'easy' ? track.mcOptions : null,
  }
}

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function POST(request: NextRequest) {
  let body: Partial<SessionStartRequest>
  try {
    body = (await request.json()) as Partial<SessionStartRequest>
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  const { challengeId, difficulty } = body
  if (typeof challengeId !== 'string' || challengeId.length === 0) {
    return jsonError('challengeId is required', 400, 'challenge_required')
  }
  if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty)) {
    return jsonError(
      'difficulty must be easy | intermediate | hard',
      400,
      'invalid_difficulty',
    )
  }

  // -- 1. Identify the caller (may be null for guests) -------------------
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  // Use the privileged client for everything that touches game_sessions
  // so guest rows remain readable to OUR backend on subsequent /answer
  // calls without weakening the public RLS policy.
  const admin = createServiceClient()

  // -- 2. Resolve the challenge ------------------------------------------
  interface ChallengeRow {
    id: string
    is_active: boolean
    is_guest_allowed: boolean
    deezer_playlist_id: string
    track_count_easy: number
    track_count_medium: number
    track_count_hard: number
  }

  const { data: challengeRaw, error: challengeErr } = await admin
    .from('challenges')
    .select(
      'id, is_active, is_guest_allowed, deezer_playlist_id, ' +
        'track_count_easy, track_count_medium, track_count_hard',
    )
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
  if (!userId && difficulty !== 'easy') {
    return jsonError(
      'Guests can only play easy difficulty',
      403,
      'guest_difficulty_locked',
    )
  }

  const requestedCount =
    (challenge[
      TRACK_COUNT_COLUMN[difficulty] as
        | 'track_count_easy'
        | 'track_count_medium'
        | 'track_count_hard'
    ] as number | null) ?? DEFAULT_QUESTION_COUNT[difficulty]

  // -- 3. Fetch tracks (with buffer) -------------------------------------
  // Easy needs ≥4 distinct titles to build MC options; Hard needs the
  // most playable tracks, so pull a generous buffer and we'll filter.
  const fetchTarget = Math.max(requestedCount * 2, requestedCount + 10, 30)
  const fetchLimit = Math.min(fetchTarget, 100)

  let playlist
  try {
    playlist = await getPlaylistTracks(
      challenge.deezer_playlist_id,
      fetchLimit,
    )
  } catch (err) {
    console.error('[session/start] deezer proxy failed', err)
    return jsonError(
      'Could not reach the music provider. Try again in a moment.',
      502,
      'provider_unavailable',
    )
  }

  if (playlist.tracks.length < requestedCount) {
    return jsonError(
      `Playlist has ${playlist.tracks.length} playable tracks but ${requestedCount} are required for this difficulty`,
      422,
      'insufficient_tracks',
    )
  }

  // -- 4. Sample N tracks ------------------------------------------------
  const pool = playlist.tracks.slice() // copy before shuffle
  const sampled = shuffle(pool).slice(0, requestedCount)

  // -- 5. Build server-side snapshot + (Easy) MC options -----------------
  const serverTracks: ServerTrack[] = sampled.map((track) => {
    if (difficulty === 'easy') {
      const decoys = pickDecoys(playlist.tracks, track.id, 3)
      const options = shuffle([track.name, ...decoys])
      const mcCorrectIndex = options.indexOf(track.name)
      return {
        trackId: track.id,
        correctTitle: track.name,
        correctArtist: track.artist,
        previewUrl: track.previewUrl,
        coverUrl: track.coverUrl,
        mcOptions: options,
        mcCorrectIndex,
      }
    }
    return {
      trackId: track.id,
      correctTitle: track.name,
      correctArtist: track.artist,
      previewUrl: track.previewUrl,
      coverUrl: track.coverUrl,
      mcOptions: null,
      mcCorrectIndex: null,
    }
  })

  const tracksData: SessionTracksData = {
    tracks: serverTracks,
    createdAt: new Date().toISOString(),
  }

  // -- 6. Persist the session --------------------------------------------
  const { data: session, error: insertErr } = await admin
    .from('game_sessions')
    .insert({
      challenge_id: challenge.id,
      user_id: userId,
      difficulty,
      total_questions: serverTracks.length,
      tracks_data: tracksData,
    })
    .select('id')
    .single()

  if (insertErr || !session) {
    console.error('[session/start] insert failed', insertErr)
    return jsonError('Failed to start session', 500, 'session_insert_failed')
  }

  // -- 7. Build the safe client payload ----------------------------------
  const clientTracks = serverTracks.map((t) => buildClientTrack(difficulty, t))

  const response: SessionStartResponse = {
    sessionId: session.id,
    difficulty,
    totalQuestions: serverTracks.length,
    tracks: clientTracks,
  }
  return NextResponse.json(response)
}
