-- ============================================================
-- FANTASY GOLF — SUPABASE SCHEMA (source of truth)
-- Last updated: 2026-06-18
--
-- Architecture:
--   profiles                 — user identity + team name + phone number
--   pga_tournaments          — real PGA Tour events (Masters, US Open, etc.)
--   pga_tournament_players   — field membership per PGA event + cut status
--   pga_hole_pars            — hole pars per PGA event
--   pga_player_tee_times     — tee times per player per round per PGA event
--   tournaments              — fantasy leagues, each linked to a PGA event
--   tournament_memberships   — user joins a fantasy tournament
--   tournament_players       — per-fantasy-tournament player world rankings
--   players                  — global player master list (sourced from OWGR)
--   rosters                  — active draft picks per user per fantasy tournament
--   roster_round_players     — immutable per-round roster snapshots
--   scores                   — hole-by-hole scores, tied to pga_tournament_id
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- One row per auth user. team_name is set once and locked.
-- phone_number is optional but required for money match tournaments.
-- ============================================================
create table public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  username     text unique not null,
  is_admin     boolean default false,
  team_name    text,                  -- set once via TeamNamePrompt, locked permanently
  phone_number text,                  -- required for money match tournaments (Swish)
  created_at   timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- PGA TOURNAMENTS (real golf events)
-- sync_url + date window drive score syncing — no manual toggle.
-- espn_event_id links to ESPN's event ID for field/tee time fetching.
-- cut_checked: set true once cut detection has run for this event.
-- ============================================================
create table public.pga_tournaments (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  course           text,
  year             integer,
  espn_event_id    text,              -- ESPN event ID (used by sync-field.js + tee times)
  sync_url         text,              -- ESPN scoreboard URL; null = not synced
  sync_format      text default 'espn',
  sync_start_date  date,
  sync_end_date    date,
  cut_checked      boolean not null default false,
  created_at       timestamptz default now()
);

-- ============================================================
-- PGA TOURNAMENT PLAYERS (field membership per PGA event)
-- made_cut: null = not determined, true = made cut, false = missed cut
-- is_withdrawn: set true when ESPN returns WD status; also sets made_cut = false
-- ============================================================
create table public.pga_tournament_players (
  id                 uuid primary key default uuid_generate_v4(),
  pga_tournament_id  uuid references public.pga_tournaments(id) on delete cascade,
  player_id          uuid references public.players(id) on delete cascade,
  is_in_field        boolean default true,
  made_cut           boolean,
  is_withdrawn       boolean not null default false,
  unique(pga_tournament_id, player_id)
);

-- ============================================================
-- PGA HOLE PARS (per PGA event)
-- ============================================================
create table public.pga_hole_pars (
  pga_tournament_id  uuid references public.pga_tournaments(id) on delete cascade,
  hole               integer check (hole between 1 and 18),
  par                integer,
  yards              integer,
  name               text,
  primary key (pga_tournament_id, hole)
);

-- ============================================================
-- PGA PLAYER TEE TIMES (per player, per round, per PGA event)
-- Populated by sync-scores.js from the ESPN competitor status endpoint.
-- One row per (pga_tournament_id, player_id, round) — all 4 rounds accumulate.
-- ============================================================
create table public.pga_player_tee_times (
  id                 uuid primary key default gen_random_uuid(),
  pga_tournament_id  uuid not null references public.pga_tournaments(id) on delete cascade,
  player_id          uuid not null references public.players(id) on delete cascade,
  round              integer not null,
  tee_time_utc       timestamptz not null,
  unique(pga_tournament_id, player_id, round)
);

-- ============================================================
-- PLAYERS (global master list — identity sourced from OWGR)
-- owgr_id: OWGR system ID used by sync-owgr-rankings.js
-- masters_id: masters.com player ID (legacy, used by masters parser)
-- ============================================================
create table public.players (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  country        text,
  world_ranking  integer,
  owgr_id        text,
  masters_id     text,
  is_active      boolean default true,
  created_at     timestamptz default now()
);

