// =====================================================================
// SoundSnap — Edge Function: deezer-tracks
// =====================================================================
// Server-side proxy to the Deezer public API. Deezer exposes a 30s
// `preview` MP3 for almost every track (Spotify deprecated theirs), and
// requires NO API key / OAuth for read endpoints.
//
// Contract (POST):
//   Request body : { playlistId: string, limit?: number }   limit ≤ 100
//   Response 200 : {
//     tracks: DeezerTrack[],
//     fetched: number,        // raw items returned by Deezer
//     withPreview: number     // tracks kept after filter (== tracks.length)
//   }
//
// DeezerTrack:
//   { id, name, artist, albumName, previewUrl, coverUrl }
//
// Required env (set in Supabase Function secrets):
//   - EDGE_FUNCTION_SECRET   (shared with the Next.js API routes)
//
// Auth: deployed with verify_jwt=false. The Functions gateway rejects
// the modern sb_publishable_*/sb_secret_* keys (they are not JWTs), so
// we authenticate callers with a shared `x-internal-secret` header.
// Since this function only ever runs from our own server-side API
// routes, that is sufficient and also blocks random public invocations.
//
// Note: Deezer's API is CORS-restricted for browsers, but that does not
// affect us — this Edge Function calls it server-to-server.
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

interface PlaylistRequest {
  playlistId: string
  limit?: number
}

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

async function fetchPlaylistTracks(
  playlistId: string,
  limit: number,
): Promise<{ tracks: DeezerTrack[]; fetched: number }> {
  const safeLimit = Math.max(1, Math.min(limit, 100))
  const url =
    `https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}` +
    `/tracks?limit=${safeLimit}`

  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deezer playlist fetch failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { data?: any[]; error?: any }
  // Deezer returns 200 with an `error` object for invalid/private playlists.
  if (data.error) {
    throw new Error(`Deezer API error: ${JSON.stringify(data.error)}`)
  }
  const items = Array.isArray(data.data) ? data.data : []
  const tracks: DeezerTrack[] = []
  for (const item of items) {
    const mapped = toDeezerTrack(item)
    if (mapped) tracks.push(mapped)
  }
  return { tracks, fetched: items.length }
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

  if (!body || typeof body !== 'object' || !('playlistId' in body)) {
    return json(
      { error: 'invalid_body', hint: 'Expected { playlistId, limit? }' },
      400,
    )
  }

  const { playlistId, limit } = body as PlaylistRequest
  if (typeof playlistId !== 'string' || playlistId.length === 0) {
    return json({ error: 'playlistId_required' }, 400)
  }

  try {
    const { tracks, fetched } = await fetchPlaylistTracks(
      playlistId,
      typeof limit === 'number' ? limit : 50,
    )
    return json({ tracks, fetched, withPreview: tracks.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error'
    console.error('[deezer-tracks]', message)
    return json({ error: 'deezer_proxy_failed', details: message }, 502)
  }
})
