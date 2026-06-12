// =====================================================================
// SoundSnap — Scoring
// =====================================================================
// Pure, server-side scoring functions. Single source of truth for the
// rules in SOUNDSNAP_MVP.md §7. Do not duplicate inline elsewhere.
//
//   Per-question points  = base + speed bonus, where speed bucket =
//     <5s  → fastBonus
//     <15s → midBonus
//     ≥15s → 0
//
//   Final score          = Σ(question points) × multiplier, rounded
//
// Wrong / timeout always returns 0 points. Hard mode awards 0 unless
// BOTH artist AND title are correct (see lib/matchAnswer.ts).
// =====================================================================

import type { Difficulty } from '@/types'

const BASE_POINTS: Record<Difficulty, number> = {
  easy: 100,
  intermediate: 100,
  hard: 150,
}

/** [bonus when answered <5s, bonus when answered <15s] */
const SPEED_BONUS: Record<Difficulty, readonly [number, number]> = {
  easy: [50, 25],
  intermediate: [50, 25],
  hard: [75, 35],
}

const MULTIPLIER: Record<Difficulty, number> = {
  easy: 1.0,
  intermediate: 1.3,
  hard: 1.7,
}

/** Default question count per difficulty. Match SOUNDSNAP_MVP §3. */
export const DEFAULT_QUESTION_COUNT: Record<Difficulty, number> = {
  easy: 5,
  intermediate: 7,
  hard: 10,
}

export function getMultiplier(difficulty: Difficulty): number {
  return MULTIPLIER[difficulty]
}

/** Streak bonus tuning: +25 per consecutive correct beyond the first, capped. */
const STREAK_STEP = 25
const STREAK_CAP = 5

/**
 * Bonus for a run of consecutive correct answers. `consecutiveCorrect` is
 * the length of the streak INCLUDING the current answer (so the first
 * correct answer = 1 → no bonus; 2 in a row → +25; … capped at +125).
 * Added to the raw question points, so it receives the difficulty
 * multiplier at /complete like everything else.
 */
export function calcStreakBonus(consecutiveCorrect: number): number {
  if (consecutiveCorrect <= 1) return 0
  return Math.min(consecutiveCorrect - 1, STREAK_CAP) * STREAK_STEP
}

/**
 * Points earned for a single question.
 *
 * @param isCorrect  Final verdict for the question. For Hard mode this
 *                   means BOTH artist and title fuzzy-matched.
 * @param timeTakenMs Milliseconds between the moment audio became
 *                   playable and the moment the player submitted.
 *                   Negative or NaN values are clamped to 0 (treated
 *                   as instant) so we never reward malformed input.
 * @param difficulty Active difficulty.
 */
export function calcQuestionPoints(
  isCorrect: boolean,
  timeTakenMs: number,
  difficulty: Difficulty,
): number {
  if (!isCorrect) return 0

  const safeMs =
    Number.isFinite(timeTakenMs) && timeTakenMs > 0 ? timeTakenMs : 0
  const seconds = safeMs / 1000

  const base = BASE_POINTS[difficulty]
  const [fastBonus, midBonus] = SPEED_BONUS[difficulty]
  const speed = seconds < 5 ? fastBonus : seconds < 15 ? midBonus : 0

  return base + speed
}

/**
 * Apply the difficulty multiplier and round to an integer.
 *
 * Splitting `calcQuestionPoints` (per-answer) and `calcFinalScore`
 * (per-session) lets the answer route persist raw points in
 * `session_answers.points_earned` while the complete route applies the
 * multiplier exactly once for the leaderboard score.
 */
export function calcFinalScore(
  questionPoints: readonly number[],
  difficulty: Difficulty,
): number {
  const total = questionPoints.reduce((sum, p) => sum + p, 0)
  return Math.round(total * MULTIPLIER[difficulty])
}
