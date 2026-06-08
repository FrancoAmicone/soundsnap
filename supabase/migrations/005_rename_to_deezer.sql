-- =====================================================================
-- SoundSnap — Migration 005: switch audio provider Spotify -> Deezer
-- =====================================================================
-- Spotify deprecated `preview_url` for the vast majority of tracks
-- (major-label catalog included), which breaks the core gameplay loop
-- (a playable 5s clip). Deezer exposes a 30s `preview` MP3 for almost
-- every track, with no API key / OAuth required.
--
-- The data model is provider-agnostic; only the identifier columns
-- carried a `spotify_` prefix. These tables are empty at MVP time, so
-- a plain rename is safe.
-- =====================================================================

alter table public.challenges
  rename column spotify_playlist_id to deezer_playlist_id;

alter table public.session_answers
  rename column spotify_track_id to deezer_track_id;
