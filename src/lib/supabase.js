import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function signUp(email, password, username) {
  return await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
}

export async function signIn(email, password) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return await supabase.auth.signOut();
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export async function getProfile(userId) {
  return await supabase.from('profiles').select('*').eq('id', userId).single();
}

export async function getAllProfiles() {
  return await supabase.from('profiles').select('*').order('username');
}

export async function updateProfile(userId, updates) {
  return await supabase.from('profiles').update(updates).eq('id', userId).select().single();
}

// ─── PGA Tournaments (real golf events) ──────────────────────────────────────

export async function getPgaTournaments() {
  return await supabase
    .from('pga_tournaments')
    .select('*')
    .order('created_at', { ascending: false });
}

export async function getPgaTournament(id) {
  return await supabase.from('pga_tournaments').select('*').eq('id', id).single();
}

export async function createPgaTournament(data) {
  return await supabase.from('pga_tournaments').insert(data).select().single();
}

export async function updatePgaTournament(id, updates) {
  return await supabase.from('pga_tournaments').update(updates).eq('id', id).select().single();
}

export async function deletePgaTournament(id) {
  return await supabase.from('pga_tournaments').delete().eq('id', id);
}

export async function getPgaFieldCounts() {
  const { data } = await supabase
    .from('pga_tournament_players')
    .select('pga_tournament_id')
    .eq('is_in_field', true);
  const counts = {};
  for (const row of data || []) {
    counts[row.pga_tournament_id] = (counts[row.pga_tournament_id] || 0) + 1;
  }
  return counts;
}

// ─── PGA Tournament Field (which players are in the PGA field) ────────────────

export async function getPgaField(pgaTournamentId) {
  return await supabase
    .from('pga_tournament_players')
    .select('*, players(id, name, country, world_ranking, owgr_id, is_withdrawn)')
    .eq('pga_tournament_id', pgaTournamentId)
    .order('players(world_ranking)');
}

export async function upsertPgaField(pgaTournamentId, entries) {
  // entries: [{ player_id, is_in_field }]
  const rows = entries.map(e => ({ ...e, pga_tournament_id: pgaTournamentId }));
  return await supabase
    .from('pga_tournament_players')
    .upsert(rows, { onConflict: 'pga_tournament_id,player_id' })
    .select();
}

// ─── PGA Hole Pars ────────────────────────────────────────────────────────────

export async function getPgaHolePars(pgaTournamentId) {
  if (!pgaTournamentId) {
    // Fallback to legacy global table during migration
    return await supabase.from('hole_pars').select('hole, par, yards_championship as yards, name').order('hole');
  }
  return await supabase
    .from('pga_hole_pars')
    .select('hole, par, yards, name')
    .eq('pga_tournament_id', pgaTournamentId)
    .order('hole');
}

export async function upsertPgaHolePars(pgaTournamentId, pars) {
  // pars: [{ hole, par, yards, name }]
  const rows = pars.map(p => ({ ...p, pga_tournament_id: pgaTournamentId }));
  return await supabase
    .from('pga_hole_pars')
    .upsert(rows, { onConflict: 'pga_tournament_id,hole' })
    .select();
}

// ─── Fantasy Tournaments ──────────────────────────────────────────────────────

export async function getTournaments() {
  return await supabase
    .from('tournaments')
    .select('*, pga_tournaments(id, name, course, year)')
    .order('created_at', { ascending: false });
}

export async function getTournament(id) {
  return await supabase
    .from('tournaments')
    .select('*, pga_tournaments(id, name, course, year)')
    .eq('id', id)
    .single();
}

export async function createTournament(data) {
  return await supabase.from('tournaments').insert(data).select().single();
}

