/**
 * Generic Score Sync Script
 *
 * Reads sync configuration from `tournament_state` in Supabase, then fetches
 * and upserts scores using the configured API URL and parser format.
 *
 * Configuration is set in the Admin panel → Tournament tab → Score Sync card.
 * No hardcoded URLs or tournament IDs — all driven by the database.
 *
 * Supported formats:
 *   "masters"  — masters.com unofficial JSON feed
 *   Add new formats by adding a function to the PARSERS object below.
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function isWithinRange(start, end) {
  const today = todayUTC();
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

// ─── Shared DB helpers ────────────────────────────────────────────────────────

async function loadHolePars() {
  const { data, error } = await supabase.from('hole_pars').select('hole, par').order('hole');
  if (error) throw new Error(`Failed to load hole_pars: ${error.message}`);
  const map = {};
  for (const row of data) map[row.hole] = row.par;
  return map;
}

async function loadPlayers() {
  const { data, error } = await supabase.from('players').select('id, name');
  if (error) throw new Error(`Failed to load players: ${error.message}`);
  return data;
}

function findPlayer(players, name) {
  const norm = n => n.toLowerCase().trim().replace(/\s+/g, ' ');
  const target = norm(name);
  return players.find(p => norm(p.name) === target)?.id ?? null;
}

async function createPlayer(name) {
  const { data, error } = await supabase
    .from('players')
    .insert({ name, is_active: true, made_cut: true })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create player "${name}": ${error.message}`);
  console.log(`  Created new player: ${name}`);
  return data.id;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
// Each parser receives (url: string) and is responsible for fetching the data
// and upserting scores into the `scores` table.
// Return value: { playersMatched, playersCreated, scoresUpserted }

const PARSERS = {

  /**
   * masters — masters.com unofficial JSON feed
   *
   * Response shape (two known variants):
   *   { fileEpoch, data: { player: [ { id, full_name, rounds: [ { scores: [strokes…] } ] } ] } }
   *   OR: { player: [...] }
   */
  async masters(url, tournamentId) {
    console.log(`Fetching: ${url}`);

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'application/json, */*',
        'Referer': 'https://www.masters.com/',
      },
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
    const raw = await resp.json();

    const masterPlayers = raw.player || raw.players || raw.data?.player || [];
    if (!masterPlayers.length) {
      console.log('No players found in response. Tournament may not have started yet.');
      return { playersMatched: 0, playersCreated: 0, scoresUpserted: 0 };
    }

    const [dbPlayers, parMap] = await Promise.all([loadPlayers(), loadHolePars()]);
    const upserts = [];
    let matched = 0;
    let created = 0;

    for (const mp of masterPlayers) {
      const fullName = mp.full_name || mp.fullName || mp.name;
      if (!fullName) continue;

      let playerId = findPlayer(dbPlayers, fullName);
      if (!playerId) {
        playerId = await createPlayer(fullName);
        dbPlayers.push({ id: playerId, name: fullName });
        created++;
      } else {
        matched++;
      }

      const rounds = mp.rounds || mp.round_scores || [];
      rounds.forEach((roundData, roundIdx) => {
        const round = roundIdx + 1;
        const scores = roundData.scores || roundData || [];
        scores.forEach((strokes, holeIdx) => {
          if (!strokes || strokes === 0) return;
          const hole = holeIdx + 1;
          if (hole > 18) return;
          upserts.push({
            tournament_id: tournamentId,
            player_id: playerId,
            round,
            hole,
            strokes,
            par: parMap[hole] ?? 4,
            updated_at: new Date().toISOString(),
          });
        });
      });
    }

    if (!upserts.length) {
      console.log('No scores to upsert yet (rounds may not have started).');
      return { playersMatched: matched, playersCreated: created, scoresUpserted: 0 };
    }

    // Batch upsert in chunks of 200 to stay within Supabase limits
    let totalUpserted = 0;
    for (let i = 0; i < upserts.length; i += 200) {
      const batch = upserts.slice(i, i + 200);
      const { error } = await supabase
        .from('scores')
        .upsert(batch, { onConflict: 'tournament_id,player_id,round,hole' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
      totalUpserted += batch.length;
    }

    return { playersMatched: matched, playersCreated: created, scoresUpserted: totalUpserted };
  },

  // ── Add new formats here ───────────────────────────────────────────────────
  // async pga_tour(url) { ... },
  // async european_tour(url) { ... },

};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load all tournaments that have sync enabled
  const { data: tournaments, error: tourErr } = await supabase
    .from('tournaments')
    .select('id, name, sync_url, sync_format, sync_start_date, sync_end_date, sync_enabled')
    .eq('sync_enabled', true);

  if (tourErr) {
    console.error('Failed to load tournaments:', tourErr.message);
    process.exit(1);
  }

  if (!tournaments || !tournaments.length) {
    console.log('No tournaments have sync enabled. Nothing to do.');
    process.exit(0);
  }

  // Filter to those within their date window
  const active = tournaments.filter(t => isWithinRange(t.sync_start_date, t.sync_end_date));

  console.log(`Today: ${todayUTC()}`);
  console.log(`Tournaments with sync enabled : ${tournaments.length}`);
  console.log(`Within date window            : ${active.length}`);

  if (!active.length) {
    console.log('\nAll synced tournaments are outside their date window. Skipping.');
    process.exit(0);
  }

  let anyFailure = false;

  for (const t of active) {
    console.log(`\n── ${t.name} ─────────────────────────────`);
    console.log(`Date window : ${t.sync_start_date || '(none)'} → ${t.sync_end_date || '(none)'}`);
    console.log(`Format      : ${t.sync_format}`);
    console.log(`URL         : ${t.sync_url}`);

    if (!t.sync_url) {
      console.error('  No sync_url set — skipping. Configure it in Admin → Sync tab.');
      continue;
    }

    const parser = PARSERS[t.sync_format];
    if (!parser) {
      console.error(`  Unknown format "${t.sync_format}". Supported: ${Object.keys(PARSERS).join(', ')}`);
      anyFailure = true;
      continue;
    }

    try {
      const result = await parser(t.sync_url, t.id);
      if (result.playersMatched !== undefined) console.log(`  Players matched : ${result.playersMatched}`);
      if (result.playersCreated)              console.log(`  Players created : ${result.playersCreated}`);
      if (result.scoresUpserted !== undefined) console.log(`  Scores upserted : ${result.scoresUpserted}`);
    } catch (err) {
      console.error(`  Sync failed: ${err.message}`);
      anyFailure = true;
    }
  }

  if (anyFailure) process.exit(1);
  console.log('\n── All done ─────────────────────────────');
}

main().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
