// =====================================================================
// SoundSnap — Party mode orchestration (server-only)
// =====================================================================
// Helpers shared by the /api/party/* routes:
//   - generatePartyCode / computeTotalRounds / computeRoundPlan
//   - buildRound      → samples the shared snapshot for a round and
//                       creates one game_sessions row per member.
//   - getPartyState   → the full client-facing state (members, current
//                       round, the caller's playable session, leaderboard).
//
// SECURITY: like the single-player routes, the correct answers live only
// in the per-session/per-round `tracks_data` and are never projected into
// the client payload (buildClientTrack strips them).
// =====================================================================

import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_QUESTION_COUNT } from '@/lib/scoring'
import {
  buildClientTrack,
  buildServerTracks,
  computeFetchLimit,
  resolveChallengeTracks,
  resolveMixTracks,
  sampleTracks,
  type ChallengeRow,
} from '@/lib/tracks'
import type {
  DeezerTrack,
  Difficulty,
  PartyLeaderboardEntry,
  PartyMemberView,
  PartyMySession,
  PartyRoundType,
  PartyRoundView,
  PartyStateResponse,
  PartyStatus,
  ServerTrack,
  SessionTracksData,
} from '@/types'

type Admin = ReturnType<typeof createServiceClient>

// ---------------------------------------------------------------------
// DB row shapes
// ---------------------------------------------------------------------
export interface PartyRow {
  id: string
  code: string
  host_user_id: string
  difficulty: Difficulty
  status: PartyStatus
  current_round: number
  total_rounds: number
}

export interface MemberRow {
  id: string
  user_id: string
  deezer_artist_id: string | null
  artist_name: string | null
  is_ready: boolean
  turn_order: number
  profiles: { username: string; avatar_url: string | null } | null
}

interface RoundRow {
  id: string
  round_number: number
  round_type: PartyRoundType
  owner_member_id: string | null
  artist_label: string
  tracks_data: SessionTracksData | null
  status: string
}

export const PARTY_SELECT =
  'id, code, host_user_id, difficulty, status, current_round, total_rounds'

export const MEMBER_SELECT =
  'id, user_id, deezer_artist_id, artist_name, is_ready, turn_order, ' +
  'profiles ( username, avatar_url )'

export const MAX_PARTY_SIZE = 10

// ---------------------------------------------------------------------
// Loaders (mutation routes use these light queries)
// ---------------------------------------------------------------------

export async function loadPartyByCode(
  admin: Admin,
  code: string,
): Promise<PartyRow | null> {
  const { data } = await admin
    .from('parties')
    .select(PARTY_SELECT)
    .eq('code', code)
    .maybeSingle()
  return (data as PartyRow | null) ?? null
}

