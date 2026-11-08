-- Tournaments ("Cups"): round-by-round "who advances" picks, scored and
-- ranked separately from the season. Points per correct pick = the round's
-- points (1, 2, 3, …). Misses and wrong picks score 0. The final round also
-- takes a total-goals guess, used only to break ties for the Oracle trophy.

create type public.tournament_status as enum ('setup', 'live', 'final');

create table public.tournaments (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 2 and 60),
  trophy_name text not null check (char_length(trophy_name) between 2 and 80),
  status public.tournament_status not null default 'setup',
  oracle_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- At most one live tournament at a time (it drives the Cup tab).
create unique index tournaments_one_live on public.tournaments ((true)) where status = 'live';

create table public.tournament_rounds (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments (id) on delete cascade,
  number smallint not null check (number > 0),
  name text not null check (char_length(name) between 1 and 40),
  points smallint not null check (points > 0),
  -- Picks for every matchup in the round lock at this moment.
  locks_at timestamptz,
  is_final boolean not null default false,
  unique (tournament_id, number)
);

create table public.tournament_ties (
  id bigint generated always as identity primary key,
  round_id bigint not null references public.tournament_rounds (id) on delete cascade,
  slot smallint not null default 1,
  label text,                                   -- e.g. "EAST"
  team_a_id bigint not null references public.teams (id),
  team_b_id bigint not null references public.teams (id),
  seed_a smallint,
  seed_b smallint,
  winner public.side,                           -- 'home' = team A, 'away' = team B
  total_goals smallint check (total_goals >= 0), -- final only: for the tie-breaker
  check (team_a_id <> team_b_id)
);

create table public.tournament_picks (
  tie_id bigint not null references public.tournament_ties (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  pick public.side not null,
  total_goals smallint check (total_goals between 0 and 30),
  updated_at timestamptz not null default now(),
  primary key (tie_id, player_id)
);

create index tournament_rounds_tournament_idx on public.tournament_rounds (tournament_id);
create index tournament_ties_round_idx on public.tournament_ties (round_id);

-- True when the round containing this tie is still open for picks.
create or replace function public.tie_is_open(p_tie_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(r.locks_at > now(), false) and t.status = 'live'
  from public.tournament_ties ti
  join public.tournament_rounds r on r.id = ti.round_id
  join public.tournaments t on t.id = r.tournament_id
  where ti.id = p_tie_id;
$$;

alter table public.tournaments enable row level security;
alter table public.tournament_rounds enable row level security;
alter table public.tournament_ties enable row level security;
alter table public.tournament_picks enable row level security;

create policy "Anyone can read tournaments" on public.tournaments for select using (true);
create policy "Anyone can read tournament rounds" on public.tournament_rounds for select using (true);
create policy "Anyone can read tournament ties" on public.tournament_ties for select using (true);

create policy "Admins manage tournaments" on public.tournaments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage tournament rounds" on public.tournament_rounds for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage tournament ties" on public.tournament_ties for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Your own picks always; everyone's once the round has locked.
create policy "Read own tournament picks, or all after lock" on public.tournament_picks
  for select to authenticated
  using (player_id = auth.uid() or not public.tie_is_open(tie_id));

create policy "Make own tournament pick while open" on public.tournament_picks
  for insert to authenticated
  with check (player_id = auth.uid() and public.tie_is_open(tie_id));

create policy "Change own tournament pick while open" on public.tournament_picks
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid() and public.tie_is_open(tie_id));

create trigger tournament_picks_touch_updated_at
  before update on public.tournament_picks
  for each row execute function public.touch_updated_at();
