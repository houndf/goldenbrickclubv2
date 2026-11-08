-- Golden Brick Club 2.0 — initial schema.
--
-- Players are tracked by a hidden id (auth.users.id), never by username,
-- so renaming never detaches anyone's history.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.player_role as enum ('player', 'admin');
create type public.scoring_system as enum ('legacy_exact', 'pick_v2');
create type public.season_status as enum ('upcoming', 'live', 'final');
create type public.conference as enum ('east', 'west');
create type public.match_status as enum ('scheduled', 'live', 'final', 'postponed');
create type public.side as enum ('home', 'away');
create type public.result_pick as enum ('home', 'draw', 'away');
create type public.result_source as enum ('api', 'admin');

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique check (char_length(username) between 2 and 24),
  initials text not null check (initials ~ '^[A-Z0-9]{1,2}$'),
  avatar_color text not null default '#3DD6C4' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  avatar_url text,
  role public.player_role not null default 'player',
  extra_gold boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Seasons, segments, teams, matches
-- ---------------------------------------------------------------------------
create table public.seasons (
  id smallint primary key,                      -- the year, e.g. 2027
  scoring public.scoring_system not null,
  status public.season_status not null default 'upcoming'
);

create table public.segments (
  id bigint generated always as identity primary key,
  season_id smallint not null references public.seasons (id) on delete cascade,
  number smallint not null check (number > 0),
  unique (season_id, number)
);

create table public.teams (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z]{2,4}$'),
  name text not null unique,
  conference public.conference not null
);

create table public.matches (
  id text primary key,                          -- e.g. ATL27-01
  season_id smallint not null references public.seasons (id) on delete cascade,
  segment_id bigint not null references public.segments (id),
  home_team_id bigint not null references public.teams (id),
  away_team_id bigint not null references public.teams (id),
  kickoff_at timestamptz not null,
  -- Picks stay open until this moment (kickoff + 15 minutes by default).
  locks_at timestamptz not null,
  venue text,
  status public.match_status not null default 'scheduled',
  home_goals smallint check (home_goals >= 0),
  away_goals smallint check (away_goals >= 0),
  first_goal public.side,
  result_source public.result_source,
  external_id text unique,                      -- id in the sports API
  check (home_team_id <> away_team_id),
  -- A final needs a score. A 0–0 can't have a first goal. (2026 archive
  -- matches have no first-goal data, so the app enforces the reverse.)
  check (status <> 'final' or (home_goals is not null and away_goals is not null)),
  check (first_goal is null or coalesce(home_goals, 0) + coalesce(away_goals, 0) > 0)
);

create index matches_season_kickoff_idx on public.matches (season_id, kickoff_at);

-- ---------------------------------------------------------------------------
-- Picks (2027+ system)
-- ---------------------------------------------------------------------------
create table public.picks (
  match_id text not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  result public.result_pick not null,
  margin smallint check (margin in (1, 2, 3)),  -- 3 means "3 or more"
  first_goal public.side,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id),
  check (result <> 'draw' or margin is null)
);

-- ---------------------------------------------------------------------------
-- 2026 archive (exact-score system). Players are matched to accounts later.
-- ---------------------------------------------------------------------------
create table public.legacy_players (
  id bigint generated always as identity primary key,
  name text not null unique,                    -- 2026 display name
  profile_id uuid unique references public.profiles (id) on delete set null
);

create table public.legacy_picks (
  match_id text not null references public.matches (id) on delete cascade,
  legacy_player_id bigint not null references public.legacy_players (id) on delete cascade,
  pred_home smallint not null check (pred_home >= 0),
  pred_away smallint not null check (pred_away >= 0),
  submitted_at timestamptz not null,
  primary key (match_id, legacy_player_id)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.segments enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.picks enable row level security;
alter table public.legacy_players enable row level security;
alter table public.legacy_picks enable row level security;

-- Public reference data (the Welcome screen is visible before login).
create policy "Anyone can read seasons" on public.seasons for select using (true);
create policy "Anyone can read segments" on public.segments for select using (true);
create policy "Anyone can read teams" on public.teams for select using (true);
create policy "Anyone can read matches" on public.matches for select using (true);
create policy "Anyone can read legacy players" on public.legacy_players for select using (true);
create policy "Anyone can read legacy picks" on public.legacy_picks for select using (true);
create policy "Anyone can read profiles" on public.profiles for select using (true);

-- Players edit their own profile, but can't make themselves admin or Extra Gold.
create policy "Players update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and extra_gold = (select p.extra_gold from public.profiles p where p.id = auth.uid())
  );

-- Picks: always see your own; everyone else's appear only once the match locks.
create policy "Read own picks, or anyone's after lock" on public.picks
  for select to authenticated
  using (
    player_id = auth.uid()
    or exists (
      select 1 from public.matches m where m.id = match_id and now() >= m.locks_at
    )
  );

create policy "Make own pick before lock" on public.picks
  for insert to authenticated
  with check (
    player_id = auth.uid()
    and exists (
      select 1 from public.matches m where m.id = match_id and now() < m.locks_at
    )
  );

create policy "Change own pick before lock" on public.picks
  for update to authenticated
  using (player_id = auth.uid())
  with check (
    player_id = auth.uid()
    and exists (
      select 1 from public.matches m where m.id = match_id and now() < m.locks_at
    )
  );

-- Admins manage the schedule and results.
create policy "Admins manage seasons" on public.seasons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage segments" on public.segments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage teams" on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage matches" on public.matches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage profiles" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins link legacy players" on public.legacy_players for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Keep picks.updated_at honest.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger picks_touch_updated_at
  before update on public.picks
  for each row execute function public.touch_updated_at();
