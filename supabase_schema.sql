-- ============================================================
-- FANTASY GOLF - PGA / FANTASY TOURNAMENT ARCHITECTURE
-- ============================================================
-- Architecture:
--   pga_tournaments      — real golf events (Masters, PGA Championship, etc.)
--   pga_tournament_players — which players are in each PGA field
--   pga_hole_pars        — hole pars per PGA event
--   tournaments          — fantasy leagues (linked to a PGA event)
--   tournament_players   — per-fantasy-tournament player pricing
--   scores               — tied to pga_tournament_id (shared across fantasy leagues)
--
-- MIGRATION NOTES (run in Supabase SQL Editor in 3 steps):
-- See the MIGRATION section at the bottom of this file.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (user identity only — no team name here)
-- ============================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  is_admin boolean default false,
  created_at timestamptz default now()
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
-- ============================================================
create table public.pga_tournaments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  course text,
  year integer,
  sync_url text,
  sync_format text default 'masters',
  sync_start_date date,
  sync_end_date date,
  sync_enabled boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- PGA TOURNAMENT PLAYERS (field membership per PGA event)
-- ============================================================
create table public.pga_tournament_players (
  id uuid primary key default uuid_generate_v4(),
  pga_tournament_id uuid references public.pga_tournaments(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  is_in_field boolean default true,
  unique(pga_tournament_id, player_id)
);

-- ============================================================
-- PGA HOLE PARS (per PGA event)
-- ============================================================
create table public.pga_hole_pars (
  pga_tournament_id uuid references public.pga_tournaments(id) on delete cascade,
  hole integer check (hole between 1 and 18),
  par integer,
  yards integer,
  name text,
  primary key (pga_tournament_id, hole)
);

-- ============================================================
-- FANTASY TOURNAMENTS (friend group leagues, linked to a PGA event)
-- ============================================================
create table public.tournaments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  pga_tournament_id uuid references public.pga_tournaments(id),
  budget numeric(10,2) default 100.00,
  is_locked boolean default false,
  draft_open boolean default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- TOURNAMENT MEMBERSHIPS (user joins a fantasy tournament with a team name)
-- ============================================================
create table public.tournament_memberships (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  team_name text not null,
  created_at timestamptz default now(),
  unique(tournament_id, user_id)
);

-- ============================================================
-- PLAYERS (global master list — identity sourced from OWGR)
-- ============================================================
create table public.players (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  country text,
  world_ranking integer,
  owgr_id text,
  form_score numeric(4,2),
  is_active boolean default true,
  is_withdrawn boolean default false,
  made_cut boolean default true,
  photo_url text,
  price numeric(5,2),
  price_override numeric(5,2),
  odds_fractional text,
  odds_decimal numeric(10,2),
  created_at timestamptz default now()
);

-- ============================================================
-- TOURNAMENT PLAYERS (per-fantasy-tournament pricing only)
-- Field membership is in pga_tournament_players
-- ============================================================
create table public.tournament_players (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  price numeric(5,2),
  odds_fractional text,
  world_ranking integer,
  unique(tournament_id, player_id)
);

-- ============================================================
-- ROSTERS (per user, per fantasy tournament)
-- ============================================================
create table public.rosters (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  slot_type text check (slot_type in ('starter', 'sub')),
  slot_number integer,
  is_active boolean default true,
  round_added integer default 1,
  created_at timestamptz default now(),
  unique(tournament_id, user_id, player_id)
);

-- ============================================================
-- SCORES (per player, per PGA event — shared across fantasy leagues)
-- ============================================================
create table public.scores (
  id uuid primary key default uuid_generate_v4(),
  pga_tournament_id uuid references public.pga_tournaments(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  round integer check (round between 1 and 4),
  hole integer check (hole between 1 and 18),
  strokes integer,
  par integer,
  vs_par integer generated always as (strokes - par) stored,
  updated_at timestamptz default now(),
  unique(pga_tournament_id, player_id, round, hole)
);

-- ============================================================
-- HOLE PARS (Augusta National — legacy global reference, kept for migration)
-- ============================================================
create table public.hole_pars (
  hole integer primary key,
  par integer,
  yards_championship integer,
  name text
);

insert into public.hole_pars (hole, par, yards_championship, name) values
  (1,  4, 445, 'Tea Olive'),
  (2,  5, 575, 'Pink Dogwood'),
  (3,  4, 350, 'Flowering Peach'),
  (4,  3, 240, 'Flowering Crab Apple'),
  (5,  4, 495, 'Magnolia'),
  (6,  3, 180, 'Juniper'),
  (7,  4, 450, 'Pampas'),
  (8,  5, 570, 'Yellow Jasmine'),
  (9,  4, 460, 'Carolina Cherry'),
  (10, 4, 495, 'Camellia'),
  (11, 4, 520, 'White Dogwood'),
  (12, 3, 155, 'Golden Bell'),
  (13, 5, 510, 'Azalea'),
  (14, 4, 440, 'Chinese Fir'),
  (15, 5, 550, 'Firethorn'),
  (16, 3, 170, 'Redbud'),
  (17, 4, 440, 'Nandina'),
  (18, 4, 465, 'Holly');

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.pga_tournaments enable row level security;
alter table public.pga_tournament_players enable row level security;
alter table public.pga_hole_pars enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_memberships enable row level security;
alter table public.players enable row level security;
alter table public.tournament_players enable row level security;
alter table public.rosters enable row level security;
alter table public.scores enable row level security;
alter table public.hole_pars enable row level security;

-- Profiles: everyone reads, own row update
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- PGA Tournaments: everyone reads, admin writes
create policy "pga_tournaments_select" on public.pga_tournaments for select using (true);
create policy "pga_tournaments_admin_write" on public.pga_tournaments for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- PGA Tournament Players: everyone reads, admin writes
create policy "pga_tournament_players_select" on public.pga_tournament_players for select using (true);
create policy "pga_tournament_players_admin_write" on public.pga_tournament_players for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- PGA Hole Pars: everyone reads, admin writes
create policy "pga_hole_pars_select" on public.pga_hole_pars for select using (true);
create policy "pga_hole_pars_admin_write" on public.pga_hole_pars for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Fantasy Tournaments: everyone reads, admin writes
create policy "tournaments_select" on public.tournaments for select using (true);
create policy "tournaments_admin_write" on public.tournaments for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Memberships: everyone reads, users manage their own
create policy "memberships_select" on public.tournament_memberships for select using (true);
create policy "memberships_insert_own" on public.tournament_memberships for insert
  with check (auth.uid() = user_id);
create policy "memberships_delete_own" on public.tournament_memberships for delete
  using (auth.uid() = user_id);

-- Tournament players: everyone reads, admin writes
create policy "tournament_players_select" on public.tournament_players for select using (true);
create policy "tournament_players_admin_write" on public.tournament_players for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Players: everyone reads, admin writes
create policy "players_select" on public.players for select using (true);
create policy "players_admin_write" on public.players for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Rosters: read all, write own (if tournament draft open and not locked)
create policy "rosters_select" on public.rosters for select using (true);
create policy "rosters_insert_own" on public.rosters for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.tournaments
      where id = tournament_id and draft_open = true and is_locked = false
    )
  );