export async function loadMembers(
  admin: Admin,
  partyId: string,
): Promise<MemberRow[]> {
  const { data } = await admin
    .from('party_members')
    .select(MEMBER_SELECT)
    .eq('party_id', partyId)
    .order('turn_order', { ascending: true })
  return ((data ?? []) as unknown as MemberRow[])
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1

export function generatePartyCode(length = 6): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

/** 2 players → 3 rounds (incl. mix). N≥3 → one round per player. */
export function computeTotalRounds(memberCount: number): number {
  return memberCount === 2 ? 3 : memberCount
}

/**
 * Resolve which artist(s) a 1-indexed round belongs to.
 * Members must already be ordered by turn_order.
 */
export function computeRoundPlan(
  roundNumber: number,
  members: MemberRow[],
): { type: PartyRoundType; owner: MemberRow | null } {
  const n = members.length
  if (n === 2 && roundNumber === 3) {
    return { type: 'mix', owner: null }
  }
  return { type: 'artist', owner: members[roundNumber - 1] ?? null }
}

// ---------------------------------------------------------------------
// Build a round: shared snapshot + per-member sessions
// ---------------------------------------------------------------------

/** Synthetic challenge row so we can reuse resolveChallengeTracks(). */
function artistChallenge(artistId: string): ChallengeRow {
  return {
    id: '',
    is_active: true,
    is_guest_allowed: true,
    challenge_type: 'artist',
    deezer_playlist_id: null,
    deezer_artist_id: artistId,
    pinned_tracks: null,
    excluded_track_ids: null,
    track_count_easy: 5,
    track_count_medium: 7,
    track_count_hard: 10,
  }
}

export class PartyRoundError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

/**
 * Create round `roundNumber`: sample a shared snapshot and insert a
 * game_sessions row per member pointing at it. Returns the new round id.
 */
export async function buildRound(
  admin: Admin,
  party: PartyRow,
  roundNumber: number,
  members: MemberRow[],
): Promise<string> {
  const difficulty = party.difficulty
  const plan = computeRoundPlan(roundNumber, members)

  const requestedCount = DEFAULT_QUESTION_COUNT[difficulty]
  const fetchLimit = computeFetchLimit(requestedCount)

  // -- Resolve the track pool + a human label ---------------------------
  let pool: DeezerTrack[]
  let artistLabel: string
  let ownerMemberId: string | null = null

  if (plan.type === 'mix') {
    const [a, b] = members
    if (!a.deezer_artist_id || !b.deezer_artist_id) {
      throw new PartyRoundError('A player is missing an artist', 'member_no_artist')
    }
    pool = await resolveMixTracks(a.deezer_artist_id, b.deezer_artist_id, fetchLimit)
    artistLabel = `${a.artist_name ?? 'Artista A'} + ${b.artist_name ?? 'Artista B'}`
  } else {
    const owner = plan.owner
    if (!owner || !owner.deezer_artist_id) {
      throw new PartyRoundError('A player is missing an artist', 'member_no_artist')
    }
    ownerMemberId = owner.id
    pool = await resolveChallengeTracks(artistChallenge(owner.deezer_artist_id), fetchLimit)
    artistLabel = owner.artist_name ?? 'Artista'
  }

  if (pool.length < requestedCount) {
    throw new PartyRoundError(
      `Not enough playable tracks for "${artistLabel}" (${pool.length}/${requestedCount})`,
      'insufficient_tracks',
    )
  }

  // -- Anti-repeat: exclude tracks already used in earlier rounds --------
  const { data: priorRounds } = await admin
    .from('party_rounds')
    .select('tracks_data')
    .eq('party_id', party.id)
  const usedIds = new Set<string>()
  for (const r of priorRounds ?? []) {
    const td = (r as { tracks_data: SessionTracksData | null }).tracks_data
    if (td?.tracks) for (const t of td.tracks) usedIds.add(t.trackId)
  }

  // -- Shared snapshot ---------------------------------------------------
  const sampled = sampleTracks(pool, requestedCount, usedIds)
  const serverTracks: ServerTrack[] = buildServerTracks(difficulty, sampled, pool)
  const tracksData: SessionTracksData = {
    tracks: serverTracks,
    createdAt: new Date().toISOString(),
  }

  const { data: round, error: roundErr } = await admin
    .from('party_rounds')
    .insert({
      party_id: party.id,
      round_number: roundNumber,
      round_type: plan.type,
      owner_member_id: ownerMemberId,
      artist_label: artistLabel,
      tracks_data: tracksData,
      status: 'playing',
    })
    .select('id')
    .single()

  if (roundErr || !round) {
    throw new PartyRoundError('Failed to create round', 'round_insert_failed')
  }

  // -- One game_session per member (same snapshot) ----------------------
  const sessionRows = members.map((m) => ({
    challenge_id: null,
    user_id: m.user_id,
    difficulty,
    total_questions: serverTracks.length,
    tracks_data: tracksData,
    party_round_id: round.id,
  }))

  const { error: sessErr } = await admin.from('game_sessions').insert(sessionRows)
  if (sessErr) {
    throw new PartyRoundError('Failed to create round sessions', 'session_insert_failed')
  }

  return round.id
}

// ---------------------------------------------------------------------
// Full party state for the client
// ---------------------------------------------------------------------

export async function getPartyState(
  admin: Admin,
  code: string,
  userId: string,
): Promise<PartyStateResponse | null> {
  const { data: partyRaw } = await admin
    .from('parties')
    .select(PARTY_SELECT)
    .eq('code', code)
    .maybeSingle()

  const party = partyRaw as PartyRow | null
  if (!party) return null

  const { data: membersRaw } = await admin
    .from('party_members')
    .select(MEMBER_SELECT)
    .eq('party_id', party.id)
    .order('turn_order', { ascending: true })

  const members = (membersRaw ?? []) as unknown as MemberRow[]

  const memberViews: PartyMemberView[] = members.map((m) => ({
    userId: m.user_id,
    username: m.profiles?.username ?? 'Jugador',
    avatarUrl: m.profiles?.avatar_url ?? null,
    artistId: m.deezer_artist_id,
    artistName: m.artist_name,
    isReady: m.is_ready,
    turnOrder: m.turn_order,
    isHost: m.user_id === party.host_user_id,
  }))

  // -- Rounds + sessions for leaderboard / current round ----------------
  const { data: roundsRaw } = await admin
    .from('party_rounds')
    .select('id, round_number, round_type, owner_member_id, artist_label, tracks_data, status')
    .eq('party_id', party.id)
    .order('round_number', { ascending: true })

  const rounds = (roundsRaw ?? []) as unknown as RoundRow[]
  const roundById = new Map(rounds.map((r) => [r.id, r]))
  const roundIds = rounds.map((r) => r.id)

  let sessions: {
    user_id: string | null
    score: number
    correct_answers: number
    duration_ms: number | null
    party_round_id: string | null
    completed_at: string | null
  }[] = []

  if (roundIds.length > 0) {
    const { data: sessRaw } = await admin
      .from('game_sessions')
      .select('user_id, score, correct_answers, duration_ms, party_round_id, completed_at')
      .in('party_round_id', roundIds)
    sessions = sessRaw ?? []
  }

  // -- Current round view -----------------------------------------------
  const currentRoundRow =
    party.status === 'in_progress'
      ? rounds.find((r) => r.round_number === party.current_round) ?? null
      : null

  let round: PartyRoundView | null = null
  if (currentRoundRow) {
    const ownerMember = members.find((m) => m.id === currentRoundRow.owner_member_id)
    const roundSessions = sessions.filter(
      (s) => s.party_round_id === currentRoundRow.id && s.completed_at !== null,
    )
    // Fastest finisher this round = lowest completed duration_ms.
    let fastestUserId: string | null = null
    let fastestMs = Infinity
    for (const s of roundSessions) {
      if (s.user_id && (s.duration_ms ?? Infinity) < fastestMs) {
        fastestMs = s.duration_ms ?? Infinity
        fastestUserId = s.user_id
      }
    }
    round = {
      roundNumber: currentRoundRow.round_number,
      roundType: currentRoundRow.round_type,
      artistLabel: currentRoundRow.artist_label,
      ownerUserId: ownerMember?.user_id ?? null,
      finishedCount: roundSessions.length,
      totalMembers: members.length,
      fastestUserId,
    }
  }

  // -- The caller's playable session for the current round --------------
  let mySession: PartyMySession | null = null
  let myRoundDone = false

  if (currentRoundRow) {
    const { data: mineRaw } = await admin
      .from('game_sessions')
      .select('id, completed_at')
      .eq('party_round_id', currentRoundRow.id)
      .eq('user_id', userId)
      .maybeSingle()
    const mine = mineRaw as { id: string; completed_at: string | null } | null

    if (mine?.completed_at) {
      myRoundDone = true
    } else if (mine && currentRoundRow.tracks_data) {
      const ownerMember = members.find((m) => m.id === currentRoundRow.owner_member_id)
      const knownArtist =
        currentRoundRow.round_type === 'artist'
          ? ownerMember?.artist_name ?? currentRoundRow.artist_label
          : undefined
      mySession = {
        sessionId: mine.id,
        difficulty: party.difficulty,
        totalQuestions: currentRoundRow.tracks_data.tracks.length,
        // Party rounds are artist-based → reveal the cover in Intermediate.
        tracks: currentRoundRow.tracks_data.tracks.map((t) =>
          buildClientTrack(party.difficulty, t, 'artist'),
        ),
        ...(knownArtist ? { knownArtist } : {}),
      }
    }
  }

  // -- Leaderboard (accumulated across finished + current rounds) -------
  const agg = new Map<
    string,
    {
      totalScore: number
      totalCorrect: number
      totalDurationMs: number
      roundScores: Record<number, number>
    }
  >()
  for (const m of members) {
    agg.set(m.user_id, {
      totalScore: 0,
      totalCorrect: 0,
      totalDurationMs: 0,
      roundScores: {},
    })
  }
  for (const s of sessions) {
    if (!s.user_id || s.completed_at === null) continue
    const entry = agg.get(s.user_id)
    if (!entry) continue
    entry.totalScore += s.score ?? 0
    entry.totalCorrect += s.correct_answers ?? 0
    entry.totalDurationMs += s.duration_ms ?? 0
    const r = s.party_round_id ? roundById.get(s.party_round_id) : null
    if (r) entry.roundScores[r.round_number] = s.score ?? 0
  }

  const leaderboard: PartyLeaderboardEntry[] = memberViews
    .map((mv) => {
      const a = agg.get(mv.userId)!
      return {
        userId: mv.userId,
        username: mv.username,
        avatarUrl: mv.avatarUrl,
        totalScore: a.totalScore,
        totalCorrect: a.totalCorrect,
        totalDurationMs: a.totalDurationMs,
        roundScores: a.roundScores,
        rank: 0,
      }
    })
    .sort(
      (x, y) =>
        y.totalScore - x.totalScore ||
        y.totalCorrect - x.totalCorrect ||
        x.totalDurationMs - y.totalDurationMs,
    )
  leaderboard.forEach((e, i) => {
    e.rank = i + 1
  })

  return {
    code: party.code,
    status: party.status,
    difficulty: party.difficulty,
    currentRound: party.current_round,
    totalRounds: party.total_rounds,
    hostUserId: party.host_user_id,
    me: { userId, isHost: userId === party.host_user_id },
    members: memberViews,
    round,
    mySession,
    myRoundDone,
    leaderboard,
  }
}
