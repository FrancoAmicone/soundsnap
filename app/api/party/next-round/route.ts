// =====================================================================
// SoundSnap — POST /api/party/next-round
// =====================================================================
// Host-only. Marks the current round finished and either:
//   - builds the next round (incrementing current_round), or
//   - flips the party to 'finished' when the last round is done.
//
// Guarded: every member must have completed the current round first.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  buildRound,
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
    return jsonError('Only the host can advance', 403, 'not_host')
  }
  if (party.status !== 'in_progress') {
    return jsonError('Party is not in progress', 409, 'not_in_progress')
  }

  const members = await loadMembers(admin, party.id)

  // Locate the current round.
  const { data: roundRaw } = await admin
    .from('party_rounds')
    .select('id')
    .eq('party_id', party.id)
    .eq('round_number', party.current_round)
    .maybeSingle()
  const currentRound = roundRaw as { id: string } | null
  if (!currentRound) {
    return jsonError('Current round not found', 500, 'round_missing')
  }

  // Everyone must have finished the current round.
  const { count: finishedCount } = await admin
    .from('game_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('party_round_id', currentRound.id)
    .not('completed_at', 'is', null)

  if ((finishedCount ?? 0) < members.length) {
    return jsonError('Not all players have finished', 409, 'round_not_finished')
  }

  await admin
    .from('party_rounds')
    .update({ status: 'finished' })
    .eq('id', currentRound.id)

  // Last round done → finish the party.
  if (party.current_round >= party.total_rounds) {
    await admin.from('parties').update({ status: 'finished' }).eq('id', party.id)
    const state = await getPartyState(admin, code, user.id)
    return NextResponse.json(state)
  }

  // Build the next round, then advance the pointer.
  const nextNumber = party.current_round + 1
  try {
    await buildRound(admin, party, nextNumber, members)
  } catch (err) {
    if (err instanceof PartyRoundError) {
      return jsonError(err.message, 422, err.code)
    }
    console.error('[party/next-round] buildRound failed', err)
    return jsonError('Failed to build the next round', 500, 'next_round_failed')
  }

  const { error: updErr } = await admin
    .from('parties')
    .update({ current_round: nextNumber })
    .eq('id', party.id)
  if (updErr) {
    console.error('[party/next-round] advance failed', updErr)
    return jsonError('Failed to advance the round', 500, 'advance_failed')
  }

  const state = await getPartyState(admin, code, user.id)
  return NextResponse.json(state)
}
