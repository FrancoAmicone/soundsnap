// =====================================================================
// SoundSnap — Shared types
// =====================================================================
// Single source of truth for the contract between API routes, the Edge
// Function and (eventually) the game UI. Any field that contains the
// correct title or artist for an unanswered track lives in
// `ServerTrack` / `SessionTracksData` and MUST stay server-side.
// =====================================================================

export type Difficulty = 'easy' | 'intermediate' | 'hard'

/** Source type for a challenge's track pool. */
export type ChallengeType = 'playlist' | 'manual' | 'artist'

// ---------------------------------------------------------------------
// Deezer / Edge Function shapes
// ---------------------------------------------------------------------

/**
 * What the Edge Function returns for each track. `name` and `artist`
 * are sensitive — they are the answer.
 */
export interface DeezerTrack {
  id: string
  name: string
  artist: string
  albumName: string
  previewUrl: string
  coverUrl: string | null
}

export interface GetPlaylistTracksRequest {
  playlistId: string
  limit?: number
}

export interface GetPlaylistTracksResponse {
  tracks: DeezerTrack[]
  /** Total tracks fetched from Deezer before filtering empty previews. */
  fetched: number
  /** Tracks kept after filtering empty previews. */
  withPreview: number
}

export interface GetArtistTracksResponse {
  tracks: DeezerTrack[]
  fetched: number
  withPreview: number
}

export interface SearchTracksResponse {
  tracks: DeezerTrack[]
}

/** Returned by the Edge Function when searchType = 'artist'. */
export interface ArtistSearchResult {
  id: string
  name: string
  /** Deezer picture_medium URL */
  picture: string | null
  nbFan: number
}

export interface SearchArtistsResponse {
  artists: ArtistSearchResult[]
}

// ---------------------------------------------------------------------
// Server-side session snapshot (lives in game_sessions.tracks_data)
// ---------------------------------------------------------------------

/**
 * One track as stored server-side. Holds the answers used to validate
 * each /api/session/answer call. Never returned to the client until the
 * answer has been submitted (or the session is completed).
 */
export interface ServerTrack {
  trackId: string
  correctTitle: string
  correctArtist: string
  previewUrl: string
  coverUrl: string | null
  /** Easy mode only — list of 4 option strings (titles), correct included. */
  mcOptions: string[] | null
  /** Easy mode only — index (0-3) of the correct option in `mcOptions`. */
  mcCorrectIndex: number | null
}

export interface SessionTracksData {
  tracks: ServerTrack[]
  createdAt: string
}

// ---------------------------------------------------------------------
// Client-facing track payload (returned by /api/session/start)
// ---------------------------------------------------------------------

/**
 * Per-track payload that is safe to expose to the client at session
 * start. Uses an opaque `trackId` (the Deezer track id) so the client
 * can echo it back in /answer without the server having to remember
 * which track is the current one.
 *
 * Difficulty rules:
 *   - easy:         coverUrl + mcOptions populated; artist NOT exposed
 *   - intermediate: depends on `revealKind` (see below)
 *   - hard:         coverUrl null; artist NOT exposed
 *
 * Intermediate reveal (at 15s in the UI):
 *   - revealKind 'artist' (playlist/manual origin): `artist` is exposed so
 *     the client can reveal the artist name; `coverUrl` stays null.
 *   - revealKind 'cover'  (artist/party/mix origin): the artist is already
 *     known, so instead `coverUrl` is exposed to reveal the album art;
 *     `artist` stays null (it is shown separately via `knownArtist`).
 */
export interface ClientTrack {
  trackId: string
  previewUrl: string
  /** Easy always; Intermediate when revealKind === 'cover'. */
  coverUrl: string | null
  /** Intermediate when revealKind === 'artist' — revealed at 15s. */
  artist: string | null
  /** Easy only — 4 strings, shuffled, ordered as displayed. */
  mcOptions: string[] | null
  /** Intermediate only — what to reveal at 15s. Absent for easy/hard. */
  revealKind?: 'artist' | 'cover'
}

/**
 * Origin of a track pool. Decides the Intermediate reveal mechanic:
 *   - 'playlist': artist unknown → reveal the artist at 15s.
 *   - 'artist':   artist known   → reveal the album cover at 15s.
 * Playlist and manual challenges map to 'playlist'; artist challenges and
 * all party rounds (including the mix round) map to 'artist'.
 */
export type TrackOrigin = 'playlist' | 'artist'

// ---------------------------------------------------------------------
// /api/session/start
// ---------------------------------------------------------------------

/**
 * Two variants:
 *   - challengeId: play a pre-created challenge (playlist/manual/artist type)
 *   - artistId:    ephemeral "play by artist" session (no challenge row needed)
 */
export type SessionStartRequest =
  | { challengeId: string; difficulty: Difficulty }
  | { artistId: string; artistName: string; difficulty: Difficulty }

export interface SessionStartResponse {
  sessionId: string
  difficulty: Difficulty
  totalQuestions: number
  tracks: ClientTrack[]
}

// ---------------------------------------------------------------------
// /api/session/answer
// ---------------------------------------------------------------------

/**
 * Client → server answer payload. The shape branches on difficulty but
 * we keep one TS union so the route can validate it once.
 */
