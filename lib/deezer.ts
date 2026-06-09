// =====================================================================
// SoundSnap — Deezer proxy helper (server-only)
// =====================================================================
// Thin wrapper around the `deezer-tracks` Supabase Edge Function. All
// API routes go through this helper so that:
//   - the function URL and auth headers are defined in one place,
//   - error handling is uniform,
//   - the response is typed against `types/index.ts`.
//
// The Edge Function runs with verify_jwt=false and is authenticated with
// a shared `x-internal-secret` header (see EDGE_FUNCTION_SECRET).
// =====================================================================

import type {
  ArtistSearchResult,
  DeezerTrack,
  GetArtistTracksResponse,
  GetPlaylistTracksResponse,
  SearchArtistsResponse,
  SearchTracksResponse,
} from '@/types'

const FUNCTION_NAME = 'deezer-tracks'

function getFunctionUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }
  return `${base.replace(/\/$/, '')}/functions/v1/${FUNCTION_NAME}`
}

function getInternalSecret(): string {
  const secret = process.env.EDGE_FUNCTION_SECRET
  if (!secret) {
    throw new Error(
      'EDGE_FUNCTION_SECRET is not configured. Add it to .env.local AND set ' +
        'the same value as a Supabase Function secret in the dashboard.',
    )
  }
  return secret
}

async function invokeDeezerTracks<T>(body: unknown): Promise<T> {
  const url = getFunctionUrl()
  const secret = getInternalSecret()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`deezer-tracks call failed: ${res.status} ${detail}`)
  }
  return (await res.json()) as T
}

export interface PlaylistTracksResult {
  tracks: DeezerTrack[]
  fetched: number
  withPreview: number
}

/** Fetch tracks from a Deezer public playlist. */
export function getPlaylistTracks(
  playlistId: string,
  limit = 50,
): Promise<PlaylistTracksResult> {
  return invokeDeezerTracks<GetPlaylistTracksResponse>({ playlistId, limit })
}

/** Fetch top tracks for a Deezer artist. */
export function getArtistTracks(
  artistId: string,
  limit = 50,
): Promise<PlaylistTracksResult> {
  return invokeDeezerTracks<GetArtistTracksResponse>({ artistId, limit })
}

/** Search Deezer for tracks matching a query. Used in admin track builder. */
export async function searchTracks(
  query: string,
  limit = 20,
): Promise<DeezerTrack[]> {
  const res = await invokeDeezerTracks<SearchTracksResponse>({
    searchQuery: query,
    searchType: 'track',
    limit,
  })
  return res.tracks
}

/** Search Deezer for artists matching a query. Used in artist search UI. */
export async function searchArtists(
  query: string,
  limit = 10,
): Promise<ArtistSearchResult[]> {
  const res = await invokeDeezerTracks<SearchArtistsResponse>({
    searchQuery: query,
    searchType: 'artist',
    limit,
  })
  return res.artists
}
