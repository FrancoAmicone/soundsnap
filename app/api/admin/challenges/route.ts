// =====================================================================
// SoundSnap — /api/admin/challenges  (GET | POST | PATCH | DELETE)
// =====================================================================
// All handlers verify the caller has role = 'admin' via Supabase
// session. The server client respects RLS — the admin policies on
// `challenges` already restrict non-admins — but we also check
// explicitly for clear error messages.
//
//   GET    /api/admin/challenges          → list all (incl. inactive)
//   POST   /api/admin/challenges          → create
//   PATCH  /api/admin/challenges?id=...   → update
//   DELETE /api/admin/challenges?id=...   → hard delete (cascades sessions)
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type { ApiError, ChallengeType, DeezerTrack } from '@/types'

export const dynamic = 'force-dynamic'

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = { error: message, ...(code ? { code } : {}) }
  return NextResponse.json(body, { status })
}

async function assertAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'admin' ? user : null
}

// -------------------------------------------------------------------------
// Body shape expected from ChallengeForm
// -------------------------------------------------------------------------

interface ChallengePayload {
  title: string
  description?: string
  genreTag?: string
  decadeTag?: string
  challengeType: ChallengeType
  deezerPlaylistId?: string
  deezerArtistId?: string
  deezerArtistName?: string
  pinnedTracks?: DeezerTrack[]
  excludedTrackIds?: string[]
  isGuestAllowed?: boolean
  isActive?: boolean
  trackCountEasy?: number
  trackCountMedium?: number
  trackCountHard?: number
  coverImageUrl?: string
}

function payloadToRow(p: ChallengePayload, createdBy?: string) {
  return {
    title: p.title,
    description: p.description || null,
    genre_tag: p.genreTag || null,
    decade_tag: p.decadeTag || null,
    challenge_type: p.challengeType ?? 'playlist',
    deezer_playlist_id:
      p.challengeType === 'playlist' ? (p.deezerPlaylistId || null) : null,
    deezer_artist_id:
      p.challengeType === 'artist' ? (p.deezerArtistId || null) : null,
    pinned_tracks:
      p.pinnedTracks && p.pinnedTracks.length > 0 ? p.pinnedTracks : null,
    excluded_track_ids:
      p.excludedTrackIds && p.excludedTrackIds.length > 0
        ? p.excludedTrackIds
        : null,
    is_guest_allowed: p.isGuestAllowed ?? false,
    is_active: p.isActive ?? true,
    track_count_easy: clamp(p.trackCountEasy ?? 5, 3, 20),
    track_count_medium: clamp(p.trackCountMedium ?? 7, 3, 20),
    track_count_hard: clamp(p.trackCountHard ?? 10, 3, 20),
    cover_image_url: p.coverImageUrl || null,
    ...(createdBy ? { created_by: createdBy } : {}),
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

// -------------------------------------------------------------------------
// GET — list all challenges
// -------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  const adminUser = await assertAdmin(supabase)
  if (!adminUser) return jsonError('Admin access required', 403, 'forbidden')

  const { data, error } = await supabase
    .from('challenges')
    .select(
      'id, title, description, genre_tag, decade_tag, challenge_type, ' +
        'deezer_playlist_id, deezer_artist_id, pinned_tracks, excluded_track_ids, ' +
        'is_guest_allowed, is_active, ' +
        'track_count_easy, track_count_medium, track_count_hard, ' +
        'cover_image_url, created_by, created_at, updated_at',
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin/challenges GET]', error)
    return jsonError('Failed to fetch challenges', 500, 'fetch_failed')
  }

  return NextResponse.json({ challenges: data })
}

// -------------------------------------------------------------------------
// POST — create challenge
// -------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const adminUser = await assertAdmin(supabase)
  if (!adminUser) return jsonError('Admin access required', 403, 'forbidden')

  let body: Partial<ChallengePayload>
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  if (!body.title?.trim()) {
    return jsonError('title is required', 400, 'title_required')
  }
  if (!body.challengeType) {
    return jsonError('challengeType is required', 400, 'type_required')
  }

  const row = payloadToRow(body as ChallengePayload, adminUser.id)

  const { data, error } = await supabase
    .from('challenges')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    console.error('[admin/challenges POST]', error)
    return jsonError('Failed to create challenge', 500, 'insert_failed')
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}

// -------------------------------------------------------------------------
// PATCH — update challenge
// -------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  const supabase = await createServerClient()
  const adminUser = await assertAdmin(supabase)
  if (!adminUser) return jsonError('Admin access required', 403, 'forbidden')

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return jsonError('id query param is required', 400, 'id_required')

  let body: Partial<ChallengePayload>
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON body', 400, 'invalid_json')
  }

  // Allow partial updates — only include keys explicitly provided
  // For simple toggle updates (is_active, is_guest_allowed), body may
  // only contain those two fields. Build a minimal update object.
  const update: Record<string, unknown> = {}

  if (body.title !== undefined) update.title = body.title
  if (body.description !== undefined) update.description = body.description || null
  if (body.genreTag !== undefined) update.genre_tag = body.genreTag || null
  if (body.decadeTag !== undefined) update.decade_tag = body.decadeTag || null
  if (body.challengeType !== undefined) {
    update.challenge_type = body.challengeType
    update.deezer_playlist_id =
      body.challengeType === 'playlist' ? (body.deezerPlaylistId || null) : null
    update.deezer_artist_id =
      body.challengeType === 'artist' ? (body.deezerArtistId || null) : null
  }
  if (body.pinnedTracks !== undefined) {
    update.pinned_tracks =
      body.pinnedTracks.length > 0 ? body.pinnedTracks : null
  }
  if (body.excludedTrackIds !== undefined) {
    update.excluded_track_ids =
      body.excludedTrackIds.length > 0 ? body.excludedTrackIds : null
  }
  if (body.isGuestAllowed !== undefined) update.is_guest_allowed = body.isGuestAllowed
  if (body.isActive !== undefined) update.is_active = body.isActive
  if (body.trackCountEasy !== undefined)
    update.track_count_easy = clamp(body.trackCountEasy, 3, 20)
  if (body.trackCountMedium !== undefined)
    update.track_count_medium = clamp(body.trackCountMedium, 3, 20)
  if (body.trackCountHard !== undefined)
    update.track_count_hard = clamp(body.trackCountHard, 3, 20)
  if (body.coverImageUrl !== undefined)
    update.cover_image_url = body.coverImageUrl || null

  if (Object.keys(update).length === 0) {
    return jsonError('No fields to update', 400, 'empty_update')
  }

  const { error } = await supabase
    .from('challenges')
    .update(update)
    .eq('id', id)

  if (error) {
    console.error('[admin/challenges PATCH]', error)
    return jsonError('Failed to update challenge', 500, 'update_failed')
  }

  return NextResponse.json({ ok: true })
}

// -------------------------------------------------------------------------
// DELETE — hard delete
// -------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient()
  const adminUser = await assertAdmin(supabase)
  if (!adminUser) return jsonError('Admin access required', 403, 'forbidden')

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return jsonError('id query param is required', 400, 'id_required')

  const { error } = await supabase
    .from('challenges')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[admin/challenges DELETE]', error)
    return jsonError('Failed to delete challenge', 500, 'delete_failed')
  }

  return NextResponse.json({ ok: true })
}
