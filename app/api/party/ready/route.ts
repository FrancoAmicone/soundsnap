// =====================================================================
// SoundSnap — POST /api/party/ready
// =====================================================================
// The caller toggles their ready flag in the lobby. Can only become
// ready once an artist has been chosen.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { loadPartyByCode } from '@/lib/party'
import type { ApiError, PartyReadyRequest } from '@/types'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function POST(request: NextRequest) {
  let body: Partial<PartyReadyRequest>
  try {
    body = (await request.json()) as Partial<PartyReadyRequest>
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const ready = body.ready === true
  if (!code) return jsonError('code is required', 400, 'code_required')

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

  const { data: member } = await admin
    .from('party_members')
    .select('id, deezer_artist_id')
    .eq('party_id', party.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) return jsonError('You are not in this party', 403, 'not_member')
  if (ready && !member.deezer_artist_id) {
    return jsonError('Choose an artist first', 400, 'artist_required')
  }

  const { error } = await admin
    .from('party_members')
    .update({ is_ready: ready })
    .eq('id', member.id)

  if (error) {
    console.error('[party/ready] update failed', error)
    return jsonError('Failed to update ready', 500, 'ready_update_failed')
  }

  return NextResponse.json({ ok: true })
}
