-- Admin unlocks for picks.
--
-- League-wide: "Unlock all picks" (league_settings.picks_unlocked).
-- Per player:  a row in player_pick_unlocks.
-- Each has its own "retroactive" option:
--   unlocked, not retroactive -> picks without a result can be made or changed
--                                past their lock time;
--   unlocked and retroactive  -> games that already have a result can be
--                                changed too.
-- With nothing unlocked, the normal lock rules apply.
-- While a pick can still be changed by its owner, or the viewer can still
-- change their own pick on that game, other players' picks on it stay hidden
-- (so nobody can copy).
--
-- Safe to run more than once.

alter table public.league_settings add column if not exists picks_unlocked boolean not null default false;
alter table public.league_settings add column if not exists unlock_retroactive boolean not null default false;

create table if not exists public.player_pick_unlocks (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  retroactive boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.player_pick_unlocks enable row level security;

drop policy if exists "Players see their own unlock" on public.player_pick_unlocks;
create policy "Players see their own unlock" on public.player_pick_unlocks
  for select to authenticated
  using (player_id = auth.uid() or public.is_admin());

drop policy if exists "Admins manage unlocks" on public.player_pick_unlocks;
create policy "Admins manage unlocks" on public.player_pick_unlocks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Does an unlock let this player change a pick? p_decided = the game has a result.
create or replace function public.unlock_allows(p_player uuid, p_decided boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.picks_unlocked and (not p_decided or s.unlock_retroactive)
       from public.league_settings s where s.id),
    false
  )
  or exists (
    select 1 from public.player_pick_unlocks u
    where u.player_id = p_player and (not p_decided or u.retroactive)
  );
$$;

-- Season matches.
create or replace function public.match_open_for(p_match_id text, p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    now() < m.locks_at or public.unlock_allows(p_player, m.status = 'final'),
    false
  )
  from public.matches m
  where m.id = p_match_id;
$$;

drop policy if exists "Read own picks, or anyone's after lock" on public.picks;
drop policy if exists "Make own pick before lock" on public.picks;
drop policy if exists "Change own pick before lock" on public.picks;

create policy "Read own picks, or anyone's after lock" on public.picks
  for select to authenticated
  using (
    player_id = auth.uid()
    or (
      not coalesce(public.match_open_for(match_id, auth.uid()), true)
      and not coalesce(public.match_open_for(match_id, player_id), true)
    )
  );

create policy "Make own pick before lock" on public.picks
  for insert to authenticated
  with check (player_id = auth.uid() and coalesce(public.match_open_for(match_id, auth.uid()), false));

create policy "Change own pick before lock" on public.picks
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid() and coalesce(public.match_open_for(match_id, auth.uid()), false));

drop function if exists public.match_is_open(text);
drop function if exists public.picks_unlocked();

-- Cup matchups.
create or replace function public.tie_open_for(p_tie_id bigint, p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
      public.tie_lock_at(ti.id) > now() or public.unlock_allows(p_player, ti.winner is not null),
      false
    ) and t.status = 'live'
  from public.tournament_ties ti
  join public.tournament_rounds r on r.id = ti.round_id
  join public.tournaments t on t.id = r.tournament_id
  where ti.id = p_tie_id;
$$;

-- With no unlocks this is the plain lock rule (kept for anything that still calls it).
create or replace function public.tie_is_open(p_tie_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.tie_lock_at(ti.id) > now(), false) and t.status = 'live'
  from public.tournament_ties ti
  join public.tournament_rounds r on r.id = ti.round_id
  join public.tournaments t on t.id = r.tournament_id
  where ti.id = p_tie_id;
$$;

create or replace function public.tie_is_locked(p_tie_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.tie_lock_at(p_tie_id) <= now(), false);
$$;

drop policy if exists "Read own tournament picks, or all after lock" on public.tournament_picks;
drop policy if exists "Make own tournament pick while open" on public.tournament_picks;
drop policy if exists "Change own tournament pick while open" on public.tournament_picks;

create policy "Read own tournament picks, or all after lock" on public.tournament_picks
  for select to authenticated
  using (
    player_id = auth.uid()
    or (
      public.tie_is_locked(tie_id)
      and not coalesce(public.tie_open_for(tie_id, auth.uid()), false)
      and not coalesce(public.tie_open_for(tie_id, player_id), false)
    )
  );

create policy "Make own tournament pick while open" on public.tournament_picks
  for insert to authenticated
  with check (player_id = auth.uid() and coalesce(public.tie_open_for(tie_id, auth.uid()), false));

create policy "Change own tournament pick while open" on public.tournament_picks
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid() and coalesce(public.tie_open_for(tie_id, auth.uid()), false));
