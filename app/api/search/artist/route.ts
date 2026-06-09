// =====================================================================
// SoundSnap — GET /api/search/artist?q=<query>&limit=<n>
// =====================================================================
// Public endpoint. Returns Deezer artist search results for the
// user-facing "Play by Artist" search UI.
//
// No auth required — the query is read-only and goes through the Edge
// Function which authenticates with x-internal-secret.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { searchArtists } from '@/lib/deezer'
import type { ApiError } from '@/types'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) {
    return jsonError('q is required', 400, 'query_required')
  }
  if (q.length > 100) {
    return jsonError('q must be 100 characters or fewer', 400, 'query_too_long')
  }

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 10, 20) : 10

  try {
    const artists = await searchArtists(q, limit)
    return NextResponse.json({ artists })
  } catch (err) {
    console.error('[search/artist]', err)
    return jsonError(
      'Could not reach the music provider. Try again in a moment.',
      502,
      'provider_unavailable',
    )
  }
}