export async function updateTournament(id, updates) {
  return await supabase
    .from('tournaments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
}

export async function deleteTournament(id) {
  return await supabase.from('tournaments').delete().eq('id', id);
}

// ─── Tournament Memberships ───────────────────────────────────────────────────

export async function getUserMembership(tournamentId, userId) {
  return await supabase
    .from('tournament_memberships')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle();
}

export async function getUserMemberships(userId) {
  return await supabase
    .from('tournament_memberships')
    .select('*, tournaments(*, pga_tournaments(name))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export async function joinTournament(tournamentId, userId, teamName) {
  return await supabase
    .from('tournament_memberships')
    .insert({ tournament_id: tournamentId, user_id: userId, team_name: teamName })
    .select()
    .single();
}

export async function getTournamentMembers(tournamentId) {
  return await supabase
    .from('tournament_memberships')
    .select('*, profiles(username, is_admin)')
    .eq('tournament_id', tournamentId);
}

// ─── Tournament Players (per-fantasy-tournament pricing) ─────────────────────

export async function getTournamentPlayers(tournamentId) {
  // Look up the linked PGA tournament for field membership
  const { data: ft } = await supabase
    .from('tournaments')
    .select('pga_tournament_id')
    .eq('id', tournamentId)
    .single();

  const pgaTournamentId = ft?.pga_tournament_id;

  if (pgaTournamentId) {
    // New architecture: field from pga_tournament_players, pricing from tournament_players
    const [{ data: fieldData }, { data: pricingData }] = await Promise.all([
      supabase
        .from('pga_tournament_players')
        .select('player_id, players(*)')
        .eq('pga_tournament_id', pgaTournamentId)
        .eq('is_in_field', true),
      supabase
        .from('tournament_players')
        .select('player_id, price, odds_fractional, world_ranking')
        .eq('tournament_id', tournamentId),
    ]);
    const priceMap = Object.fromEntries((pricingData || []).map(tp => [tp.player_id, tp]));
    const data = (fieldData || []).map(fp => ({
      ...fp.players,
      price: priceMap[fp.player_id]?.price ?? null,
      odds_fractional: priceMap[fp.player_id]?.odds_fractional ?? fp.players?.odds_fractional,
      world_ranking: priceMap[fp.player_id]?.world_ranking ?? fp.players?.world_ranking,
    }));
    return { data, error: null };
  }

  // Fallback: old single-table approach (during migration, before PGA tournament is linked)
  const { data, error } = await supabase
    .from('tournament_players')
    .select('price, odds_fractional, world_ranking, players(*)')
    .eq('tournament_id', tournamentId)
    .order('world_ranking');
  const flattened = (data || []).map(tp => ({
    ...tp.players,
    price: tp.price ?? tp.players?.price,
    odds_fractional: tp.odds_fractional ?? tp.players?.odds_fractional,
    world_ranking: tp.world_ranking ?? tp.players?.world_ranking,
  }));
  return { data: flattened, error };
}

export async function getTournamentField(tournamentId) {
  return await supabase
    .from('tournament_players')
    .select('*, players(id, name, country, world_ranking, owgr_id)')
    .eq('tournament_id', tournamentId)
    .order('world_ranking');
}

export async function upsertTournamentPlayers(tournamentId, entries) {
  // entries: [{ player_id, price, odds_fractional, world_ranking }]
  const rows = entries.map(e => ({ ...e, tournament_id: tournamentId }));
  return await supabase
    .from('tournament_players')
    .upsert(rows, { onConflict: 'tournament_id,player_id' })
    .select();
}

export async function getTournamentPriceMap(tournamentId) {
  const { data } = await supabase
    .from('tournament_players')
    .select('player_id, price')
    .eq('tournament_id', tournamentId);
  return Object.fromEntries((data || []).map(tp => [tp.player_id, tp.price ?? 0]));
}

// ─── Players (global master list) ─────────────────────────────────────────────

export async function getPlayers() {
  return await supabase.from('players').select('*').eq('is_active', true).order('world_ranking');
}

export async function getAllPlayers() {
  return await supabase.from('players').select('*').order('world_ranking');
}

export async function updatePlayer(playerId, updates) {
  return await supabase.from('players').update(updates).eq('id', playerId).select().single();
}

export async function createPlayer(player) {
  return await supabase.from('players').insert(player).select().single();
}

export async function deletePlayer(playerId) {
  return await supabase.from('players').delete().eq('id', playerId);
}


// ─── Rosters ──────────────────────────────────────────────────────────────────

export async function getUserRoster(userId, tournamentId) {
  return await supabase
    .from('rosters')
    .select('*, players(*)')
    .eq('user_id', userId)
    .eq('tournament_id', tournamentId)
    .order('slot_number');
}

export async function getAllRosters(tournamentId) {
  return await supabase
    .from('rosters')
    .select('*, players(*), profiles(username)')
    .eq('tournament_id', tournamentId);
}

export async function addToRoster(userId, playerId, tournamentId, slotType, slotNumber) {
  return await supabase
    .from('rosters')
    .insert({ user_id: userId, player_id: playerId, tournament_id: tournamentId, slot_type: slotType, slot_number: slotNumber })
    .select()
    .single();
}

export async function removeFromRoster(userId, playerId, tournamentId) {
  return await supabase
    .from('rosters')
    .delete()
    .eq('user_id', userId)
    .eq('player_id', playerId)
    .eq('tournament_id', tournamentId);
}

export async function updateRosterEntry(userId, playerId, tournamentId, updates) {
  return await supabase
    .from('rosters')
    .update(updates)
    .eq('user_id', userId)
    .eq('player_id', playerId)
    .eq('tournament_id', tournamentId)
    .select()
    .single();
}

// ─── Scores (keyed by PGA tournament) ────────────────────────────────────────

export async function getAllScores(pgaTournamentId, round) {
  let query = supabase
    .from('scores')
    .select('*, players(name)')
    .eq('pga_tournament_id', pgaTournamentId)
    .order('round')
    .order('hole')
    .limit(10000); // override Supabase's default 1000-row cap
  if (round) query = query.eq('round', round);
  return await query;
}

export async function getPlayerScores(playerId, pgaTournamentId) {
  return await supabase
    .from('scores')
    .select('*')
    .eq('player_id', playerId)
    .eq('pga_tournament_id', pgaTournamentId)
    .order('round')
    .order('hole');
}

export async function upsertScore(playerId, pgaTournamentId, round, hole, strokes, par) {
  return await supabase
    .from('scores')
    .upsert(
      { player_id: playerId, pga_tournament_id: pgaTournamentId, round, hole, strokes, par, updated_at: new Date().toISOString() },
      { onConflict: 'pga_tournament_id,player_id,round,hole' }
    )
    .select()
    .single();
}

// Legacy fallback: read from global hole_pars (pre-migration)
export async function getHolePars(pgaTournamentId) {
  return getPgaHolePars(pgaTournamentId ?? null);
}

// ─── Roster Round Snapshots ───────────────────────────────────────────────────

// Fetches scores for a specific set of player IDs, one round at a time to
// avoid Supabase's server-side row cap (default 1000). Each round has at most
// ~playerIds.length × 18 rows, which is well within limits.
export async function getScoresForPlayers(pgaTournamentId, playerIds) {
  if (!playerIds?.length) return [];
  const results = await Promise.all(
    [1, 2, 3, 4].map(round =>
      supabase
        .from('scores')
        .select('player_id, round, hole, strokes, vs_par')
        .eq('pga_tournament_id', pgaTournamentId)
        .eq('round', round)
        .in('player_id', playerIds)
    )
  );
  return results.flatMap(({ data }) => data || []);
}

export async function getRoundSnapshots(tournamentId) {
  return await supabase
    .from('roster_round_players')
    .select('round, user_id, player_id, slot_type, players(id, name, world_ranking, is_withdrawn)')
    .eq('tournament_id', tournamentId);
}

// Returns { [player_id]: true | false | null } for a PGA tournament.
// null = cut check not yet run; false = missed cut; true = made cut.
export async function getTournamentCutStatus(pgaTournamentId) {
  if (!pgaTournamentId) return {};
  const { data } = await supabase
    .from('pga_tournament_players')
    .select('player_id, made_cut')
    .eq('pga_tournament_id', pgaTournamentId);
  return Object.fromEntries((data || []).map(r => [r.player_id, r.made_cut]));
}

export async function getLockedRounds(tournamentId) {
  const { data } = await supabase
    .from('roster_round_players')
    .select('round')
    .eq('tournament_id', tournamentId);
  return [...new Set((data || []).map(r => r.round))].sort();
}

// ─── Pricing formula ──────────────────────────────────────────────────────────

export function calculatePrice(worldRanking, oddsDecimal, formScore) {
  const rankingScore = Math.max(1, 10 - (worldRanking - 1) * (9 / 199));
  const oddsScore = Math.max(1, 10 - Math.log(oddsDecimal) * 2);
  const fs = formScore || 5;
  const raw = rankingScore * 0.4 + oddsScore * 0.4 + fs * 0.2;
  return Math.round(raw * 1.8 * 10) / 10;
}
