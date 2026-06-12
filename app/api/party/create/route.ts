// =====================================================================
// SoundSnap — POST /api/party/create
// =====================================================================
// Host creates a new party room. Generates a unique join code, inserts
// the party (status 'lobby') and adds the host as the first member.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generatePartyCode } from '@/lib/party'
import type {
  ApiError,
  Difficulty,
  PartyCreateRequest,
  PartyCreateResponse,
} from '@/types'

export const dynamic = 'force-dynamic'

const VALID: readonly Difficulty[] = ['easy', 'intermediate', 'hard']

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

export async function POST(request: NextRequest) {
  let body: Partial<PartyCreateRequest>
  try {
    body = (await request.json()) as Partial<PartyCreateRequest>
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  const difficulty = body.difficulty
  if (!difficulty || !VALID.includes(difficulty)) {
    return jsonError('Invalid difficulty', 400, 'invalid_difficulty')
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonError('Login required', 401, 'auth_required')

  const admin = createServiceClient()

  // Insert with a unique code, retrying a few times on collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePartyCode()
    const { data: party, error } = await admin
      .from('parties')
      .insert({
        code,
        host_user_id: user.id,
        difficulty,
        status: 'lobby',
        current_round: 0,
        total_rounds: 0,
      })
      .select('id, code')
      .single()

    if (error) {
      // 23505 = unique_violation on code → retry with a new code.
      if ((error as { code?: string }).code === '23505') continue
      console.error('[party/create] insert failed', error)
      return jsonError('Failed to create party', 500, 'party_insert_failed')
    }

    const { error: memberErr } = await admin.from('party_members').insert({
      party_id: party.id,
      user_id: user.id,
      turn_order: 0,
    })
    if (memberErr) {
      console.error('[party/create] host member insert failed', memberErr)
      return jsonError('Failed to create party', 500, 'member_insert_failed')
    }

    const response: PartyCreateResponse = { code: party.code }
    return NextResponse.json(response)
  }

  return jsonError('Could not allocate a party code', 500, 'code_collision')
}
