// =====================================================================
// SoundSnap — POST /api/party/artist
// =====================================================================
// The caller sets (or changes) their chosen artist for the party. Only
// allowed while the room is in 'lobby'. Choosing a new artist clears the
// ready flag so a player can't lock in then swap silently.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { loadPartyByCode } from '@/lib/party'
import type { ApiError, PartyArtistRequest } from '@/types'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function POST(request: NextRequest) {
  let body: Partial<PartyArtistRequest>
  try {
    body = (await request.json()) as Partial<PartyArtistRequest>
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const artistId = typeof body.artistId === 'string' ? body.artistId : ''
  const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : ''
  if (!code) return jsonError('code is required', 400, 'code_required')
  if (!artistId) return jsonError('artistId is required', 400, 'artist_required')
  if (!artistName) return jsonError('artistName is required', 400, 'artist_name_required')

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonError('Login required', 401, 'auth_required')

  const admin = createServiceClient()

  const party = await loadPartyByCode(admin, code)
  if (!party) return jsonError('Party not found', 404, 'party_not_found')
  if (party.status !== 'lobby') {
    return jsonError('Party already started', 409, 'party_started')
  }

  const { data: updated, error } = await admin
    .from('party_members')
    .update({
      deezer_artist_id: artistId,
      artist_name: artistName,
      is_ready: false,
    })
    .eq('party_id', party.id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[party/artist] update failed', error)
    return jsonError('Failed to set artist', 500, 'artist_update_failed')
  }
  if (!updated) return jsonError('You are not in this party', 403, 'not_member')

  return NextResponse.json({ ok: true })
}
