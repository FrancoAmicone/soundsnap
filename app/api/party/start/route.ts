// =====================================================================
// SoundSnap — POST /api/party/start
// =====================================================================
// Host-only. Validates the lobby (≥2 members, everyone with an artist and
// ready), builds round 1 (shared snapshot + a session per member) and
// flips the party to 'in_progress'. Round 1 is built BEFORE the status
// flip so a track-fetch failure leaves the party safely in the lobby.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  buildRound,
  computeTotalRounds,
  getPartyState,
  loadMembers,
  loadPartyByCode,
  PartyRoundError,
} from '@/lib/party'
import type { ApiError, PartyActionRequest } from '@/types'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function POST(request: NextRequest) {
  let body: Partial<PartyActionRequest>
  try {
    body = (await request.json()) as Partial<PartyActionRequest>
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) return jsonError('code is required', 400, 'code_required')

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonError('Login required', 401, 'auth_required')

  const admin = createServiceClient()

  const party = await loadPartyByCode(admin, code)
  if (!party) return jsonError('Party not found', 404, 'party_not_found')
  if (party.host_user_id !== user.id) {
    return jsonError('Only the host can start', 403, 'not_host')
  }
  if (party.status !== 'lobby') {
    return jsonError('Party already started', 409, 'party_started')
  }

  const members = await loadMembers(admin, party.id)
  if (members.length < 2) {
    return jsonError('Need at least 2 players', 400, 'not_enough_players')
  }
  if (!members.every((m) => m.deezer_artist_id && m.is_ready)) {
    return jsonError('Everyone must pick an artist and be ready', 400, 'not_all_ready')
  }

  const totalRounds = computeTotalRounds(members.length)

  // Build round 1 before flipping status.
  try {
    await buildRound(admin, party, 1, members)
  } catch (err) {
    if (err instanceof PartyRoundError) {
      return jsonError(err.message, 422, err.code)
    }
    console.error('[party/start] buildRound failed', err)
    return jsonError('Failed to start the party', 500, 'start_failed')
  }

  const { error: updErr } = await admin
    .from('parties')
    .update({ status: 'in_progress', current_round: 1, total_rounds: totalRounds })
    .eq('id', party.id)

  if (updErr) {
    console.error('[party/start] status update failed', updErr)
    return jsonError('Failed to start the party', 500, 'start_failed')
  }

  const state = await getPartyState(admin, code, user.id)
  return NextResponse.json(state)
}
