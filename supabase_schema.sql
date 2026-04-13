-- ============================================================
-- FANTASY GOLF - MASTERS 2025 - SUPABASE SCHEMA
-- Paste this entire file into Supabase > SQL Editor > Run
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  team_name text,
  budget_remaining numeric(10,2) default 100.00,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, team_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'team_name', 'My Team')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- TOURNAMENT STATE
-- ============================================================
create table public.tournament_state (
  id integer primary key default 1 check (id = 1), -- singleton row
  current_round integer default 0,         -- 0 = pre-tournament, 1-4 = rounds
  is_locked boolean default false,          -- roster locked flag
  draft_open boolean default true,          -- draft phase open
  tournament_name text default 'The Masters 2025',
  -- Score sync config (GUI-configured, read by GitHub Actions sync script)
  sync_url text,                            -- API endpoint to fetch scores from
  sync_format text default 'masters',       -- parser to use: 'masters', 'pga_tour', etc.
  sync_start_date date,                     -- first day to sync (inclusive)
  sync_end_date date,                       -- last day to sync (inclusive)
  sync_enabled boolean default false,       -- manual on/off switch
  updated_at timestamptz default now()
);

-- Insert the single state row
insert into public.tournament_state (id) values (1);

-- Score sync config (added via migration — see migration note below)
-- alter table public.tournament_state
--   add column if not exists sync_url text,
--   add column if not exists sync_format text default 'masters',
--   add column if not exists sync_start_date date,
--   add column if not exists sync_end_date date,
--   add column if not exists sync_enabled boolean default false;

-- ============================================================
-- PLAYERS
-- ============================================================
create table public.players (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  country text,
  world_ranking integer,                    -- lower = better
  odds_fractional text,                     -- e.g. "12/1"
  odds_decimal numeric(6,2),                -- e.g. 13.0
  form_score numeric(4,2),                  -- 0-10, admin set, based on last 5 events
  price numeric(5,2),                       -- calculated + admin adjustable
  price_override numeric(5,2),              -- admin manual override (nullable)
  is_active boolean default true,           -- in the field
  is_withdrawn boolean default false,
  made_cut boolean default true,
  photo_url text,
  created_at timestamptz default now()
);

-- ============================================================
-- ROSTERS
-- ============================================================
create table public.rosters (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  slot_type text check (slot_type in ('starter', 'sub')),  -- starter or sub
  slot_number integer,                       -- 1-5 for starters, 1-3 for subs
  is_active boolean default true,            -- if false, subbed out
  round_added integer default 1,             -- which round they were added
  created_at timestamptz default now(),
  unique(user_id, player_id)
);

-- ============================================================
-- SCORES (per player, per round, per hole)
-- ============================================================
create table public.scores (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid references public.players(id) on delete cascade,
  round integer check (round between 1 and 4),
  hole integer check (hole between 1 and 18),
  strokes integer,                           -- actual strokes taken
  par integer,                               -- par for that hole
  vs_par integer generated always as (strokes - par) stored,
  updated_at timestamptz default now(),
  unique(player_id, round, hole)
);

-- ============================================================
-- AUGUSTA - PAR VALUES PER HOLE
-- ============================================================
create table public.hole_pars (
  hole integer primary key,
  par integer,
  yards_championship integer,
  name text                                  -- hole name e.g. "Tea Olive"
);

-- Augusta National official par values
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
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.rosters enable row level security;
alter table public.scores enable row level security;
alter table public.tournament_state enable row level security;
alter table public.hole_pars enable row level security;

-- Profiles: users see all, edit own
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Players: everyone reads, only admin writes
create policy "players_select" on public.players for select using (true);
create policy "players_admin_write" on public.players for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Rosters: read all, write own (if draft open and not locked)
create policy "rosters_select" on public.rosters for select using (true);
create policy "rosters_insert_own" on public.rosters for insert
  with check (
    auth.uid() = user_id and
    exists (select 1 from public.tournament_state where draft_open = true and is_locked = false)
  );
create policy "rosters_update_own" on public.rosters for update
  using (auth.uid() = user_id);
create policy "rosters_delete_own" on public.rosters for delete
  using (
    auth.uid() = user_id and
    exists (select 1 from public.tournament_state where is_locked = false)
  );

-- Scores: everyone reads, admin writes
create policy "scores_select" on public.scores for select using (true);
create policy "scores_admin_write" on public.scores for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Tournament state: everyone reads, admin writes
create policy "tournament_state_select" on public.tournament_state for select using (true);
create policy "tournament_state_admin" on public.tournament_state for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Hole pars: everyone reads
create policy "hole_pars_select" on public.hole_pars for select using (true);

-- ============================================================
-- USEFUL VIEWS
-- ============================================================

