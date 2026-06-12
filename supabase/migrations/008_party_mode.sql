-- =====================================================================
-- SoundSnap — Migration 008: Party mode (multiplayer)
-- =====================================================================
-- Adds the tables for self-paced multiplayer "party" games:
--   parties        — one room (code, host, difficulty, status, round)
--   party_members  — players in a room + their chosen artist
--   party_rounds   — one round per player (or a mix round); holds the
--                    SHARED track snapshot so everyone answers the same
--                    questions.
--
-- A player's round attempt is a normal `game_sessions` row whose
-- `tracks_data` is copied from the round snapshot and whose new
-- `party_round_id` links it to the round. This lets /api/session/answer
-- and /api/session/complete drive party rounds with zero changes.
--
-- All room state is written by API routes using the service key
-- (bypasses RLS). The SELECT policies below exist for defense-in-depth
-- and to allow future Realtime Postgres Changes; live coordination uses
-- Realtime Broadcast + Presence (no table is added to the publication).
-- =====================================================================

-- ---------------------------------------------------------------------
-- parties
-- ---------------------------------------------------------------------
create table if not exists public.parties (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  host_user_id  uuid not null references public.profiles (id) on delete cascade,
  difficulty    text not null check (difficulty in ('easy', 'intermediate', 'hard')),
  status        text not null default 'lobby'
                  check (status in ('lobby', 'in_progress', 'finished')),
  current_round int not null default 0,
  total_rounds  int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists parties_code_idx on public.parties (code);

drop trigger if exists parties_set_updated_at on public.parties;
create trigger parties_set_updated_at
  before update on public.parties
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- party_members
-- ---------------------------------------------------------------------
create table if not exists public.party_members (
  id                uuid primary key default gen_random_uuid(),
  party_id          uuid not null references public.parties (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  deezer_artist_id  text,
  artist_name       text,
  is_ready          boolean not null default false,
  turn_order        int not null,
  joined_at         timestamptz not null default now(),
  unique (party_id, user_id)
);

create index if not exists party_members_party_idx
  on public.party_members (party_id);

-- ---------------------------------------------------------------------
-- party_rounds
-- One row per round. `tracks_data` is the SHARED snapshot (same shape as
-- game_sessions.tracks_data) copied into each member's game_session.
-- ---------------------------------------------------------------------
create table if not exists public.party_rounds (
  id              uuid primary key default gen_random_uuid(),
  party_id        uuid not null references public.parties (id) on delete cascade,
  round_number    int not null,
  round_type      text not null check (round_type in ('artist', 'mix')),
  owner_member_id uuid references public.party_members (id) on delete set null,
  artist_label    text not null,
  tracks_data     jsonb,
  status          text not null default 'playing'
                    check (status in ('playing', 'finished')),
  created_at      timestamptz not null default now(),
  unique (party_id, round_number)
);

create index if not exists party_rounds_party_idx
  on public.party_rounds (party_id);

-- ---------------------------------------------------------------------
-- game_sessions: link a session to a party round
-- ---------------------------------------------------------------------
alter table public.game_sessions
  add column if not exists party_round_id uuid
    references public.party_rounds (id) on delete cascade;

create index if not exists game_sessions_party_round_idx
  on public.game_sessions (party_round_id)
  where party_round_id is not null;

-- ---------------------------------------------------------------------
-- Membership helper (SECURITY DEFINER → avoids RLS self-recursion when a
-- party_members policy needs to check membership of the same table).
-- Defined after party_members exists so the SQL body validates. Always
-- scoped to the caller (auth.uid()), so it cannot leak other users' rows.
-- ---------------------------------------------------------------------
create or replace function public.is_party_member(p_party_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.party_members
    where party_id = p_party_id
      and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_party_member(uuid) from public, anon;
grant execute on function public.is_party_member(uuid) to authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================

-- parties -------------------------------------------------------------
alter table public.parties enable row level security;

drop policy if exists "Members can read their party" on public.parties;
create policy "Members can read their party"
  on public.parties
  for select
  using (
    host_user_id = (select auth.uid())
    or public.is_party_member(id)
  );

-- party_members -------------------------------------------------------
alter table public.party_members enable row level security;

drop policy if exists "Members can read co-members" on public.party_members;
create policy "Members can read co-members"
  on public.party_members
  for select
  using (public.is_party_member(party_id));

-- party_rounds --------------------------------------------------------
alter table public.party_rounds enable row level security;

drop policy if exists "Members can read party rounds" on public.party_rounds;
create policy "Members can read party rounds"
  on public.party_rounds
  for select
  using (public.is_party_member(party_id));

-- =====================================================================
-- leaderboard view — exclude party sessions from the public ranking
-- =====================================================================
-- Party rounds reuse the artist challenge row, so without this filter a
-- party score would pollute that artist's public leaderboard. Re-create
-- the view (same as migration 007) adding `party_round_id is null`.
-- =====================================================================
drop view if exists public.leaderboard;

create view public.leaderboard
with (security_invoker = true)
as
select
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
  rank() over (
    partition by challenge_id, difficulty
    order by score desc, duration_ms asc
  ) as rank
from (
  select distinct on (gs.challenge_id, gs.difficulty, gs.user_id)
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
  from game_sessions gs
  join profiles p on p.id = gs.user_id
  where gs.user_id is not null
    and gs.completed_at is not null
    and gs.party_round_id is null
  order by
    gs.challenge_id,
    gs.difficulty,
    gs.user_id,
    gs.score desc,
    gs.duration_ms asc
) best_per_user;
