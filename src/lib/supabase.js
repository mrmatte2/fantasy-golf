import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Auth helpers ────────────────────────────────────────────────────────────

export async function signUp(email, password, username, teamName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, team_name: teamName } },
  });
  return { data, error };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signOut() {
  return await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ─── Profile helpers ─────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('username');
  return { data, error };
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

// ─── Tournament state ─────────────────────────────────────────────────────────

export async function getTournamentState() {
  const { data, error } = await supabase
    .from('tournament_state')
    .select('*')
    .single();
  return { data, error };
}

export async function updateTournamentState(updates) {
  const { data, error } = await supabase
    .from('tournament_state')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select()
    .single();
  return { data, error };
}

// ─── Players ──────────────────────────────────────────────────────────────────

export async function getPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('is_active', true)
    .order('world_ranking');
  return { data, error };
}

export async function updatePlayer(playerId, updates) {
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', playerId)
    .select()
    .single();
  return { data, error };
}

export async function upsertPlayer(player) {
  const { data, error } = await supabase
    .from('players')
    .upsert(player)
    .select()
    .single();
  return { data, error };
}

// ─── Rosters ──────────────────────────────────────────────────────────────────

export async function getUserRoster(userId) {
  const { data, error } = await supabase
    .from('rosters')
    .select(`*, players(*)`)
    .eq('user_id', userId)
    .order('slot_number');
  return { data, error };
}

export async function getAllRosters() {
  const { data, error } = await supabase
    .from('rosters')
    .select(`*, players(*), profiles(username, team_name)`);
  return { data, error };
}

export async function addToRoster(userId, playerId, slotType, slotNumber) {
  const { data, error } = await supabase
    .from('rosters')
    .insert({ user_id: userId, player_id: playerId, slot_type: slotType, slot_number: slotNumber })
    .select()
    .single();
  return { data, error };
}

export async function removeFromRoster(userId, playerId) {
  const { error } = await supabase
    .from('rosters')
    .delete()
    .eq('user_id', userId)
    .eq('player_id', playerId);
  return { error };
}

export async function updateRosterEntry(userId, playerId, updates) {
  const { data, error } = await supabase
    .from('rosters')
    .update(updates)
    .eq('user_id', userId)
    .eq('player_id', playerId)
    .select()
    .single();
  return { data, error };
}

// ─── Scores ───────────────────────────────────────────────────────────────────

export async function getPlayerScores(playerId, round) {
  let query = supabase
    .from('scores')
    .select('*')
    .eq('player_id', playerId)
    .order('hole');
  if (round) query = query.eq('round', round);
  const { data, error } = await query;
  return { data, error };
}

export async function getAllScores(round) {
  let query = supabase
    .from('scores')
    .select('*, players(name)')
    .order('round')
    .order('hole');
  if (round) query = query.eq('round', round);
  const { data, error } = await query;
  return { data, error };
}

export async function upsertScore(playerId, round, hole, strokes, par) {
  const { data, error } = await supabase
    .from('scores')
    .upsert({ player_id: playerId, round, hole, strokes, par, updated_at: new Date().toISOString() },
      { onConflict: 'player_id,round,hole' })
    .select()
    .single();
  return { data, error };
}

export async function getHolePars() {
  const { data, error } = await supabase
    .from('hole_pars')
    .select('*')
    .order('hole');
  return { data, error };
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

export async function getTournaments() {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, sync_url, sync_format, sync_start_date, sync_end_date, sync_enabled')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function updateTournament(id, updates) {
  const { data, error } = await supabase
    .from('tournaments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export async function getFantasyLeaderboard() {
  const { data, error } = await supabase
    .from('fantasy_leaderboard')
    .select('*');
  return { data, error };
}

// ─── Pricing formula (client-side) ───────────────────────────────────────────
// Price = (ranking_score * 0.4) + (odds_score * 0.4) + (form_score * 0.2)
// Ranking score: scale 1-200 → 10-1 (lower rank = higher score)
// Odds score: scale from decimal odds → 10 (shorter odds = higher score)

export function calculatePrice(worldRanking, oddsDecimal, formScore) {
  const rankingScore = Math.max(1, 10 - (worldRanking - 1) * (9 / 199));
  const oddsScore = Math.max(1, 10 - Math.log(oddsDecimal) * 2);
  const fs = formScore || 5;
  const raw = rankingScore * 0.4 + oddsScore * 0.4 + fs * 0.2;
  // Scale to roughly 4–18 range
  return Math.round(raw * 1.8 * 10) / 10;
}
