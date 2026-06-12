// =====================================================================
// SoundSnap — POST /api/party/join
// =====================================================================
// Adds the caller to a party by code. Only allowed while the room is in
// 'lobby'. Idempotent if the caller is already a member.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { loadMembers, loadPartyByCode, MAX_PARTY_SIZE } from '@/lib/party'
import type { ApiError, PartyJoinRequest } from '@/types'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function POST(request: NextRequest) {
  let body: Partial<PartyJoinRequest>
  try {
    body = (await request.json()) as Partial<PartyJoinRequest>
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

  const members = await loadMembers(admin, party.id)

  // Already a member → idempotent success.
  if (members.some((m) => m.user_id === user.id)) {
    return NextResponse.json({ ok: true, code: party.code })
  }

  if (party.status !== 'lobby') {
    return jsonError('Party already started', 409, 'party_started')
  }
  if (members.length >= MAX_PARTY_SIZE) {
    return jsonError('Party is full', 409, 'party_full')
  }

  const { error } = await admin.from('party_members').insert({
    party_id: party.id,
    user_id: user.id,
    turn_order: members.length,
  })
  if (error) {
    // Unique violation = raced with another join of the same user → ok.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, code: party.code })
    }
    console.error('[party/join] insert failed', error)
    return jsonError('Failed to join party', 500, 'join_failed')
  }

  return NextResponse.json({ ok: true, code: party.code })
}
