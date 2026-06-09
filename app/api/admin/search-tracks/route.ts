// =====================================================================
// SoundSnap — GET /api/admin/search-tracks?q=<query>&limit=<n>
// =====================================================================
// Admin-only endpoint. Returns Deezer track search results for the
// admin track builder UI (ChallengeForm / TrackSearchPanel).
//
// Auth: verifies the caller has role = 'admin' via Supabase session.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { searchTracks } from '@/lib/deezer'
import type { ApiError } from '@/types'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function GET(request: NextRequest) {
  // -- Auth: admin only --------------------------------------------------
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonError('Authentication required', 401, 'unauthenticated')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return jsonError('Admin access required', 403, 'forbidden')
  }

  // -- Query param validation --------------------------------------------
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) {
    return jsonError('q is required', 400, 'query_required')
  }
  if (q.length > 100) {
    return jsonError('q must be 100 characters or fewer', 400, 'query_too_long')
  }

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 50) : 20

  try {
    const tracks = await searchTracks(q, limit)
    return NextResponse.json({ tracks })
  } catch (err) {
    console.error('[admin/search-tracks]', err)
    return jsonError(
      'Could not reach the music provider. Try again in a moment.',
      502,
      'provider_unavailable',
    )
  }
}
