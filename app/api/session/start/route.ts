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
//     → Ephemeral "play by artist" session. No challenge row is needed.
//       challenge_id is stored as NULL on the game_sessions row.
//
// Common flow after track resolution:
//   1. Sample N tracks per difficulty.
//   2. Build MC decoys for Easy.
//   3. Persist server-side snapshot in game_sessions.tracks_data.
//   4. Return only safe per-track payload to the client.
//
// Why a SERVICE client?
//   Guest sessions store user_id = NULL. RLS allows the INSERT but
//   prevents the same client from SELECTing its own row afterwards
//   (which is correct for the public app). The /answer route needs to
//   read tracks_data on every call, so the API path uses the secret
//   key, which bypasses RLS.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlaylistTracks, getArtistTracks } from '@/lib/deezer'
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
 * track's own title. Deduplicates normalized titles so we don't show
 * "Song" and "Song - Remastered" as two distinct options.
 */
function pickDecoys(
  pool: DeezerTrack[],
  excludeTrackId: string,
  count: number,
): string[] {
  const candidates = pool
    .filter((t) => t.id !== excludeTrackId)
    .map((t) => t.name)
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

// -------------------------------------------------------------------------
// Challenge row shape (from Supabase)
// -------------------------------------------------------------------------
interface ChallengeRow {
  id: string
  is_active: boolean
  is_guest_allowed: boolean
  challenge_type: 'playlist' | 'manual' | 'artist'
  deezer_playlist_id: string | null
  deezer_artist_id: string | null
  pinned_tracks: DeezerTrack[] | null
  excluded_track_ids: string[] | null
  track_count_easy: number
  track_count_medium: number
  track_count_hard: number
}

// -------------------------------------------------------------------------
// Track resolution per challenge type
// -------------------------------------------------------------------------

/**
 * Merge pinned_tracks into the base pool and remove excluded IDs.
 * Returns a deduplicated array.
 */
function applyPinnedAndExclusions(
  baseTracks: DeezerTrack[],
  pinnedTracks: DeezerTrack[] | null,
  excludedIds: string[] | null,
): DeezerTrack[] {
  const excludeSet = new Set(excludedIds ?? [])
  const merged = [...baseTracks]

  if (pinnedTracks && pinnedTracks.length > 0) {
    const existingIds = new Set(baseTracks.map((t) => t.id))
    for (const pt of pinnedTracks) {
      if (!existingIds.has(pt.id)) merged.push(pt)
    }
  }

  return merged.filter((t) => !excludeSet.has(t.id))
}

async function resolveChallengeTracks(
  challenge: ChallengeRow,
  fetchLimit: number,
): Promise<DeezerTrack[]> {
  if (challenge.challenge_type === 'manual') {
    // Manual challenges: all tracks are stored in pinned_tracks.
    // Still apply exclusions (admin could have removed some after creation).
    const pinned = challenge.pinned_tracks ?? []
    const excludeSet = new Set(challenge.excluded_track_ids ?? [])
    return pinned.filter((t) => !excludeSet.has(t.id))
  }

  if (challenge.challenge_type === 'artist') {
    if (!challenge.deezer_artist_id) {
      throw new Error('Artist challenge is missing deezer_artist_id')
    }
    const result = await getArtistTracks(challenge.deezer_artist_id, fetchLimit)
    return applyPinnedAndExclusions(
      result.tracks,
      challenge.pinned_tracks,
      challenge.excluded_track_ids,
    )
  }

  // Default: 'playlist'
  if (!challenge.deezer_playlist_id) {
    throw new Error('Playlist challenge is missing deezer_playlist_id')
  }
  const result = await getPlaylistTracks(challenge.deezer_playlist_id, fetchLimit)
  return applyPinnedAndExclusions(
    result.tracks,
    challenge.pinned_tracks,
    challenge.excluded_track_ids,
  )
}

// -------------------------------------------------------------------------
// Build the server-side snapshot + MC options
// -------------------------------------------------------------------------

function buildServerTracks(
  difficulty: Difficulty,
  sampled: DeezerTrack[],
  pool: DeezerTrack[],
): ServerTrack[] {
  return sampled.map((track) => {
    if (difficulty === 'easy') {
      const decoys = pickDecoys(pool, track.id, 3)
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
}

// -------------------------------------------------------------------------
// Route handler
// -------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: Partial<SessionStartRequest & { challengeId?: string; artistId?: string; artistName?: string }>
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
  // BRANCH A: Ephemeral "play by artist" session
  // -----------------------------------------------------------------------
  if ('artistId' in body && body.artistId) {
    const { artistId, artistName } = body as { artistId: string; artistName: string; difficulty: Difficulty }

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

    const requestedCount = DEFAULT_QUESTION_COUNT[diff]
    const fetchLimit = Math.min(Math.max(requestedCount * 2, requestedCount + 10, 30), 100)

    let tracks: DeezerTrack[]
    try {
      const result = await getArtistTracks(artistId, fetchLimit)
      tracks = result.tracks
    } catch (err) {
      console.error('[session/start] ephemeral artist fetch failed', err)
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
        challenge_id: null,
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
      console.error('[session/start] ephemeral insert failed', insertErr)
      return jsonError('Failed to start session', 500, 'session_insert_failed')
    }

    const response: SessionStartResponse = {
      sessionId: session.id,
      difficulty: diff,
      totalQuestions: serverTracks.length,
      tracks: serverTracks.map((t) => buildClientTrack(diff, t)),
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
    .select(
      'id, is_active, is_guest_allowed, challenge_type, ' +
        'deezer_playlist_id, deezer_artist_id, pinned_tracks, excluded_track_ids, ' +
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
  if (!userId && diff !== 'easy') {
    return jsonError(
      'Guests can only play easy difficulty',
      403,
      'guest_difficulty_locked',
    )
  }

  const requestedCount =
    (challenge[
      TRACK_COUNT_COLUMN[diff] as
        | 'track_count_easy'
        | 'track_count_medium'
        | 'track_count_hard'
    ] as number | null) ?? DEFAULT_QUESTION_COUNT[diff]

  const fetchLimit = Math.min(
    Math.max(requestedCount * 2, requestedCount + 10, 30),
    100,
  )

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

  const response: SessionStartResponse = {
    sessionId: session.id,
    difficulty: diff,
    totalQuestions: serverTracks.length,
    tracks: serverTracks.map((t) => buildClientTrack(diff, t)),
  }
  return NextResponse.json(response)
}
