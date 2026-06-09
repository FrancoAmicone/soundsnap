-- =====================================================================
-- SoundSnap — Migration 006: challenge types + ephemeral artist sessions
-- =====================================================================
-- Adds support for three challenge source types:
--   'playlist' (default, existing behaviour) — tracks fetched from a
--              Deezer public playlist at session-start time.
--   'manual'   — tracks built by the admin via track search; stored in
--              `pinned_tracks` jsonb.
--   'artist'   — tracks fetched from a Deezer artist's top-songs at
--              session-start time; `deezer_artist_id` identifies the artist.
--
-- Hybrid support (playlist + manual additions):
--   `pinned_tracks` holds extra tracks added on top of any playlist.
--   `excluded_track_ids` holds track IDs to skip from the base source.
--
-- Also enables ephemeral "Play by artist" sessions where a user can
-- search any artist and play instantly without the admin pre-creating a
-- challenge. These sessions have challenge_id = NULL and carry the
-- artist info directly on the session row.
-- =====================================================================

-- ---------------------------------------------------------------------
-- challenges: add type + source columns
-- ---------------------------------------------------------------------

-- Make playlist ID nullable (manual and artist challenges have none)
alter table public.challenges
  alter column deezer_playlist_id drop not null;

-- Source type
alter table public.challenges
  add column if not exists challenge_type text
    not null default 'playlist'
    check (challenge_type in ('playlist', 'manual', 'artist'));

-- Deezer artist ID (used when challenge_type = 'artist')
alter table public.challenges
  add column if not exists deezer_artist_id text;

-- Manually pinned tracks: array of full track objects so /session/start
-- can use them directly without an extra Deezer round-trip.
-- Shape: [{ id, name, artist, albumName, previewUrl, coverUrl }]
alter table public.challenges
  add column if not exists pinned_tracks jsonb;

-- Track IDs to exclude from the base source (playlist or artist fetch).
alter table public.challenges
  add column if not exists excluded_track_ids text[];

-- Index for artist-type challenges
create index if not exists challenges_artist_idx
  on public.challenges (deezer_artist_id)
  where deezer_artist_id is not null;

-- ---------------------------------------------------------------------
-- game_sessions: allow ephemeral artist sessions (no challenge row)
-- ---------------------------------------------------------------------

-- Allow NULL challenge_id for user-initiated "play by artist" sessions
alter table public.game_sessions
  alter column challenge_id drop not null;

-- Deezer artist ID for ephemeral sessions
alter table public.game_sessions
  add column if not exists ephemeral_artist_id text;

-- Human-readable artist name for the end-of-game summary
alter table public.game_sessions
  add column if not exists ephemeral_artist_name text;

-- Index to find ephemeral sessions by artist (leaderboard / analytics)
create index if not exists game_sessions_artist_idx
  on public.game_sessions (ephemeral_artist_id)
  where ephemeral_artist_id is not null;