export type AnswerRequest =
  | {
      sessionId: string
      trackId: string
      difficulty: 'easy'
      mcAnswerIndex: number
      timeTakenMs: number
    }
  | {
      sessionId: string
      trackId: string
      difficulty: 'intermediate'
      userTitle: string
      timeTakenMs: number
      /** Whether the artist had been revealed when the player answered. */
      artistRevealed?: boolean
    }
  | {
      sessionId: string
      trackId: string
      difficulty: 'hard'
      userArtist: string
      userTitle: string
      timeTakenMs: number
    }

export interface AnswerResponse {
  isCorrect: boolean
  pointsEarned: number
  /** The correct track title (revealed AFTER the answer is submitted). */
  correctTitle: string
  /** The correct artist (revealed AFTER the answer is submitted). */
  correctArtist: string
  /** Hard only — per-field feedback for richer UI animations. */
  artistOk?: boolean
  titleOk?: boolean
  /** Current consecutive-correct streak length (0 when the answer is wrong). */
  streak: number
  /** Streak bonus included in pointsEarned (0 when no streak). */
  streakBonus: number
}

// ---------------------------------------------------------------------
// /api/session/question-start
// ---------------------------------------------------------------------

export interface QuestionStartRequest {
  sessionId: string
  trackId: string
}

// ---------------------------------------------------------------------
// /api/session/complete
// ---------------------------------------------------------------------

export interface SessionCompleteRequest {
  sessionId: string
}

export interface SessionCompleteResponse {
  sessionId: string
  difficulty: Difficulty
  totalQuestions: number
  correctAnswers: number
  /** Σ(question points) before the multiplier. */
  rawPoints: number
  /** Σ(question points) × multiplier, rounded — saved in `score`. */
  finalScore: number
  durationMs: number
  /** Whether the session was persisted (false for guests). */
  saved: boolean
  /** Set when the session was an ephemeral artist play. */
  artistName?: string
}

// ---------------------------------------------------------------------
// Generic API error envelope
// ---------------------------------------------------------------------

export interface ApiError {
  error: string
  code?: string
  details?: unknown
}

// ---------------------------------------------------------------------
// Party mode (multiplayer)
// ---------------------------------------------------------------------

export type PartyStatus = 'lobby' | 'in_progress' | 'finished'
export type PartyRoundType = 'artist' | 'mix'

/** A party member as exposed to the client (no sensitive data). */
export interface PartyMemberView {
  userId: string
  username: string
  avatarUrl: string | null
  artistId: string | null
  artistName: string | null
  isReady: boolean
  turnOrder: number
  isHost: boolean
}

/** Current round metadata (no answers — tracks are served per-member). */
export interface PartyRoundView {
  roundNumber: number
  roundType: PartyRoundType
  artistLabel: string
  /** Member whose artist this round belongs to (null for mix). */
  ownerUserId: string | null
  /** How many members already finished this round. */
  finishedCount: number
  totalMembers: number
  /** Member with the lowest round duration among those who finished (null until any do). */
  fastestUserId: string | null
}

/** One row of the party leaderboard (accumulated across finished rounds). */
export interface PartyLeaderboardEntry {
  userId: string
  username: string
  avatarUrl: string | null
  totalScore: number
  totalCorrect: number
  totalDurationMs: number
  /** Score per round number, e.g. { "1": 230, "2": 0 }. */
  roundScores: Record<number, number>
  rank: number
}

/**
 * The caller's playable session for the current round, when the party is
 * in progress and the caller hasn't finished yet. Mirrors the safe payload
 * of /api/session/start so it can drive GameSession in pre-created mode.
 */
export interface PartyMySession {
  sessionId: string
  difficulty: Difficulty
  totalQuestions: number
  tracks: ClientTrack[]
  /** Set for artist rounds (artist known); undefined for mix rounds. */
  knownArtist?: string
}

/** Full party state returned by GET /api/party/[code]. */
export interface PartyStateResponse {
  code: string
  status: PartyStatus
  difficulty: Difficulty
  currentRound: number
  totalRounds: number
  hostUserId: string
  me: { userId: string; isHost: boolean }
  members: PartyMemberView[]
  round: PartyRoundView | null
  /** Present only if status==='in_progress' and the caller hasn't finished. */
  mySession: PartyMySession | null
  /** True when the caller already completed the current round. */
  myRoundDone: boolean
  leaderboard: PartyLeaderboardEntry[]
}

// -- Request payloads --------------------------------------------------

export interface PartyCreateRequest {
  difficulty: Difficulty
}
export interface PartyCreateResponse {
  code: string
}
export interface PartyJoinRequest {
  code: string
}
export interface PartyArtistRequest {
  code: string
  artistId: string
  artistName: string
}
export interface PartyReadyRequest {
  code: string
  ready: boolean
}
export interface PartyActionRequest {
  code: string
}

// -- Realtime broadcast events (channel `party:<code>`) ----------------

export type PartyBroadcastEvent =
  | { type: 'lobby_updated' }
  | { type: 'round_started'; round: number }
  | { type: 'member_finished'; userId: string; round: number }
  | { type: 'round_finished'; round: number }
  | { type: 'party_finished' }
  | { type: 'reaction'; emoji: string; userId: string }
  | { type: 'rematch'; code: string }