create policy "rosters_update_own" on public.rosters for update
  using (auth.uid() = user_id);
create policy "rosters_delete_own" on public.rosters for delete
  using (
    auth.uid() = user_id and
    exists (
      select 1 from public.tournaments
      where id = tournament_id and is_locked = false
    )
  );

-- Scores: everyone reads, admin writes (service key bypasses RLS for sync)
create policy "scores_select" on public.scores for select using (true);
create policy "scores_admin_write" on public.scores for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Hole pars: everyone reads
create policy "hole_pars_select" on public.hole_pars for select using (true);

-- ============================================================
-- MIGRATION — run these in Supabase SQL Editor in 3 steps
-- (Only needed for existing deployments; fresh installs use schema above)
-- ============================================================

-- ── STEP 1: Create new tables ─────────────────────────────────────────────────
/*
create table public.pga_tournaments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  course text,
  year integer,
  sync_url text,
  sync_format text default 'masters',
  sync_start_date date,
  sync_end_date date,
  sync_enabled boolean default false,
  created_at timestamptz default now()
);
alter table public.pga_tournaments enable row level security;
create policy "pga_tournaments_select" on public.pga_tournaments for select using (true);
create policy "pga_tournaments_admin_write" on public.pga_tournaments for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create table public.pga_tournament_players (
  id uuid primary key default uuid_generate_v4(),
  pga_tournament_id uuid references public.pga_tournaments(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  is_in_field boolean default true,
  unique(pga_tournament_id, player_id)
);
alter table public.pga_tournament_players enable row level security;
create policy "pga_tournament_players_select" on public.pga_tournament_players for select using (true);
create policy "pga_tournament_players_admin_write" on public.pga_tournament_players for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create table public.pga_hole_pars (
  pga_tournament_id uuid references public.pga_tournaments(id) on delete cascade,
  hole integer check (hole between 1 and 18),
  par integer,
  yards integer,
  name text,
  primary key (pga_tournament_id, hole)
);
alter table public.pga_hole_pars enable row level security;
create policy "pga_hole_pars_select" on public.pga_hole_pars for select using (true);
create policy "pga_hole_pars_admin_write" on public.pga_hole_pars for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
*/

