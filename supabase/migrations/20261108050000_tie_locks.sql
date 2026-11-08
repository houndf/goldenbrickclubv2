-- Picks now lock per matchup: 1 hour before that matchup's first kickoff.
-- Matchups without a kickoff fall back to their round's lock time (also − 1 hour).

alter table public.tournament_ties add column first_kickoff timestamptz;

create or replace function public.tie_lock_at(p_tie_id bigint)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(ti.first_kickoff, r.locks_at) - interval '1 hour'
  from public.tournament_ties ti
  join public.tournament_rounds r on r.id = ti.round_id
  where ti.id = p_tie_id;
$$;

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
