-- NINES: accounts, progress, and the small tables the server needs.
--
-- Run this once in the Supabase SQL editor (or `supabase db push`). It is idempotent where it can be.
--
-- Security model
--   * Browsers talk to Supabase only for sign-in (Auth). They get READ access to their own rows and nothing else.
--   * Every write goes through the Next.js server (src/app/api/*) with the service-role key, which validates it
--     first (src/content/progress-model.ts) and rate-limits it (rate_limit_hit below). There are deliberately no
--     insert/update/delete policies for `anon` or `authenticated`, so a modified browser cannot write progress.
--   * The service-role key bypasses RLS by design; it lives only in server environment variables.

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  display_name   text,
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- progress (one row per level a player has touched)
-- section = chapter id ("a1"), level = mission, boss or incident id ("latency-numbers").

create table if not exists public.progress (
  user_id      uuid not null references auth.users (id) on delete cascade,
  section      text not null check (char_length(section) between 1 and 40),
  level        text not null check (char_length(level) between 1 and 80),
  status       text not null check (status in ('in_progress', 'completed')),
  score        integer check (score between 0 and 100),
  attempts     integer not null default 0 check (attempts between 0 and 1000),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, section, level),
  check ((status = 'completed') = (completed_at is not null))
);
create index if not exists progress_completed_idx on public.progress (section, level) where status = 'completed';

-- ---------------------------------------------------------------- saves (the full game save, so a player's reviews follow them across devices)

create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  blob       jsonb not null,
  saved_at   bigint not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- server-only tables (no policies: the service role only)

create table if not exists public.ai_usage (
  subject text not null,
  day     text not null,
  route   text not null,
  calls   integer not null default 0,
  usd     double precision not null default 0,
  primary key (subject, day, route)
);

create table if not exists public.feedback (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  subject text not null,
  email   text,
  page    text not null default '',
  message text not null check (char_length(message) between 3 and 2000)
);

create table if not exists public.counters (
  key text primary key,
  n   integer not null default 0
);

create table if not exists public.rate_limits (
  bucket       text primary key,
  window_start timestamptz not null,
  hits         integer not null
);

-- ---------------------------------------------------------------- row level security

alter table public.profiles    enable row level security;
alter table public.progress    enable row level security;
alter table public.saves       enable row level security;
alter table public.ai_usage    enable row level security;
alter table public.feedback    enable row level security;
alter table public.counters    enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using (id = (select auth.uid()));

drop policy if exists "progress: read own" on public.progress;
create policy "progress: read own" on public.progress for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "saves: read own" on public.saves;
create policy "saves: read own" on public.saves for select to authenticated using (user_id = (select auth.uid()));

-- Belt and braces: take away table privileges the policies would not grant anyway.
revoke all on public.profiles, public.progress, public.saves, public.ai_usage, public.feedback, public.counters, public.rate_limits from anon, authenticated;
grant select on public.profiles, public.progress, public.saves to authenticated;

-- ---------------------------------------------------------------- a profile for every new account

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- server functions (callable by the service role only)

-- A fixed-window rate limit. Returns true while the caller is within `p_max` hits per `p_window_seconds`.
create or replace function public.rate_limit_hit(p_bucket text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    hits         = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

create or replace function public.ai_usage_add(p_subject text, p_day text, p_route text, p_usd double precision)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_usage as u (subject, day, route, calls, usd)
  values (p_subject, p_day, p_route, 1, p_usd)
  on conflict (subject, day, route) do update set calls = u.calls + 1, usd = u.usd + excluded.usd;
$$;

create or replace function public.ai_spend(p_prefix text)
returns table (route text, calls bigint, usd double precision)
language sql
security definer
set search_path = ''
as $$
  select route, sum(calls)::bigint, sum(usd)::double precision
  from public.ai_usage
  where day like p_prefix || '%'
  group by route;
$$;

create or replace function public.counter_bump(p_key text)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.counters as c (key, n) values (p_key, 1)
  on conflict (key) do update set n = c.n + 1
  returning n;
$$;

-- Per-user summary for the admin page.
create or replace function public.admin_users(p_limit integer)
returns table (id uuid, email text, display_name text, created_at timestamptz, last_active_at timestamptz, completed_levels bigint, started_levels bigint)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.email, p.display_name, p.created_at, p.last_active_at,
         count(g.level) filter (where g.status = 'completed'),
         count(g.level)
  from public.profiles p
  left join public.progress g on g.user_id = p.id
  group by p.id
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 1000);
$$;

-- Completed levels per user and section, for the funnel.
create or replace function public.progress_by_user_section()
returns table (user_id uuid, section text, completed text[])
language sql
security definer
set search_path = ''
as $$
  select user_id, section, array_agg(level order by level)
  from public.progress
  where status = 'completed'
  group by user_id, section;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer), public.ai_usage_add(text, text, text, double precision), public.ai_spend(text),
  public.counter_bump(text), public.admin_users(integer), public.progress_by_user_section() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer), public.ai_usage_add(text, text, text, double precision), public.ai_spend(text),
  public.counter_bump(text), public.admin_users(integer), public.progress_by_user_section() to service_role;
