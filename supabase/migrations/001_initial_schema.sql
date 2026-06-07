-- =====================================================================
-- SoundSnap — Initial schema (MVP v0.2)
-- =====================================================================
-- Tables: profiles, challenges, game_sessions, session_answers
-- View:   leaderboard (ranked per challenge + difficulty)
-- Auth:   handle_new_user trigger auto-creates a profile from auth.users
-- RLS:    enabled on every table with explicit policies
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles
-- Mirrors auth.users with public-facing fields + role for /admin gating
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique not null,
  avatar_url  text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------
-- challenges
-- ---------------------------------------------------------------------
create table if not exists public.challenges (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text,
  genre_tag            text,
  decade_tag           text,
  spotify_playlist_id  text not null,
  is_guest_allowed     boolean not null default false,
  is_active            boolean not null default true,
  track_count_easy     int  not null default 5,
  track_count_medium   int  not null default 7,
  track_count_hard     int  not null default 10,
  cover_image_url      text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists challenges_active_idx on public.challenges (is_active);
create index if not exists challenges_guest_idx  on public.challenges (is_guest_allowed);

-- Keep updated_at fresh on every UPDATE
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists challenges_set_updated_at on public.challenges;
create trigger challenges_set_updated_at
  before update on public.challenges
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- game_sessions
-- One row per played round. user_id NULL means a guest session.
-- ---------------------------------------------------------------------
create table if not exists public.game_sessions (
  id              uuid primary key default gen_random_uuid(),
  challenge_id    uuid not null references public.challenges (id) on delete cascade,
  user_id         uuid references public.profiles (id) on delete set null,
  difficulty      text not null check (difficulty in ('easy', 'intermediate', 'hard')),
  score           int  not null default 0,
  total_questions int  not null,
  correct_answers int  not null default 0,
  duration_ms     int,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists game_sessions_user_idx
  on public.game_sessions (user_id);
create index if not exists game_sessions_challenge_diff_idx
  on public.game_sessions (challenge_id, difficulty);
create index if not exists game_sessions_leaderboard_idx
  on public.game_sessions (challenge_id, difficulty, score desc, duration_ms asc)
  where user_id is not null and completed_at is not null;

-- ---------------------------------------------------------------------
-- session_answers
-- One row per question answered, supports the 3 difficulty schemas.
-- ---------------------------------------------------------------------
create table if not exists public.session_answers (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.game_sessions (id) on delete cascade,
  spotify_track_id  text not null,
  difficulty        text not null check (difficulty in ('easy', 'intermediate', 'hard')),

  -- Easy (multiple choice)
  mc_answer_index   int,
  mc_correct_index  int,

  -- Intermediate / Hard (free-text title)
  user_title        text,
  title_correct     boolean,

  -- Hard (free-text artist)
  user_artist       text,
  artist_correct    boolean,

  -- Common
  is_correct        boolean,
  time_taken_ms     int,
  artist_revealed   boolean not null default false,
  points_earned     int not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists session_answers_session_idx
  on public.session_answers (session_id);

-- ---------------------------------------------------------------------
-- leaderboard view
-- Public ranking per challenge + difficulty. Guests excluded.
-- ---------------------------------------------------------------------
create or replace view public.leaderboard as
  select
    gs.challenge_id,
    gs.difficulty,
    gs.user_id,
    p.username,
    p.avatar_url,
    gs.score,
    gs.correct_answers,
    gs.total_questions,
    gs.duration_ms,
    gs.completed_at,
    rank() over (
      partition by gs.challenge_id, gs.difficulty
      order by gs.score desc, gs.duration_ms asc
    ) as rank
  from public.game_sessions gs
  join public.profiles p on p.id = gs.user_id
  where gs.user_id is not null
    and gs.completed_at is not null;

-- =====================================================================
-- Row Level Security
-- =====================================================================

-- profiles ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles
  for select
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- challenges ----------------------------------------------------------
alter table public.challenges enable row level security;

drop policy if exists "Active challenges are publicly readable" on public.challenges;
create policy "Active challenges are publicly readable"
  on public.challenges
  for select
  using (
    is_active = true
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admins manage challenges" on public.challenges;
create policy "Admins manage challenges"
  on public.challenges
  for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- game_sessions -------------------------------------------------------
alter table public.game_sessions enable row level security;

drop policy if exists "Public can read completed sessions" on public.game_sessions;
create policy "Public can read completed sessions"
  on public.game_sessions
  for select
  using (
    -- Anyone may read sessions that are part of the public leaderboard
    (user_id is not null and completed_at is not null)
    -- A user may also read their own in-flight sessions
    or auth.uid() = user_id
  );

drop policy if exists "Anyone may insert a session" on public.game_sessions;
create policy "Anyone may insert a session"
  on public.game_sessions
  for insert
  with check (
    -- Logged-in users may only create sessions for themselves
    (auth.uid() is not null and auth.uid() = user_id)
    -- Guests may insert sessions with NULL user_id
    or (auth.uid() is null and user_id is null)
  );

drop policy if exists "Users may update their own sessions" on public.game_sessions;
create policy "Users may update their own sessions"
  on public.game_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- session_answers -----------------------------------------------------
alter table public.session_answers enable row level security;

drop policy if exists "Users may read answers for their sessions" on public.session_answers;
create policy "Users may read answers for their sessions"
  on public.session_answers
  for select
  using (
    exists (
      select 1 from public.game_sessions gs
      where gs.id = session_answers.session_id
        and gs.user_id = auth.uid()
    )
  );

drop policy if exists "Anyone may insert answers" on public.session_answers;
create policy "Anyone may insert answers"
  on public.session_answers
  for insert
  with check (true);

-- =====================================================================
-- Auth: auto-create profile on signup
-- Runs as SECURITY DEFINER to bypass RLS during the auth.users insert.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate     text;
  suffix        int := 0;
begin
  base_username := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );

  -- Pick a unique username, appending a numeric suffix on collision.
  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    candidate,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
