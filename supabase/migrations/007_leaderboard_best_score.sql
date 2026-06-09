-- =====================================================================
-- Migration 007: Leaderboard — keep only the best score per user
-- =====================================================================
-- The previous view exposed every completed session, so a user who
-- played the same challenge/difficulty twice would appear multiple
-- times. This migration replaces it with a view that first picks the
-- best session per (challenge_id, difficulty, user_id) — highest score,
-- then shortest duration as tiebreaker — and only then applies the
-- rank window function across users.
-- =====================================================================

DROP VIEW IF EXISTS public.leaderboard;

CREATE VIEW public.leaderboard
WITH (security_invoker = true)
AS
SELECT
  challenge_id,
  difficulty,
  user_id,
  username,
  avatar_url,
  score,
  correct_answers,
  total_questions,
  duration_ms,
  completed_at,
  rank() OVER (
    PARTITION BY challenge_id, difficulty
    ORDER BY score DESC, duration_ms ASC
  ) AS rank
FROM (
  -- One row per (challenge, difficulty, user): their personal best
  SELECT DISTINCT ON (gs.challenge_id, gs.difficulty, gs.user_id)
    gs.challenge_id,
    gs.difficulty,
    gs.user_id,
    p.username,
    p.avatar_url,
    gs.score,
    gs.correct_answers,
    gs.total_questions,
    gs.duration_ms,
    gs.completed_at
  FROM game_sessions gs
  JOIN profiles p ON p.id = gs.user_id
  WHERE gs.user_id IS NOT NULL
    AND gs.completed_at IS NOT NULL
  ORDER BY
    gs.challenge_id,
    gs.difficulty,
    gs.user_id,
    gs.score DESC,
    gs.duration_ms ASC
) best_per_user;