-- ============================================================
-- FANTASY TOURNAMENTS (friend group leagues, linked to a PGA event)
-- join_code: optional — if set, users must enter it to join
-- is_money_match: requires phone_number on profile to join
-- ============================================================
create table public.tournaments (
  id                 uuid primary key default uuid_generate_v4(),
  name               text not null,
  pga_tournament_id  uuid references public.pga_tournaments(id),
  is_locked          boolean default false,   -- true once R1 scores arrive
  draft_open         boolean default true,    -- auto-closed when is_locked = true
  join_code          text,
  is_money_match     boolean not null default false,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- ============================================================
-- TOURNAMENT MEMBERSHIPS (user joins a fantasy tournament)
-- team_name: copied from profile.team_name at join time
-- is_dq: set true if user can't field 4 valid starters after auto-sub
-- ============================================================
create table public.tournament_memberships (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid references public.tournaments(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete cascade,
  team_name      text not null,
  is_dq          boolean not null default false,
  created_at     timestamptz default now(),
  unique(tournament_id, user_id)
);

-- ============================================================
-- TOURNAMENT PLAYERS (per-fantasy-tournament player world rankings)
-- Lightweight pricing reference — world_ranking copied at draft time.
-- ============================================================
create table public.tournament_players (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid references public.tournaments(id) on delete cascade,
  player_id      uuid references public.players(id) on delete cascade,
  world_ranking  integer,
  unique(tournament_id, player_id)
);

-- ============================================================
-- ROSTERS (active draft picks per user per fantasy tournament)
-- slot_type: 'starter' (counts for scoring) or 'sub' (bench)
-- slot_number: 1–5 starters, 1–4 subs
-- is_active: false = removed from roster
-- ============================================================
create table public.rosters (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid references public.tournaments(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete cascade,
  player_id      uuid references public.players(id) on delete cascade,
  slot_type      text check (slot_type in ('starter', 'sub')),
  slot_number    integer,
  is_active      boolean default true,
  created_at     timestamptz default now(),
  unique(tournament_id, user_id, player_id)
);

-- ============================================================
-- ROSTER ROUND PLAYERS (immutable per-round roster snapshots)
-- Written once per round when scores first arrive for that round.
-- Used for historical scoring — reflects who was in each slot per round.
-- ============================================================
create table public.roster_round_players (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid references public.tournaments(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete cascade,
  player_id      uuid references public.players(id) on delete cascade,
  round          integer,
  slot_type      text check (slot_type in ('starter', 'sub')),
  created_at     timestamptz default now(),
  unique(tournament_id, user_id, player_id, round)
);

-- ============================================================
-- SCORES (hole-by-hole, tied to PGA event — shared across fantasy leagues)
-- vs_par is a generated column (strokes - par).
-- ============================================================
create table public.scores (
  id                 uuid primary key default uuid_generate_v4(),
  pga_tournament_id  uuid references public.pga_tournaments(id) on delete cascade,
  player_id          uuid references public.players(id) on delete cascade,
  round              integer check (round between 1 and 4),
  hole               integer check (hole between 1 and 18),
  strokes            integer,
  par                integer,
  vs_par             integer generated always as (strokes - par) stored,
  updated_at         timestamptz default now(),
  unique(pga_tournament_id, player_id, round, hole)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Service key (sync scripts) bypasses RLS entirely.
-- Authenticated users can read everything.
-- Writes are restricted to admins or own rows.
-- ============================================================

alter table public.profiles              enable row level security;
alter table public.pga_tournaments       enable row level security;
alter table public.pga_tournament_players enable row level security;
alter table public.pga_hole_pars         enable row level security;
alter table public.pga_player_tee_times  enable row level security;
alter table public.players               enable row level security;
alter table public.tournaments           enable row level security;
alter table public.tournament_memberships enable row level security;
alter table public.tournament_players    enable row level security;
alter table public.rosters               enable row level security;
alter table public.roster_round_players  enable row level security;
alter table public.scores                enable row level security;

-- Profiles: everyone reads, own row update only
create policy "profiles_select"      on public.profiles for select using (true);
create policy "profiles_update_own"  on public.profiles for update using (auth.uid() = id);

-- PGA Tournaments: everyone reads, admin writes
create policy "pga_tournaments_select"       on public.pga_tournaments for select using (true);
create policy "pga_tournaments_admin_write"  on public.pga_tournaments for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- PGA Tournament Players: everyone reads, admin writes
create policy "pga_tournament_players_select"       on public.pga_tournament_players for select using (true);
create policy "pga_tournament_players_admin_write"  on public.pga_tournament_players for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- PGA Hole Pars: everyone reads, admin writes
create policy "pga_hole_pars_select"       on public.pga_hole_pars for select using (true);
create policy "pga_hole_pars_admin_write"  on public.pga_hole_pars for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- PGA Player Tee Times: everyone reads, admin writes
create policy "pga_player_tee_times_select"       on public.pga_player_tee_times for select using (true);
create policy "pga_player_tee_times_admin_write"  on public.pga_player_tee_times for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Players: everyone reads, admin writes
create policy "players_select"       on public.players for select using (true);
create policy "players_admin_write"  on public.players for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Fantasy Tournaments: everyone reads, admin writes
create policy "tournaments_select"       on public.tournaments for select using (true);
create policy "tournaments_admin_write"  on public.tournaments for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Memberships: everyone reads, users insert/delete own rows
create policy "memberships_select"       on public.tournament_memberships for select using (true);
create policy "memberships_insert_own"   on public.tournament_memberships for insert
  with check (auth.uid() = user_id);
create policy "memberships_delete_own"   on public.tournament_memberships for delete
  using (auth.uid() = user_id);

-- Tournament Players: everyone reads, admin writes
create policy "tournament_players_select"       on public.tournament_players for select using (true);
create policy "tournament_players_admin_write"  on public.tournament_players for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Rosters: everyone reads, users manage own picks (only while draft is open)
create policy "rosters_select"      on public.rosters for select using (true);
create policy "rosters_insert_own"  on public.rosters for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.tournaments
      where id = tournament_id and draft_open = true and is_locked = false
    )
  );
create policy "rosters_update_own"  on public.rosters for update using (auth.uid() = user_id);
create policy "rosters_delete_own"  on public.rosters for delete
  using (
    auth.uid() = user_id and
    exists (select 1 from public.tournaments where id = tournament_id and is_locked = false)
  );

-- Roster Round Players: everyone reads, admin writes (sync script uses service key)
create policy "roster_round_players_select"       on public.roster_round_players for select using (true);
create policy "roster_round_players_admin_write"  on public.roster_round_players for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Scores: everyone reads, admin writes (sync script uses service key)
create policy "scores_select"       on public.scores for select using (true);
create policy "scores_admin_write"  on public.scores for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
