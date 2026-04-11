-- ============================================================
-- FANTASY GOLF - MULTI-TOURNAMENT SCHEMA
-- Before running: in Supabase SQL Editor, first drop old tables
-- if you ran the previous schema:
--
-- drop table if exists public.scores cascade;
-- drop table if exists public.rosters cascade;
-- drop table if exists public.players cascade;
-- drop table if exists public.tournament_state cascade;
-- drop table if exists public.hole_pars cascade;
-- drop table if exists public.profiles cascade;
-- drop function if exists public.handle_new_user cascade;
--
-- Then paste and run this entire file.
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
-- TOURNAMENTS (one per real golf event, admin-created)
-- ============================================================
create table public.tournaments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  course text,
  year integer,
  budget numeric(10,2) default 100.00,
  current_round integer default 0 check (current_round between 0 and 4),
  is_locked boolean default false,
  draft_open boolean default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- TOURNAMENT MEMBERSHIPS (user joins a tournament with a team name)
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
  world_ranking integer,       -- refreshed from OWGR before each event
  owgr_id text,                -- OWGR player ID (universal across all tournaments)
  masters_id text,             -- Masters-specific ID for score sync (optional override)
  form_score numeric(4,2),
  is_active boolean default true,
  is_withdrawn boolean default false,
  made_cut boolean default true,
  photo_url text,
  created_at timestamptz default now()
);

-- ============================================================
-- TOURNAMENT PLAYERS (per-tournament field + pricing)
-- ============================================================
create table public.tournament_players (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  price numeric(5,2),
  odds_fractional text,
  world_ranking integer,       -- snapshot at time of tournament
  is_in_field boolean default true,
  unique(tournament_id, player_id)
);

-- ============================================================
-- ROSTERS (per user, per tournament)
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
-- SCORES (per player, per tournament, per round, per hole)
-- ============================================================
create table public.scores (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  round integer check (round between 1 and 4),
  hole integer check (hole between 1 and 18),
  strokes integer,
  par integer,
  vs_par integer generated always as (strokes - par) stored,
  updated_at timestamptz default now(),
  unique(tournament_id, player_id, round, hole)
);

-- ============================================================
-- HOLE PARS (Augusta National — global reference)
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
alter table public.tournaments enable row level security;
alter table public.tournament_memberships enable row level security;
alter table public.players enable row level security;
alter table public.rosters enable row level security;
alter table public.scores enable row level security;
alter table public.tournament_players enable row level security;
alter table public.hole_pars enable row level security;

-- Profiles: everyone reads, own row update
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Tournaments: everyone reads, admin writes
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

-- Scores: everyone reads, admin writes
create policy "scores_select" on public.scores for select using (true);
create policy "scores_admin_write" on public.scores for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Hole pars: everyone reads
create policy "hole_pars_select" on public.hole_pars for select using (true);

-- ============================================================
-- SAMPLE MASTERS 2025 PLAYERS (global master list)
-- Admin can edit prices, form scores, odds before each event
-- ============================================================
insert into public.players (name, country, world_ranking, odds_fractional, odds_decimal, form_score, price) values
  ('Scottie Scheffler',   'USA', 1,   '9/2',   5.5,   9.2, 18.00),
  ('Rory McIlroy',        'NIR', 2,   '8/1',   9.0,   8.5, 16.00),
  ('Xander Schauffele',   'USA', 3,   '10/1',  11.0,  8.0, 14.50),
  ('Collin Morikawa',     'USA', 4,   '12/1',  13.0,  7.8, 13.50),
  ('Jon Rahm',            'ESP', 5,   '14/1',  15.0,  7.5, 13.00),
  ('Ludvig Åberg',        'SWE', 6,   '16/1',  17.0,  8.3, 13.00),
  ('Viktor Hovland',      'NOR', 7,   '18/1',  19.0,  7.0, 12.00),
  ('Tommy Fleetwood',     'ENG', 8,   '20/1',  21.0,  7.2, 11.50),
  ('Brooks Koepka',       'USA', 12,  '22/1',  23.0,  6.8, 11.00),
  ('Bryson DeChambeau',   'USA', 10,  '20/1',  21.0,  7.0, 11.00),
  ('Justin Thomas',       'USA', 15,  '28/1',  29.0,  6.5, 10.50),
  ('Jordan Spieth',       'USA', 14,  '25/1',  26.0,  6.8, 10.50),
  ('Patrick Cantlay',     'USA', 11,  '28/1',  29.0,  6.3, 10.00),
  ('Shane Lowry',         'IRL', 16,  '33/1',  34.0,  6.5,  9.50),
  ('Cameron Smith',       'AUS', 20,  '33/1',  34.0,  6.2,  9.00),
  ('Max Homa',            'USA', 18,  '40/1',  41.0,  6.0,  8.50),
  ('Tony Finau',          'USA', 22,  '50/1',  51.0,  5.8,  8.00),
  ('Russell Henley',      'USA', 25,  '50/1',  51.0,  6.5,  8.00),
  ('Adam Scott',          'AUS', 30,  '66/1',  67.0,  5.5,  7.50),
  ('Hideki Matsuyama',    'JPN', 19,  '28/1',  29.0,  7.0, 10.00),
  ('Will Zalatoris',      'USA', 28,  '66/1',  67.0,  5.2,  7.00),
  ('Tyrrell Hatton',      'ENG', 17,  '33/1',  34.0,  6.0,  9.00),
  ('Sepp Straka',         'AUT', 24,  '66/1',  67.0,  5.8,  7.50),
  ('Sungjae Im',          'KOR', 26,  '80/1',  81.0,  5.5,  7.00),
  ('Si Woo Kim',          'KOR', 35,  '100/1', 101.0, 5.0,  6.00),
  ('Akshay Bhatia',       'USA', 32,  '80/1',  81.0,  6.2,  7.00),
  ('Min Woo Lee',         'AUS', 29,  '80/1',  81.0,  5.8,  7.00),
  ('Sahith Theegala',     'USA', 21,  '50/1',  51.0,  6.0,  8.00),
  ('Harris English',      'USA', 40,  '150/1', 151.0, 4.8,  5.50),
  ('Fred Couples',        'USA', 200, '300/1', 301.0, 4.0,  4.00);
