-- Admin switch: "Unlock all picks".
-- While on, every pick that doesn't have a result yet can be made or changed,
-- whatever its lock time (season matches and Cup matchups alike). Things that
-- already have a result stay locked, so nobody can pick after the fact.
-- Turned off, the normal lock rules apply again.
-- While picks are unlocked, other players' picks on those games stay hidden
-- (otherwise people could copy each other).

alter table public.league_settings add column picks_unlocked boolean not null default false;

create or replace function public.picks_unlocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.picks_unlocked from public.league_settings s where s.id), false);
$$;

-- Season matches: open = before lock, or unlocked by an admin and not final.
create or replace function public.match_is_open(p_match_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    now() < m.locks_at or (public.picks_unlocked() and m.status <> 'final'),
    false
  )
  from public.matches m
  where m.id = p_match_id;
$$;

drop policy "Read own picks, or anyone's after lock" on public.picks;
drop policy "Make own pick before lock" on public.picks;
drop policy "Change own pick before lock" on public.picks;

create policy "Read own picks, or anyone's after lock" on public.picks
  for select to authenticated
  using (player_id = auth.uid() or not coalesce(public.match_is_open(match_id), true));

create policy "Make own pick before lock" on public.picks
  for insert to authenticated
  with check (player_id = auth.uid() and coalesce(public.match_is_open(match_id), false));

create policy "Change own pick before lock" on public.picks
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid() and coalesce(public.match_is_open(match_id), false));

-- Cup matchups: same idea.
create or replace function public.tie_is_open(p_tie_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
      public.tie_lock_at(ti.id) > now() or (public.picks_unlocked() and ti.winner is null),
      false
    ) and t.status = 'live'
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
  select coalesce(public.tie_lock_at(ti.id) <= now(), false)
    and not (public.picks_unlocked() and ti.winner is null)
  from public.tournament_ties ti
  where ti.id = p_tie_id;
$$;
