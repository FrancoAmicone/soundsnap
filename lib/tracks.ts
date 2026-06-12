// =====================================================================
// SoundSnap — Track resolution & sampling (server-only)
// =====================================================================
// Pure helpers shared between /api/session/start and the party mode
// (lib/party.ts). Centralises the sensitive logic that turns a Deezer
// track pool into:
//   - a server-side snapshot (`ServerTrack[]`, holds the answers), and
//   - the safe per-track payload sent to the client (`ClientTrack[]`).
//
// Keeping this in one module means the "never leak the answer" rules
// (which fields are exposed per difficulty) live in a single place.
// =====================================================================

import { getPlaylistTracks, getArtistTracks } from '@/lib/deezer'
import type {
  ClientTrack,
  DeezerTrack,
  Difficulty,
  ServerTrack,
  TrackOrigin,
} from '@/types'

// -------------------------------------------------------------------------
// Challenge row shape (subset needed for track resolution)
// -------------------------------------------------------------------------
export interface ChallengeRow {
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

export const TRACK_COUNT_COLUMN: Record<
  Difficulty,
  'track_count_easy' | 'track_count_medium' | 'track_count_hard'
> = {
  easy: 'track_count_easy',
  intermediate: 'track_count_medium',
  hard: 'track_count_hard',
}

/** Fisher–Yates shuffle (in place). Returns the same array for chaining. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/**
 * Deduplicate a track array by id, preserving first-occurrence order.
 * Defense-in-depth: Deezer can return the same id across pages, and pinned
 * tracks can overlap with the base pool after a playlist edit.
 */
export function deduplicateById(tracks: DeezerTrack[]): DeezerTrack[] {
  const seen = new Set<string>()
  const result: DeezerTrack[] = []
  for (const t of tracks) {
    if (!seen.has(t.id)) {
      seen.add(t.id)
      result.push(t)
    }
  }
  return result
}

/**
 * Pick `count` distinct decoy titles from the pool, excluding the track's
 * own title. Deduplicates normalized titles so we don't show "Song" and
 * "Song - Remastered" as two distinct options.
 */
export function pickDecoys(
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

/**
 * Merge pinned_tracks into the base pool and remove excluded IDs.
 * Returns a deduplicated array.
 */
export function applyPinnedAndExclusions(
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

  return deduplicateById(merged.filter((t) => !excludeSet.has(t.id)))
}

/** Resolve the full track pool for a challenge row by its type. */
export async function resolveChallengeTracks(
  challenge: ChallengeRow,
  fetchLimit: number,
): Promise<DeezerTrack[]> {
  if (challenge.challenge_type === 'manual') {
    const pinned = challenge.pinned_tracks ?? []
    const excludeSet = new Set(challenge.excluded_track_ids ?? [])
    return deduplicateById(pinned.filter((t) => !excludeSet.has(t.id)))
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

/** Fetch + merge the top tracks of two artists (used by the party mix round). */
export async function resolveMixTracks(
  artistIdA: string,
  artistIdB: string,
  fetchLimitEach: number,
): Promise<DeezerTrack[]> {
  const [a, b] = await Promise.all([
    getArtistTracks(artistIdA, fetchLimitEach),
    getArtistTracks(artistIdB, fetchLimitEach),
  ])
  // Interleave so a small sample still draws from both artists.
  const merged: DeezerTrack[] = []
  const max = Math.max(a.tracks.length, b.tracks.length)
  for (let i = 0; i < max; i++) {
    if (a.tracks[i]) merged.push(a.tracks[i])
    if (b.tracks[i]) merged.push(b.tracks[i])
  }
  return deduplicateById(merged)
}

/**
 * Build the server-side snapshot (holds the answers) for a sampled set of
 * tracks. For Easy it also builds the 4 MC options + correct index.
 */
export function buildServerTracks(
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

/**
 * Project a ServerTrack down to the safe payload the client receives.
 *
 * `origin` decides the Intermediate reveal mechanic:
 *   - 'playlist' → reveal the ARTIST at 15s (expose `artist`).
 *   - 'artist'   → reveal the album COVER at 15s (expose `coverUrl`).
 *
 * The correct title is never exposed (and the artist is only exposed for
 * Intermediate playlist mode, which is the existing behaviour).
 */
export function buildClientTrack(
  difficulty: Difficulty,
  track: ServerTrack,
  origin: TrackOrigin = 'playlist',
): ClientTrack {
  const revealKind: 'artist' | 'cover' =
    origin === 'artist' ? 'cover' : 'artist'

  const showCover =
    difficulty === 'easy' ||
    (difficulty === 'intermediate' && revealKind === 'cover')

  const showArtist = difficulty === 'intermediate' && revealKind === 'artist'

  return {
    trackId: track.trackId,
    previewUrl: track.previewUrl,
    coverUrl: showCover ? track.coverUrl : null,
    artist: showArtist ? track.correctArtist : null,
    mcOptions: difficulty === 'easy' ? track.mcOptions : null,
    ...(difficulty === 'intermediate' ? { revealKind } : {}),
  }
}

/**
 * How many tracks to fetch into the sampling pool. We aim for a large pool
 * (~100, Deezer's max per request — one cheap call) so that sampling N
 * yields very different sets across games instead of always drawing from a
 * small fixed top-30.
 */
export function computeFetchLimit(requestedCount: number): number {
  return Math.min(100, Math.max(requestedCount * 4, 80))
}

/**
 * Pick `count` tracks from `pool`, avoiding `excludeIds` when possible.
 * Shuffles the non-excluded tracks first; if those don't cover `count`
 * (small catalog), tops up with the excluded ones (also shuffled) so we
 * never return fewer than `min(count, pool.length)`.
 */
export function sampleTracks(
  pool: DeezerTrack[],
  count: number,
  excludeIds?: ReadonlySet<string>,
): DeezerTrack[] {
  if (!excludeIds || excludeIds.size === 0) {
    return shuffle(pool.slice()).slice(0, count)
  }
  const fresh: DeezerTrack[] = []
  const used: DeezerTrack[] = []
  for (const t of pool) {
    ;(excludeIds.has(t.id) ? used : fresh).push(t)
  }
  const picked = shuffle(fresh).slice(0, count)
  if (picked.length < count) {
    picked.push(...shuffle(used).slice(0, count - picked.length))
  }
  return picked
}
