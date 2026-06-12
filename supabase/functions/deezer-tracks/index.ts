// =====================================================================
// SoundSnap — Edge Function: deezer-tracks
// =====================================================================
// Server-side proxy to the Deezer public API. Deezer exposes a 30s
// `preview` MP3 for almost every track (Spotify deprecated theirs), and
// requires NO API key / OAuth for read endpoints.
//
// Contract (POST) — dispatch on the first matching field in the body:
//
//   { playlistId, limit? }
//     → GET /playlist/{id}/tracks
//     → { tracks: DeezerTrack[], fetched: number, withPreview: number }
//
//   { artistId, limit? }
//     → GET /artist/{id}/top
//     → { tracks: DeezerTrack[], fetched: number, withPreview: number }
//
//   { searchQuery, searchType: 'track' | 'artist', limit? }
//     searchType='track'  → GET /search?q={q}
//       → { tracks: DeezerTrack[] }
//     searchType='artist' → GET /search/artist?q={q}
//       → { artists: ArtistSearchResult[] }
//
// DeezerTrack:
//   { id, name, artist, albumName, previewUrl, coverUrl }
//
// ArtistSearchResult:
//   { id, name, picture, nbFan }
//
// Required env (set in Supabase Function secrets):
//   - EDGE_FUNCTION_SECRET   (shared with the Next.js API routes)
//
// Auth: deployed with verify_jwt=false. The Functions gateway rejects
// the modern sb_publishable_*/sb_secret_* keys (they are not JWTs), so
// we authenticate callers with a shared `x-internal-secret` header.
// Since this function only ever runs from our own server-side API
// routes, that is sufficient and also blocks random public invocations.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

interface DeezerTrack {
  id: string
  name: string
  artist: string
  albumName: string
  previewUrl: string
  coverUrl: string | null
}

interface ArtistSearchResult {
  id: string
  name: string
  picture: string | null
  nbFan: number
}

interface PlaylistRequest {
  playlistId: string
  limit?: number
}

interface ArtistRequest {
  artistId: string
  limit?: number
}

interface SearchRequest {
  searchQuery: string
  searchType: 'track' | 'artist'
  limit?: number
}

type RequestBody = PlaylistRequest | ArtistRequest | SearchRequest

const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET')

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

/**
 * Map a raw Deezer track payload to SoundSnap's compact shape.
 * Returns null if the track cannot be played (no `preview`) so the
 * caller can filter in a single pass.
 */
function toDeezerTrack(t: any): DeezerTrack | null {
  if (!t || t.type === 'playlist') return null
  const id = t.id != null ? String(t.id) : ''
  const preview = typeof t.preview === 'string' ? t.preview : ''
  if (!id || !preview) return null
  const album = t.album ?? {}
  const cover =
    album.cover_big ?? album.cover_xl ?? album.cover_medium ?? album.cover ?? null
  return {
    id,
    name: t.title ?? '',
    artist: t.artist?.name ?? '',
    albumName: album.title ?? '',
    previewUrl: preview,
    coverUrl: cover,
  }
}

/**
 * Map a raw Deezer artist search result to SoundSnap's shape.
 */
function toArtistResult(a: any): ArtistSearchResult | null {
  if (!a) return null
  const id = a.id != null ? String(a.id) : ''
  if (!id) return null
  return {
    id,
    name: a.name ?? '',
    picture: a.picture_medium ?? a.picture ?? null,
    nbFan: typeof a.nb_fan === 'number' ? a.nb_fan : 0,
  }
}

