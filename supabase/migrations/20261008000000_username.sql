-- Usernames. A short handle chosen by the player after sign-up ("@pigeon_dev"), unique, lowercase.
-- Browsers can read their own profile (including the username) but, as with every table, cannot write it:
-- changes go through the server (src/app/api/profile), which validates the name first.

alter table public.profiles add column if not exists username text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles
      add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$');
  end if;
end;
$$;

-- Unique among players who have chosen one (many profiles can still have no username yet).
create unique index if not exists profiles_username_key on public.profiles (username) where username is not null;

-- The admin list now includes the username (the return type changed, so drop and recreate).
drop function if exists public.admin_users(integer);
create or replace function public.admin_users(p_limit integer)
returns table (id uuid, email text, display_name text, username text, created_at timestamptz, last_active_at timestamptz, completed_levels bigint, started_levels bigint)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.email, p.display_name, p.username, p.created_at, p.last_active_at,
         count(g.level) filter (where g.status = 'completed'),
         count(g.level)
  from public.profiles p
  left join public.progress g on g.user_id = p.id
  group by p.id
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 1000);
$$;

revoke execute on function public.admin_users(integer) from public, anon, authenticated;
grant execute on function public.admin_users(integer) to service_role;
