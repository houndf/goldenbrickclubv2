-- League-wide switches the commissioner controls from the admin portal.

create table public.league_settings (
  id boolean primary key default true check (id),   -- exactly one row
  results_hidden boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.league_settings (id) values (true);

alter table public.league_settings enable row level security;

create policy "Anyone can read league settings" on public.league_settings
  for select using (true);

create policy "Admins change league settings" on public.league_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