/** Deduplicate a track array by id, preserving first-occurrence order. */
function deduplicateTracks(tracks: DeezerTrack[]): DeezerTrack[] {
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

/** Fetch one page of a playlist (limit + index window). */
async function fetchPlaylistPage(
  playlistId: string,
  limit: number,
  index: number,
): Promise<{ items: any[]; total: number }> {
  const url =
    `https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}` +
    `/tracks?limit=${limit}&index=${index}`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deezer playlist fetch failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { data?: any[]; error?: any; total?: number }
  if (data.error) {
    throw new Error(`Deezer API error: ${JSON.stringify(data.error)}`)
  }
  const items = Array.isArray(data.data) ? data.data : []
  const total = typeof data.total === 'number' ? data.total : items.length
  return { items, total }
}

/**
 * Fetch a window of a playlist's tracks. To avoid always returning the
 * same first N entries of a large playlist, we read `total` from page 1
 * and, when the playlist is larger than the window, re-fetch a RANDOM
 * offset window so different games draw from different parts of it.
 */
async function fetchPlaylistTracks(
  playlistId: string,
  limit: number,
): Promise<{ tracks: DeezerTrack[]; fetched: number; total: number }> {
  const safeLimit = Math.max(1, Math.min(limit, 100))

  // Page 1 — also tells us the playlist's total size.
  let { items, total } = await fetchPlaylistPage(playlistId, safeLimit, 0)

  // Larger than the window → pick a random offset window for variety.
  if (total > safeLimit) {
    const maxIndex = total - safeLimit
    const index = Math.floor(Math.random() * (maxIndex + 1))
    if (index > 0) {
      const page = await fetchPlaylistPage(playlistId, safeLimit, index)
      if (page.items.length > 0) items = page.items
    }
  }

  const raw: DeezerTrack[] = []
  for (const item of items) {
    const mapped = toDeezerTrack(item)
    if (mapped) raw.push(mapped)
  }
  const tracks = deduplicateTracks(raw)
  return { tracks, fetched: items.length, total }
}

async function fetchArtistTracks(
  artistId: string,
  limit: number,
): Promise<{ tracks: DeezerTrack[]; fetched: number }> {
  const safeLimit = Math.max(1, Math.min(limit, 100))
  const url =
    `https://api.deezer.com/artist/${encodeURIComponent(artistId)}` +
    `/top?limit=${safeLimit}`

  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deezer artist fetch failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { data?: any[]; error?: any; total?: number }
  if (data.error) {
    throw new Error(`Deezer API error: ${JSON.stringify(data.error)}`)
  }
  const items = Array.isArray(data.data) ? data.data : []
  const raw: DeezerTrack[] = []
  for (const item of items) {
    const mapped = toDeezerTrack(item)
    if (mapped) raw.push(mapped)
  }
  const tracks = deduplicateTracks(raw)
  return { tracks, fetched: items.length }
}

async function searchTracks(
  query: string,
  limit: number,
): Promise<DeezerTrack[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50))
  const url =
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${safeLimit}`

  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deezer track search failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { data?: any[]; error?: any }
  if (data.error) {
    throw new Error(`Deezer API error: ${JSON.stringify(data.error)}`)
  }
  const items = Array.isArray(data.data) ? data.data : []
  const tracks: DeezerTrack[] = []
  for (const item of items) {
    const mapped = toDeezerTrack(item)
    if (mapped) tracks.push(mapped)
  }
  return tracks
}

async function searchArtists(
  query: string,
  limit: number,
): Promise<ArtistSearchResult[]> {
  const safeLimit = Math.max(1, Math.min(limit, 20))
  const url =
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=${safeLimit}`

  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deezer artist search failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { data?: any[]; error?: any }
  if (data.error) {
    throw new Error(`Deezer API error: ${JSON.stringify(data.error)}`)
  }
  const items = Array.isArray(data.data) ? data.data : []
  const artists: ArtistSearchResult[] = []
  for (const item of items) {
    const mapped = toArtistResult(item)
    if (mapped) artists.push(mapped)
  }
  return artists
}

/**
 * Constant-time string comparison. Avoids leaking secret length /
 * matched-prefix info via response timing.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  if (!EDGE_FUNCTION_SECRET) {
    return json({ error: 'edge_function_secret_not_configured' }, 500)
  }
  const provided = req.headers.get('x-internal-secret') ?? ''
  if (!safeEqual(provided, EDGE_FUNCTION_SECRET)) {
    return json({ error: 'unauthorized' }, 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  if (!body || typeof body !== 'object') {
    return json({ error: 'invalid_body' }, 400)
  }

  const b = body as Record<string, unknown>

  try {
    // --- Playlist tracks ---
    if ('playlistId' in b) {
      const { playlistId, limit } = b as PlaylistRequest
      if (typeof playlistId !== 'string' || playlistId.length === 0) {
        return json({ error: 'playlistId_required' }, 400)
      }
      const { tracks, fetched, total } = await fetchPlaylistTracks(
        playlistId,
        typeof limit === 'number' ? limit : 50,
      )
      return json({ tracks, fetched, withPreview: tracks.length, total })
    }

    // --- Artist top tracks ---
    if ('artistId' in b) {
      const { artistId, limit } = b as ArtistRequest
      if (typeof artistId !== 'string' || artistId.length === 0) {
        return json({ error: 'artistId_required' }, 400)
      }
      const { tracks, fetched } = await fetchArtistTracks(
        artistId,
        typeof limit === 'number' ? limit : 50,
      )
      return json({ tracks, fetched, withPreview: tracks.length })
    }

    // --- Search (tracks or artists) ---
    if ('searchQuery' in b) {
      const { searchQuery, searchType, limit } = b as SearchRequest
      if (typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
        return json({ error: 'searchQuery_required' }, 400)
      }
      const safeLimit = typeof limit === 'number' ? limit : 20

      if (searchType === 'artist') {
        const artists = await searchArtists(searchQuery.trim(), safeLimit)
        return json({ artists })
      }

      // Default: track search
      const tracks = await searchTracks(searchQuery.trim(), safeLimit)
      return json({ tracks })
    }

    return json(
      {
        error: 'invalid_body',
        hint: 'Expected one of: { playlistId }, { artistId }, { searchQuery, searchType }',
      },
      400,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error'
    console.error('[deezer-tracks]', message)
    return json({ error: 'deezer_proxy_failed', details: message }, 502)
  }
})
