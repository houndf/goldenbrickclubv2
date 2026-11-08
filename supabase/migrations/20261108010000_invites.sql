-- Invite-only accounts with username + password (no email).
--
-- Each invite code works once. A code can carry a link to a 2026 player
-- (so signing up reconnects their history) and starting roles.
-- Accounts are created by the server with the secret key; nothing here
-- is writable by players directly.

-- Usernames: 2–24 characters; letters, numbers, spaces, _ . - ; must start
-- and end with a letter or number. Case-insensitive unique (citext).
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[A-Za-z0-9][A-Za-z0-9 _.\-]{0,22}[A-Za-z0-9]$');

-- 2026 players keep their old Extra Gold status so invites can restore it.
alter table public.legacy_players
  add column extra_gold boolean not null default false,
  add column was_admin boolean not null default false;

-- Readable, unambiguous codes like "K7QX-M2PA".
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    if i = 3 then
      code := code || '-';
    end if;
  end loop;
  return code;
end;
$$;

create table public.invite_codes (
  code text primary key default public.generate_invite_code()
    check (code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  note text,                                    -- who it's for, e.g. "Jake"
  legacy_player_id bigint unique references public.legacy_players (id) on delete set null,
  grants_admin boolean not null default false,
  grants_extra_gold boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  used_by uuid unique references public.profiles (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  -- used_by can be cleared if an account is deleted; the code stays used.
  check (used_by is null or used_at is not null)
);

alter table public.invite_codes enable row level security;

create policy "Admins read invites" on public.invite_codes
  for select to authenticated using (public.is_admin());
create policy "Admins create invites" on public.invite_codes
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy "Admins revoke invites" on public.invite_codes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Invite lookup for the join screen: says whether a code is usable and, if
-- it's tied to a 2026 player, their old name (to suggest as a username).
create or replace function public.check_invite(p_code text)
returns table (valid boolean, legacy_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select true, lp.name
    from public.invite_codes ic
    left join public.legacy_players lp on lp.id = ic.legacy_player_id
    where ic.code = upper(trim(p_code))
      and ic.used_at is null
      and ic.revoked_at is null;
  if not found then
    return query select false, null::text;
  end if;
end;
$$;

grant execute on function public.check_invite(text) to anon, authenticated;

-- Called by the server right after it creates the auth user. Locks the
-- invite so a code can't be used twice, creates the profile with the
-- invite's roles, and links the 2026 history.
create or replace function public.claim_invite(
  p_code text,
  p_user_id uuid,
  p_username text,
  p_initials text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invite_codes;
begin
  select * into inv
  from public.invite_codes
  where code = upper(trim(p_code))
  for update;

  if not found or inv.used_at is not null or inv.revoked_at is not null then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, username, initials, role, extra_gold)
  values (
    p_user_id,
    trim(p_username),
    p_initials,
    case when inv.grants_admin then 'admin'::public.player_role else 'player'::public.player_role end,
    inv.grants_extra_gold
  );

  update public.invite_codes
  set used_by = p_user_id, used_at = now()
  where code = inv.code;

  if inv.legacy_player_id is not null then
    update public.legacy_players
    set profile_id = p_user_id
    where id = inv.legacy_player_id and profile_id is null;
  end if;
end;
$$;

-- Only the server (secret key) may claim invites.
revoke execute on function public.claim_invite(text, uuid, text, text) from public, anon, authenticated;
