// =====================================================================
// SoundSnap — Answer matching (server-only)
// =====================================================================
// Fuzzy match for free-text answers in Intermediate / Hard modes.
//
// Strategy:
//   1. Normalize both strings (lowercase, strip accents, drop
//      punctuation, collapse whitespace).
//   2. Strip a small set of "noise" suffixes that Spotify routinely
//      tacks onto track titles ("- Remastered 2011", "(Live)" etc.)
//      so the player only has to type the song name.
//   3. Exact match → correct.
//   4. Otherwise compare Levenshtein distance to a length-aware
//      threshold (per SOUNDSNAP_MVP §9): 2 for ≤8 chars, else 3.
//
// All matching runs server-side. The correct title/artist is read from
// game_sessions.tracks_data and never crosses the wire to the client.
// =====================================================================

const NOISE_PATTERNS: readonly RegExp[] = [
  // " - Remastered", " - 2011 Remaster", " - Live at ...", " - Radio Edit" etc.
  /\s-\s.*/,
  // Trailing parenthesised qualifiers: "(Remastered 2009)", "(Live)", "(feat. X)" etc.
  /\s*\([^)]*\)\s*/g,
  // Trailing bracketed qualifiers: "[Bonus Track]", "[Deluxe]" etc.
  /\s*\[[^\]]*\]\s*/g,
  // Standalone feat/ft/featuring (outside parens): "Title feat. Artist"
  /\s+(?:feat|ft|featuring)[.\s].*/i,
]

export function normalize(input: string): string {
  if (!input) return ''
  let s = input.toLowerCase().trim()
  s = s
    .normalize('NFD')
    // Remove combining diacritical marks
    .replace(/[\u0300-\u036f]/g, '')
  // Strip noise suffixes iteratively (e.g. "Title (Live) - Remastered")
  let prev: string
  do {
    prev = s
    for (const pattern of NOISE_PATTERNS) s = s.replace(pattern, '')
  } while (s !== prev)
  s = s
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}

/**
 * Levenshtein edit distance with a two-row rolling buffer (O(min(a,b))
 * memory). Pure ASCII expected after normalization, so we can index by
 * code unit safely.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Ensure b is the shorter string so the buffer is min-sized.
  if (a.length < b.length) {
    const tmp = a
    a = b
    b = tmp
  }

  const n = a.length
  const m = b.length
  let prev = new Array<number>(m + 1)
  let curr = new Array<number>(m + 1)
  for (let j = 0; j <= m; j++) prev[j] = j

  for (let i = 1; i <= n; i++) {
    curr[0] = i
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
      // deletion, insertion, substitution
      const d = prev[j] + 1
      const ins = curr[j - 1] + 1
      const sub = prev[j - 1] + cost
      curr[j] = d < ins ? (d < sub ? d : sub) : ins < sub ? ins : sub
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }

  return prev[m]
}

/**
 * Fuzzy comparison used by both Intermediate (title) and Hard
 * (artist + title) modes.
 *
 * Returns true when:
 *   - normalized strings are identical, OR
 *   - levenshtein distance is within the per-length threshold:
 *       ≤ 8 chars → 2 edits
 *       > 8 chars → 3 edits
 */
export function isCorrectAnswer(userInput: string, correct: string): boolean {
  const u = normalize(userInput)
  const c = normalize(correct)
  if (!c) return false
  if (u === c) return true
  if (!u) return false
  const threshold = c.length <= 8 ? 2 : 3
  return levenshtein(u, c) <= threshold
}

export interface HardAnswerVerdict {
  artistOk: boolean
  titleOk: boolean
  isCorrect: boolean
}

/**
 * Validate Hard mode (artist + title) where both fields are required
 * and any single failure makes the question worth 0 points.
 *
 * The per-field flags are still returned so the answer route can log
 * `artist_correct` / `title_correct` independently in `session_answers`
 * for future analytics (e.g. "what % of Hard players nail the artist
 * but miss the title?").
 */
export function validateHardAnswer(
  userArtist: string,
  correctArtist: string,
  userTitle: string,
  correctTitle: string,
): HardAnswerVerdict {
  const artistOk = isCorrectAnswer(userArtist, correctArtist)
  const titleOk = isCorrectAnswer(userTitle, correctTitle)
  return { artistOk, titleOk, isCorrect: artistOk && titleOk }
}
