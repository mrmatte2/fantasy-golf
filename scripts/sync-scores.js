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
 *   "espn"     — ESPN Golf scoreboard API (all PGA Tour events)
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

// ─── ESPN fetch helper ────────────────────────────────────────────────────────

async function espnFetch(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept': 'application/json, */*',
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

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

async function loadHolePars(pgaTournamentId) {
  // Prefer per-tournament pars, fall back to global hole_pars during migration
  const { data: pgaPars } = await supabase
    .from('pga_hole_pars')
    .select('hole, par')
    .eq('pga_tournament_id', pgaTournamentId)
    .order('hole');
  if (pgaPars?.length) {
    const map = {};
    for (const row of pgaPars) map[row.hole] = row.par;
    return map;
  }
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
    .insert({ name, is_active: true })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create player "${name}": ${error.message}`);
  console.log(`  Created new player: ${name}`);
  return data.id;
}

// ─── Roster snapshot ──────────────────────────────────────────────────────────

async function snapshotRostersIfNewRound(pgaTournamentId) {
  const { data: fantasyTournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('pga_tournament_id', pgaTournamentId);

  for (const ft of fantasyTournaments || []) {
    const { data: scoredRounds } = await supabase
      .from('scores')
      .select('round')
      .eq('pga_tournament_id', pgaTournamentId)
      .limit(1000);
    const rounds = [...new Set((scoredRounds || []).map(s => s.round))];

    const { data: snappedRounds } = await supabase
      .from('roster_round_players')
      .select('round')
      .eq('tournament_id', ft.id);
    const snapped = new Set((snappedRounds || []).map(r => r.round));

    for (const round of rounds) {
      if (snapped.has(round)) continue;
      const { data: rosters } = await supabase
        .from('rosters')
        .select('user_id, player_id, slot_type')
        .eq('tournament_id', ft.id)
        .eq('is_active', true);
      if (!rosters?.length) continue;
      const rows = rosters.map(r => ({ ...r, tournament_id: ft.id, round }));
      await supabase
        .from('roster_round_players')
        .upsert(rows, { onConflict: 'tournament_id,user_id,player_id,round' });
      console.log(`  Snapshotted rosters for fantasy tournament ${ft.id} round ${round}`);
    }
  }
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
  async masters(url, pgaTournamentId) {
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

    const [dbPlayers, parMap] = await Promise.all([loadPlayers(), loadHolePars(pgaTournamentId)]);
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

      // API uses round1/round2/round3/round4 as direct keys, each with a
      // scores object keyed "0"–"17" (0-indexed hole numbers)
      for (let roundIdx = 1; roundIdx <= 4; roundIdx++) {
        const roundData = mp[`round${roundIdx}`];
        if (!roundData?.scores) continue;
        const round = roundIdx;
        for (const [holeKey, strokes] of Object.entries(roundData.scores)) {
          if (!strokes || strokes === 0) continue;
          const hole = parseInt(holeKey) + 1; // convert 0-indexed to 1-indexed
          if (hole > 18) continue;
          upserts.push({
            pga_tournament_id: pgaTournamentId,
            player_id: playerId,
            round,
            hole,
            strokes,
            par: parMap[hole] ?? 4,
            updated_at: new Date().toISOString(),
          });
        }
      }
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
        .upsert(batch, { onConflict: 'pga_tournament_id,player_id,round,hole' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
      totalUpserted += batch.length;
    }

    await snapshotRostersIfNewRound(pgaTournamentId);

    return { playersMatched: matched, playersCreated: created, scoresUpserted: totalUpserted };
  },

  /**
   * espn — ESPN Golf scoreboard API
   *
   * URL format: https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=<espn_event_id>
   *
   * Response shape:
   *   events[0].competitions[0].competitors[].{
   *     athlete.fullName,
   *     linescores[].{ period: roundNum, linescores[].{ period: holeNum, value: strokes } }
   *   }
   */
  async espn(url, pgaTournamentId) {
    console.log(`Fetching: ${url}`);

    const data = await espnFetch(url);
    const event = (data.events || [])[0];
    if (!event) {
      console.log('No event data returned — tournament may not be active yet.');
      return { playersMatched: 0, playersCreated: 0, scoresUpserted: 0 };
    }

    const competitors = event.competitions?.[0]?.competitors || [];
    if (!competitors.length) {
      console.log('No competitors found in ESPN response yet.');
      return { playersMatched: 0, playersCreated: 0, scoresUpserted: 0 };
    }

    const [dbPlayers, parMap] = await Promise.all([loadPlayers(), loadHolePars(pgaTournamentId)]);
    const upserts = [];
    let matched = 0;
    let created = 0;

    for (const comp of competitors) {
      const fullName = comp.athlete?.fullName || comp.athlete?.displayName;
      if (!fullName) continue;

      let playerId = findPlayer(dbPlayers, fullName);
      if (!playerId) {
        playerId = await createPlayer(fullName);
        dbPlayers.push({ id: playerId, name: fullName });
        created++;
      } else {
        matched++;
      }

      // comp.linescores: one entry per round (period = round number 1–4)
      // each has linescores: one entry per hole (period = hole number 1–18, value = stroke count as string)
      for (const roundLs of comp.linescores || []) {
        const round = roundLs.period;
        if (!round || round < 1 || round > 4) continue;

        for (const holeLs of roundLs.linescores || []) {
          const hole = holeLs.period;
          const strokes = parseInt(holeLs.value, 10);
          if (!hole || hole < 1 || hole > 18 || isNaN(strokes) || strokes <= 0) continue;

          upserts.push({
            pga_tournament_id: pgaTournamentId,
            player_id: playerId,
            round,
            hole,
            strokes,
            par: parMap[hole] ?? 4,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    if (!upserts.length) {
      console.log('No hole scores available yet (round may not have started).');
      return { playersMatched: matched, playersCreated: created, scoresUpserted: 0 };
    }

    let totalUpserted = 0;
    for (let i = 0; i < upserts.length; i += 200) {
      const batch = upserts.slice(i, i + 200);
      const { error } = await supabase
        .from('scores')
        .upsert(batch, { onConflict: 'pga_tournament_id,player_id,round,hole' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
      totalUpserted += batch.length;
    }

    await snapshotRostersIfNewRound(pgaTournamentId);

    return { playersMatched: matched, playersCreated: created, scoresUpserted: totalUpserted };
  },

};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load all PGA tournaments that have sync enabled
  const { data: tournaments, error: tourErr } = await supabase
    .from('pga_tournaments')
    .select('id, name, sync_url, sync_format, sync_start_date, sync_end_date, sync_enabled')
    .eq('sync_enabled', true);

  if (tourErr) {
    console.error('Failed to load pga_tournaments:', tourErr.message);
    process.exit(1);
  }

  if (!tournaments || !tournaments.length) {
    console.log('No PGA tournaments have sync enabled. Nothing to do.');
    process.exit(0);
  }

  // Filter to those within their date window
  const active = tournaments.filter(t => isWithinRange(t.sync_start_date, t.sync_end_date));

  console.log(`Today: ${todayUTC()}`);
  console.log(`PGA tournaments with sync enabled : ${tournaments.length}`);
  console.log(`Within date window               : ${active.length}`);

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
