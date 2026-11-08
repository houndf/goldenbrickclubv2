-- Automatic results: the app imports data/feed.json (kept up to date by a
-- scheduled task) into these tables.

-- Which feed version has been imported.
alter table public.league_settings add column feed_version integer not null default 0;

-- Tournaments and matchups created from the feed carry a stable key.
alter table public.tournaments add column external_key text unique;
alter table public.tournament_ties add column external_key text;
create unique index tournament_ties_round_key on public.tournament_ties (round_id, external_key)
  where external_key is not null;

-- MLS standings (used for match breakdowns).
create table public.team_standings (
  season_id smallint not null,
  team_id bigint not null references public.teams (id) on delete cascade,
  conference public.conference not null,
  rank smallint not null,
  played smallint not null,
  wins smallint not null,
  draws smallint not null,
  losses smallint not null,
  goals_for smallint not null,
  goals_against smallint not null,
  points smallint not null,
  form text not null default '',
  as_of timestamptz,
  primary key (season_id, team_id)
);

alter table public.team_standings enable row level security;
create policy "Anyone can read standings" on public.team_standings for select using (true);
create policy "Admins manage standings" on public.team_standings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
