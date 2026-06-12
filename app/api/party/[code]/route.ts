// =====================================================================
// SoundSnap — GET /api/party/[code]
// =====================================================================
// Returns the full party state for a member: lobby roster, current round,
// the caller's playable session (if any) and the accumulated leaderboard.
// Non-members get 403.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPartyState } from '@/lib/party'
import type { ApiError } from '@/types'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

interface RouteContext {
  params: Promise<{ code: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { code: rawCode } = await params
  const code = rawCode.trim().toUpperCase()

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonError('Login required', 401, 'auth_required')

  const admin = createServiceClient()

  const state = await getPartyState(admin, code, user.id)
  if (!state) return jsonError('Party not found', 404, 'party_not_found')

  const isMember = state.members.some((m) => m.userId === user.id)
  if (!isMember && state.hostUserId !== user.id) {
    return jsonError('You are not in this party', 403, 'not_member')
  }

  return NextResponse.json(state)
}
