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

// ─── Tournaments ──────────────────────────────────────────────────────────────

export async function getTournaments() {
  return await supabase
    .from('tournaments')
    .select('*')
    .order('created_at', { ascending: false });
}

export async function getTournament(id) {
  return await supabase.from('tournaments').select('*').eq('id', id).single();
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
    .select('*, tournaments(*)')
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

// ─── Tournament Players (per-tournament field + pricing) ──────────────────────

export async function getTournamentPlayers(tournamentId) {
  const { data, error } = await supabase
    .from('tournament_players')
    .select('price, odds_fractional, world_ranking, is_in_field, players(*)')
    .eq('tournament_id', tournamentId)
    .eq('is_in_field', true)
    .order('world_ranking');
  // Flatten: merge tournament-specific price/odds onto the player object
  const flattened = (data || []).map(tp => ({
    ...tp.players,
    price: tp.price ?? tp.players?.price,
    odds_fractional: tp.odds_fractional ?? tp.players?.odds_fractional,
    world_ranking: tp.world_ranking ?? tp.players?.world_ranking,
  }));
  return { data: flattened, error };
}

export async function getTournamentField(tournamentId) {
  // Returns raw tournament_players rows (for admin field setup)
  return await supabase
    .from('tournament_players')
    .select('*, players(id, name, country, world_ranking, owgr_id)')
    .eq('tournament_id', tournamentId)
    .order('world_ranking');
}

export async function upsertTournamentPlayers(tournamentId, entries) {
  // entries: [{ player_id, price, odds_fractional, world_ranking, is_in_field }]
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
  return await supabase
    .from('players')
    .select('*')
    .eq('is_active', true)
    .order('world_ranking');
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

export async function markAllPlayersMissedCut() {
  return await supabase.from('players').update({ made_cut: false }).neq('id', '00000000-0000-0000-0000-000000000000');
}

// ─── Rosters (per user, per tournament) ───────────────────────────────────────

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

// ─── Scores ───────────────────────────────────────────────────────────────────

export async function getPlayerScores(playerId, tournamentId) {
  return await supabase
    .from('scores')
    .select('*')
    .eq('player_id', playerId)
    .eq('tournament_id', tournamentId)
    .order('round')
    .order('hole');
}

export async function getAllScores(tournamentId, round) {
  let query = supabase
    .from('scores')
    .select('*, players(name)')
    .eq('tournament_id', tournamentId)
    .order('round')
    .order('hole');
  if (round) query = query.eq('round', round);
  return await query;
}

export async function upsertScore(playerId, tournamentId, round, hole, strokes, par) {
  return await supabase
    .from('scores')
    .upsert(
      { player_id: playerId, tournament_id: tournamentId, round, hole, strokes, par, updated_at: new Date().toISOString() },
      { onConflict: 'tournament_id,player_id,round,hole' }
    )
    .select()
    .single();
}

export async function getHolePars() {
  return await supabase.from('hole_pars').select('*').order('hole');
}

// ─── Pricing formula ──────────────────────────────────────────────────────────

export function calculatePrice(worldRanking, oddsDecimal, formScore) {
  const rankingScore = Math.max(1, 10 - (worldRanking - 1) * (9 / 199));
  const oddsScore = Math.max(1, 10 - Math.log(oddsDecimal) * 2);
  const fs = formScore || 5;
  const raw = rankingScore * 0.4 + oddsScore * 0.4 + fs * 0.2;
  return Math.round(raw * 1.8 * 10) / 10;
}
