-- Other players' Cup picks become visible only once that matchup has actually
-- locked (1 hour before kickoff). Before, they showed whenever a matchup
-- wasn't open, e.g. while an admin had the tournament hidden in setup.

create or replace function public.tie_is_locked(p_tie_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.tie_lock_at(p_tie_id) <= now(), false);
$$;

drop policy "Read own tournament picks, or all after lock" on public.tournament_picks;

create policy "Read own tournament picks, or all after lock" on public.tournament_picks
  for select to authenticated
  using (player_id = auth.uid() or public.tie_is_locked(tie_id));
