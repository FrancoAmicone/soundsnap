-- =====================================================================
-- SoundSnap — Migration 004: server-side track snapshot for sessions
-- =====================================================================
-- Stores per-session, per-track answer data (correct title, artist, MC
-- correct index, MC options) so the gameplay loop can validate answers
-- without ever sending the correct answer to the client beforehand.
--
-- Shape (jsonb):
--   {
--     "tracks": [
--       {
--         "trackId": "spotify:track:...",
--         "correctTitle": "...",
--         "correctArtist": "...",
--         "previewUrl": "...",
--         "coverUrl": "..." | null,
--         "mcOptions": ["a","b","c","d"] | null,   -- Easy only
--         "mcCorrectIndex": 2 | null               -- Easy only
--       }
--     ],
--     "createdAt": "2026-06-07T..."
--   }
--
-- RLS on game_sessions already restricts SELECT to:
--   - sessions where user_id = auth.uid()  (in-flight)
--   - completed sessions visible to everyone (after completion the
--     correct answers are no longer secret).
--
-- Guests have user_id NULL and cannot SELECT their in-flight session at
-- all, which is desirable: API routes use the secret key to read
-- tracks_data and validate answers on their behalf.
-- =====================================================================

alter table public.game_sessions
  add column if not exists tracks_data jsonb;

-- The column is intentionally nullable on insert: completed sessions or
-- legacy rows without snapshot data are still valid for leaderboard.
comment on column public.game_sessions.tracks_data is
  'Server-only snapshot of the tracks chosen for this session. Includes correct title/artist and (Easy) MC options + correct index. Never returned to the client.';