-- ── STEP 2: Modify existing tables ───────────────────────────────────────────
/*
-- Add pga_tournament_id to fantasy tournaments
alter table public.tournaments
  add column if not exists pga_tournament_id uuid references public.pga_tournaments(id);

-- Add pga_tournament_id to scores (keep old tournament_id during migration)
alter table public.scores
  add column if not exists pga_tournament_id uuid references public.pga_tournaments(id) on delete cascade;

-- Drop is_in_field from tournament_players (field membership is now in pga_tournament_players)
alter table public.tournament_players drop column if exists is_in_field;
*/

-- ── STEP 3: Data migration ────────────────────────────────────────────────────
-- Run AFTER creating the Masters 2026 PGA tournament via Admin → PGA Events
-- and linking your existing fantasy tournaments to it via Admin → Tournaments.
-- Replace <PGA_TOURNAMENT_ID> with the UUID from the pga_tournaments table.
/*
-- Re-link existing scores to the PGA tournament
update public.scores s
set pga_tournament_id = t.pga_tournament_id
from public.tournaments t
where s.tournament_id = t.id
  and t.pga_tournament_id is not null;

-- Migrate Augusta hole pars from global table to PGA tournament
insert into public.pga_hole_pars (pga_tournament_id, hole, par, yards, name)
select '<PGA_TOURNAMENT_ID>', hole, par, yards_championship, name
from public.hole_pars;

-- Migrate field membership from tournament_players to pga_tournament_players
insert into public.pga_tournament_players (pga_tournament_id, player_id, is_in_field)
select t.pga_tournament_id, tp.player_id, true
from public.tournament_players tp
join public.tournaments t on t.id = tp.tournament_id
where t.pga_tournament_id is not null
on conflict (pga_tournament_id, player_id) do nothing;

-- Final cleanup: drop old tournament_id from scores + update unique constraint
alter table public.scores drop column if exists tournament_id;
alter table public.scores drop constraint if exists scores_tournament_id_player_id_round_hole_key;
alter table public.scores add constraint scores_pga_player_round_hole_key
  unique (pga_tournament_id, player_id, round, hole);

-- Drop sync config columns from tournaments (now on pga_tournaments)
alter table public.tournaments
  drop column if exists sync_url,
  drop column if exists sync_format,
  drop column if exists sync_start_date,
  drop column if exists sync_end_date,
  drop column if exists sync_enabled,
  drop column if exists current_round,
  drop column if exists course,
  drop column if exists year;
*/