-- Fantasy leaderboard: sum of best 4 of 5 starters per user per round
create or replace view public.fantasy_leaderboard as
with roster_scores as (
  select
    r.user_id,
    p.username,
    p.team_name,
    r.player_id,
    pl.name as player_name,
    s.round,
    sum(s.vs_par) as round_vs_par,
    sum(s.strokes) as round_strokes,
    count(s.hole) as holes_played
  from public.rosters r
  join public.profiles p on p.id = r.user_id
  join public.players pl on pl.id = r.player_id
  left join public.scores s on s.player_id = r.player_id
  where r.slot_type = 'starter' and r.is_active = true
  group by r.user_id, p.username, p.team_name, r.player_id, pl.name, s.round
),
ranked_per_round as (
  select *,
    row_number() over (
      partition by user_id, round
      order by round_vs_par asc nulls last
    ) as rank_in_round
  from roster_scores
),
best4 as (
  select user_id, username, team_name, round,
    sum(round_vs_par) as round_total_vs_par,
    count(*) as players_counted
  from ranked_per_round
  where rank_in_round <= 4
  group by user_id, username, team_name, round
)
select
  user_id,
  username,
  team_name,
  sum(round_total_vs_par) as total_vs_par,
  rank() over (order by sum(round_total_vs_par) asc) as position
from best4
group by user_id, username, team_name
order by total_vs_par asc;

-- ============================================================
-- SAMPLE MASTERS 2025 PLAYERS (top contenders)
-- Admin can adjust prices and form scores in the app
-- Price formula: (ranking_score * 0.4) + (odds_score * 0.4) + (form_score * 0.2)
-- Prices scaled to a budget of 100 for 8 picks (5 starters + 3 subs)
-- ============================================================

insert into public.players (name, country, world_ranking, odds_fractional, odds_decimal, form_score, price) values
  ('Scottie Scheffler',   'USA', 1,  '9/2',   5.5,  9.2, 18.00),
  ('Rory McIlroy',        'NIR', 2,  '8/1',   9.0,  8.5, 16.00),
  ('Xander Schauffele',   'USA', 3,  '10/1',  11.0, 8.0, 14.50),
  ('Collin Morikawa',     'USA', 4,  '12/1',  13.0, 7.8, 13.50),
  ('Jon Rahm',            'ESP', 5,  '14/1',  15.0, 7.5, 13.00),
  ('Ludvig Åberg',        'SWE', 6,  '16/1',  17.0, 8.3, 13.00),
  ('Viktor Hovland',      'NOR', 7,  '18/1',  19.0, 7.0, 12.00),
  ('Tommy Fleetwood',     'ENG', 8,  '20/1',  21.0, 7.2, 11.50),
  ('Brooks Koepka',       'USA', 12, '22/1',  23.0, 6.8, 11.00),
  ('Bryson DeChambeau',   'USA', 10, '20/1',  21.0, 7.0, 11.00),
  ('Justin Thomas',       'USA', 15, '28/1',  29.0, 6.5, 10.50),
  ('Jordan Spieth',       'USA', 14, '25/1',  26.0, 6.8, 10.50),
  ('Patrick Cantlay',     'USA', 11, '28/1',  29.0, 6.3, 10.00),
  ('Shane Lowry',         'IRL', 16, '33/1',  34.0, 6.5, 9.50),
  ('Cameron Smith',       'AUS', 20, '33/1',  34.0, 6.2, 9.00),
  ('Max Homa',            'USA', 18, '40/1',  41.0, 6.0, 8.50),
  ('Tony Finau',          'USA', 22, '50/1',  51.0, 5.8, 8.00),
  ('Russell Henley',      'USA', 25, '50/1',  51.0, 6.5, 8.00),
  ('Adam Scott',          'AUS', 30, '66/1',  67.0, 5.5, 7.50),
  ('Hideki Matsuyama',    'JPN', 19, '28/1',  29.0, 7.0, 10.00),
  ('Will Zalatoris',      'USA', 28, '66/1',  67.0, 5.2, 7.00),
  ('Tyrrell Hatton',      'ENG', 17, '33/1',  34.0, 6.0, 9.00),
  ('Sepp Straka',         'AUT', 24, '66/1',  67.0, 5.8, 7.50),
  ('Sungjae Im',          'KOR', 26, '80/1',  81.0, 5.5, 7.00),
  ('Si Woo Kim',          'KOR', 35, '100/1', 101.0,5.0, 6.00),
  ('Akshay Bhatia',       'USA', 32, '80/1',  81.0, 6.2, 7.00),
  ('Min Woo Lee',         'AUS', 29, '80/1',  81.0, 5.8, 7.00),
  ('Sahith Theegala',     'USA', 21, '50/1',  51.0, 6.0, 8.00),
  ('Harris English',      'USA', 40, '150/1', 151.0,4.8, 5.50),
  ('Fred Couples',        'USA', 200,'300/1', 301.0,4.0, 4.00);
