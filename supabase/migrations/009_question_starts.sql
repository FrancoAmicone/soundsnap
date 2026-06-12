-- =====================================================================
-- SoundSnap — Migration 009: server-authoritative question timing
-- =====================================================================
-- Records when each question actually began, server-side, so /answer can
-- compute the elapsed time from a trusted clock instead of trusting the
-- client's `timeTakenMs` (which a cheater could send as 0 to farm the
-- speed bonus).
--
-- Flow:
--   1. The client POSTs /api/session/question-start when a question's
--      audio starts → we insert (session_id, track_id, started_at=now())
--      ONCE (re-tries are ignored so the clock can't be reset).
--   2. /api/session/answer reads started_at and uses now()-started_at
--      (clamped to [0, 30s]) for scoring.
--
-- Written exclusively by the service client (API routes), so RLS is
-- enabled with NO policies to block any direct client access.
-- =====================================================================

create table if not exists public.session_question_starts (
  session_id  uuid not null references public.game_sessions (id) on delete cascade,
  track_id    text not null,
  started_at  timestamptz not null default now(),
  primary key (session_id, track_id)
);

alter table public.session_question_starts enable row level security;
-- Intentionally no policies: only the service key (API routes) may access.
