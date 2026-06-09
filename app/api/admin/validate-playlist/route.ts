// =====================================================================
// SoundSnap — GET /api/admin/validate-playlist
// =====================================================================
// Admin-only endpoint. Calls the deezer-tracks Edge Function and
// returns stats about track preview availability.
//
// Query params (one of):
//   ?type=playlist&id=<deezer_playlist_id>
//   ?type=artist&id=<deezer_artist_id>
//
// Response:
//   {
//     total: number,
//     withPreview: number,
//     withoutPreview: number,
//     sufficient: boolean,    // true if withPreview >= 10 (Hard mode minimum)
//     tracks: DeezerTrack[]   // all tracks with preview (first 50)
//   }
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getPlaylistTracks, getArtistTracks } from '@/lib/deezer'
import type { ApiError, DeezerTrack } from '@/types'

export const dynamic = 'force-dynamic'

const HARD_MODE_MIN = 10

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Authentication required', 401, 'unauthenticated')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return jsonError('Admin access required', 403, 'forbidden')
  }

  const type = request.nextUrl.searchParams.get('type')
  const id = request.nextUrl.searchParams.get('id')?.trim()

  if (!type || !['playlist', 'artist'].includes(type)) {
    return jsonError(
      "type must be 'playlist' or 'artist'",
      400,
      'invalid_type',
    )
  }
  if (!id || id.length === 0) {
    return jsonError('id is required', 400, 'id_required')
  }

  try {
    let result: { tracks: DeezerTrack[]; fetched: number; withPreview: number }

    if (type === 'artist') {
      result = await getArtistTracks(id, 100)
    } else {
      result = await getPlaylistTracks(id, 100)
    }

    const withPreview = result.tracks.length
    const withoutPreview = result.fetched - withPreview

    return NextResponse.json({
      total: result.fetched,
      withPreview,
      withoutPreview,
      sufficient: withPreview >= HARD_MODE_MIN,
      tracks: result.tracks,
    })
  } catch (err) {
    console.error('[admin/validate-playlist]', err)
    return jsonError(
      'Could not reach the music provider. Check the ID and try again.',
      502,
      'provider_unavailable',
    )
  }
}
