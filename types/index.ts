// =====================================================================
// SoundSnap — Shared types
// =====================================================================
// Single source of truth for the contract between API routes, the Edge
// Function and (eventually) the game UI. Any field that contains the
// correct title or artist for an unanswered track lives in
// `ServerTrack` / `SessionTracksData` and MUST stay server-side.
// =====================================================================

export type Difficulty = 'easy' | 'intermediate' | 'hard'

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
 *   - intermediate: coverUrl null; artist exposed (revealed at 15s in UI)
 *   - hard:         coverUrl null; artist NOT exposed
 */
export interface ClientTrack {
  trackId: string
  previewUrl: string
  /** Easy only. */
  coverUrl: string | null
  /** Intermediate only — used by the client timer to reveal at 15s. */
  artist: string | null
  /** Easy only — 4 strings, shuffled, ordered as displayed. */
  mcOptions: string[] | null
}

// ---------------------------------------------------------------------
// /api/session/start
// ---------------------------------------------------------------------

export interface SessionStartRequest {
  challengeId: string
  difficulty: Difficulty
}

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
}

// ---------------------------------------------------------------------
// Generic API error envelope
// ---------------------------------------------------------------------

export interface ApiError {
  error: string
  code?: string
  details?: unknown
}
