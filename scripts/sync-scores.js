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
  const { data, error } = await supabase
    .from('pga_hole_pars')
    .select('hole, par')
    .eq('pga_tournament_id', pgaTournamentId)
    .order('hole');
  if (error) throw new Error(`Failed to load pga_hole_pars: ${error.message}`);
  const map = {};
  for (const row of data || []) map[row.hole] = row.par;
  return map;
}

async function loadPlayers() {
  const { data, error } = await supabase.from('players').select('id, name');
  if (error) throw new Error(`Failed to load players: ${error.message}`);
  return data;
}

// Normalizes player names for comparison: lowercases, trims, collapses spaces,
// and strips diacritics so that e.g. "Åberg" and "Aberg" match correctly.
const normName = n => n.toLowerCase().trim()
  .replace(/\u00f8/g, 'o').replace(/\u00e6/g, 'ae').replace(/\u00e5/g, 'a')
  .replace(/\s+/g, ' ')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function findPlayer(players, name) {
  const target = normName(name);
  return players.find(p => normName(p.name) === target)?.id ?? null;
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

// ─── Auto-sub & DNF (runs before R2+ snapshots) ───────────────────────────────
// Replaces invalid starters (missed cut OR withdrawn) with available subs.
// If a team can't field 4 valid starters after auto-subbing, marks them DNF.
// WD is checked always; cut is only applied once cut_checked = true.

async function autoSubCutPlayers(pgaTournamentId) {
  const { data: pgaT } = await supabase
    .from('pga_tournaments')
    .select('cut_checked')
    .eq('id', pgaTournamentId)
    .single();

  // Build per-tournament player status map: player_id → { made_cut, is_withdrawn }
  const { data: ptpData } = await supabase
    .from('pga_tournament_players')
    .select('player_id, made_cut, is_withdrawn')
    .eq('pga_tournament_id', pgaTournamentId);
  const playerStatus = Object.fromEntries((ptpData || []).map(r => [r.player_id, r]));

  // A player is invalid if they've withdrawn (always) or missed the cut (once determined)
  const isInvalid = (r) => {
    const s = playerStatus[r.player_id];
    return s?.is_withdrawn === true || (pgaT?.cut_checked && s?.made_cut === false);
  };

  const { data: fantasyTournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('pga_tournament_id', pgaTournamentId);

  for (const ft of fantasyTournaments || []) {
    const { data: rosters } = await supabase
      .from('rosters')
      .select('id, user_id, player_id, slot_type, slot_number, players(name)')
      .eq('tournament_id', ft.id)
      .eq('is_active', true)
      .order('slot_number');

    // Group by user
    const byUser = {};
    for (const r of rosters || []) {
      if (!byUser[r.user_id]) byUser[r.user_id] = { starters: [], subs: [] };
      (r.slot_type === 'starter' ? byUser[r.user_id].starters : byUser[r.user_id].subs).push(r);
    }

    for (const [userId, { starters, subs }] of Object.entries(byUser)) {
      const cutStarters = starters.filter(isInvalid);
      if (!cutStarters.length) continue; // nothing to do for this user

      const availableSubs = subs
        .filter(r => !isInvalid(r))
        .sort((a, b) => a.slot_number - b.slot_number);

      const swapCount = Math.min(cutStarters.length, availableSubs.length);
      for (let i = 0; i < swapCount; i++) {
        const out = cutStarters[i];
        const inSub = availableSubs[i];
        await supabase.from('rosters')
          .update({ slot_type: 'sub', slot_number: inSub.slot_number })
          .eq('id', out.id);
        await supabase.from('rosters')
          .update({ slot_type: 'starter', slot_number: out.slot_number })
          .eq('id', inSub.id);
        const reason = playerStatus[out.player_id]?.is_withdrawn ? 'WD' : 'CUT';
        console.log(`  Auto-sub [${reason}]: ${out.players?.name} ← ${inSub.players?.name} (slot ${out.slot_number})`);
      }

      // DNF check: valid starters = original valid starters + newly swapped-in subs
      const validStarters = starters.filter(r => !isInvalid(r)).length + swapCount;
      if (validStarters < 4) {
        await supabase.from('tournament_memberships')
          .update({ is_dnf: true })
          .eq('tournament_id', ft.id)
          .eq('user_id', userId);
        console.log(`  DNF: user ${userId} — only ${validStarters} valid starters after auto-sub`);
      }
    }
  }
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
      // Before snapshotting R2+, auto-sub any invalid starters (WD or missed cut)
      // that the user hasn't manually resolved. Idempotent — no-op if already clean.
      if (round >= 2) await autoSubCutPlayers(pgaTournamentId);

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

      // Lock the fantasy tournament when R1 scores first arrive so players
      // can no longer edit their draft. Subsequent rounds use the sub system.
      if (round === 1) {
        await supabase
          .from('tournaments')
          .update({ is_locked: true, draft_open: false })
          .eq('id', ft.id)
          .eq('is_locked', false); // no-op if already locked
        console.log(`  Locked fantasy tournament ${ft.id} (R1 scores received)`);
      }
    }
  }
}

// ─── Cut status ───────────────────────────────────────────────────────────────
// Runs once per tournament, after R2 is fully complete and before R3 begins.
// Fetches the ESPN per-player status endpoint for each rostered player and
// writes made_cut = true/false to pga_tournament_players.
//
// Trigger conditions (all must be true):
//   1. cut_checked = false on pga_tournaments
//   2. Scores exist for round 2
//   3. No scores yet for round 3
//   4. ≥ 85% of players with any R2 data have all 18 holes (round is complete)
//
// Only sets cut_checked = true once at least 1 cut player is confirmed by ESPN,
// so mid-R2 runs where everyone is still "in progress" will safely retry.

async function updateCutStatus(pgaTournamentId, espnEventId, competitorMap) {
  // 1. Already done?
  const { data: pgaT } = await supabase
    .from('pga_tournaments')
    .select('cut_checked')
    .eq('id', pgaTournamentId)
    .single();
  if (pgaT?.cut_checked) return;

  // 2. R2 exists?
  const { data: r2Sample } = await supabase
    .from('scores')
    .select('player_id')
    .eq('pga_tournament_id', pgaTournamentId)
    .eq('round', 2)
    .limit(1);
  if (!r2Sample?.length) {
    console.log('  Cut check: no R2 scores yet — skipping.');
    return;
  }

  // 3. Is R2 ≥ 85% complete?
  // Note: we intentionally do NOT gate on "R3 not started" — STATUS_CUT is permanent
  // and the ESPN status endpoint is reliable at any point after the cut is made.
  // Removing that guard means the cut check can recover even if it missed the
  // R2→R3 window (e.g. sync was down overnight).
  const { data: r2Rows } = await supabase
    .from('scores')
    .select('player_id')
    .eq('pga_tournament_id', pgaTournamentId)
    .eq('round', 2)
    .limit(5000);

  const holeCountByPlayer = {};
  for (const row of r2Rows || []) {
    holeCountByPlayer[row.player_id] = (holeCountByPlayer[row.player_id] || 0) + 1;
  }
  const totalR2Players = Object.keys(holeCountByPlayer).length;
  const complete18 = Object.values(holeCountByPlayer).filter(c => c >= 18).length;
  const ratio = totalR2Players > 0 ? complete18 / totalR2Players : 0;

  if (ratio < 0.85) {
    console.log(`  Cut check: R2 ${Math.round(ratio * 100)}% complete (${complete18}/${totalR2Players} with 18 holes) — not ready yet.`);
    return;
  }

  console.log(`  Cut check: R2 ${Math.round(ratio * 100)}% complete — running cut detection.`);

  // 4. Collect unique rostered players across all fantasy tournaments linked to this PGA event
  const { data: fantasyTournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('pga_tournament_id', pgaTournamentId);

  const ftIds = (fantasyTournaments || []).map(ft => ft.id);
  if (!ftIds.length) { console.log('  Cut check: no linked fantasy tournaments.'); return; }

  const { data: rosterRows } = await supabase
    .from('rosters')
    .select('player_id, players(name)')
    .in('tournament_id', ftIds)
    .eq('is_active', true);

  // Deduplicate by player_id
  const rosteredPlayers = [...new Map(
    (rosterRows || []).map(r => [r.player_id, r.players?.name])
  ).entries()].map(([id, name]) => ({ id, name }));

  if (!rosteredPlayers.length) { console.log('  Cut check: no rostered players found.'); return; }

  // 5. Fetch ESPN status for each rostered player
  // Status URL: sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/{eventId}/competitions/{eventId}/competitors/{competitorId}/status
  let cutFound = 0;
  const updates = [];

  for (const rp of rosteredPlayers) {
    const espnComp = competitorMap.get(normName(rp.name));
    if (!espnComp) {
      console.log(`  Cut check: no ESPN match for "${rp.name}" — skipping.`);
      continue;
    }

    const statusUrl = `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${espnEventId}/competitions/${espnEventId}/competitors/${espnComp.id}/status`;
    try {
      const statusData = await espnFetch(statusUrl);
      const typeName = statusData?.type?.name;
      const madeCut = typeName !== 'STATUS_CUT';
      updates.push({ player_id: rp.id, made_cut: madeCut });
      if (!madeCut) cutFound++;
      console.log(`  ${rp.name}: ${typeName} → made_cut=${madeCut}`);
    } catch (e) {
      console.warn(`  Cut status fetch failed for "${rp.name}": ${e.message}`);
    }
  }

  if (!updates.length) {
    console.log('  Cut check: could not fetch any player statuses — will retry next run.');
    return;
  }

  // 6. Write made_cut to pga_tournament_players
  for (const upd of updates) {
    await supabase
      .from('pga_tournament_players')
      .update({ made_cut: upd.made_cut })
      .eq('pga_tournament_id', pgaTournamentId)
      .eq('player_id', upd.player_id);
  }
  console.log(`  Cut check: ${cutFound} missed cut, ${updates.length - cutFound} made cut.`);

  // 7. Seal the flag only once ESPN has confirmed at least one cut player.
  //    If ESPN returns everyone as in-progress (mid-R2), we skip sealing so
  //    the next 15-min run retries automatically.
  if (cutFound > 0) {
    await supabase.from('pga_tournaments').update({ cut_checked: true }).eq('id', pgaTournamentId);
    console.log('  cut_checked = true — cut detection complete.');
  } else {
    console.log('  Cut check: no cut players confirmed by ESPN yet — will retry next run.');
  }
}

// ─── Tee times ────────────────────────────────────────────────────────────────
// Runs on every sync during an active tournament.
// Fetches the ESPN per-player status endpoint for each rostered player and
// upserts into pga_player_tee_times (pga_tournament_id, player_id, round).
// Rows are unique per tournament+player+round so all 4 rounds accumulate
// without overwriting each other.

async function syncTeeTimes(pgaTournamentId, espnEventId, competitorMap) {
  const { data: fantasyTournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('pga_tournament_id', pgaTournamentId);

  const ftIds = (fantasyTournaments || []).map(ft => ft.id);
  if (!ftIds.length) { console.log('  Tee times: no linked fantasy tournaments.'); return; }

  const { data: rosterRows } = await supabase
    .from('rosters')
    .select('player_id, players(name)')
    .in('tournament_id', ftIds)
    .eq('is_active', true);

  const rosteredPlayers = [...new Map(
    (rosterRows || []).map(r => [r.player_id, r.players?.name])
  ).entries()].map(([id, name]) => ({ id, name }));

  if (!rosteredPlayers.length) { console.log('  Tee times: no rostered players found.'); return; }

  const rows = [];
  for (const rp of rosteredPlayers) {
    const espnComp = competitorMap.get(normName(rp.name));
    if (!espnComp) continue;

    const statusUrl = `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${espnEventId}/competitions/${espnEventId}/competitors/${espnComp.id}/status`;
    try {
      const statusData = await espnFetch(statusUrl);
      const teeTimeUtc = statusData?.teeTime ?? null;
      const round = statusData?.period ?? null;
      if (!teeTimeUtc || !round) continue;

      rows.push({ pga_tournament_id: pgaTournamentId, player_id: rp.id, round, tee_time_utc: teeTimeUtc });
      console.log(`  Tee time: ${rp.name} — R${round} @ ${teeTimeUtc}`);
    } catch (e) {
      console.warn(`  Tee time fetch failed for "${rp.name}": ${e.message}`);
    }
  }

  if (rows.length) {
    const { error } = await supabase
      .from('pga_player_tee_times')
      .upsert(rows, { onConflict: 'pga_tournament_id,player_id,round' });
    if (error) console.warn(`  Tee times upsert failed: ${error.message}`);
    else console.log(`  Tee times: upserted ${rows.length} rows.`);
  } else {
    console.log('  Tee times: no tee times returned from ESPN yet.');
  }
}

// ─── Withdrawal sync ─────────────────────────────────────────────────────────
// Runs on every sync. Checks ESPN status for all rostered players and sets
// is_withdrawn = true on pga_tournament_players when ESPN returns displayValue "WD".
// Also clears the flag if a WD is reversed (re-entry edge case).

async function syncWithdrawals(pgaTournamentId, espnEventId, competitorMap) {
  const { data: fantasyTournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('pga_tournament_id', pgaTournamentId);

  const ftIds = (fantasyTournaments || []).map(ft => ft.id);
  if (!ftIds.length) return;

  const { data: rosterRows } = await supabase
    .from('rosters')
    .select('player_id, players(name)')
    .in('tournament_id', ftIds)
    .eq('is_active', true);

  const rosteredPlayers = [...new Map(
    (rosterRows || []).map(r => [r.player_id, r.players?.name])
  ).entries()].map(([id, name]) => ({ id, name }));

  if (!rosteredPlayers.length) return;

  let wdCount = 0;
  for (const rp of rosteredPlayers) {
    const espnComp = competitorMap.get(normName(rp.name));
    if (!espnComp) continue;

    const statusUrl = `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${espnEventId}/competitions/${espnEventId}/competitors/${espnComp.id}/status`;
    try {
      const statusData = await espnFetch(statusUrl);
      const isWD = statusData?.displayValue === 'WD' || statusData?.type?.shortDetail === 'WD';

      if (isWD) {
        await supabase
          .from('pga_tournament_players')
          .update({ is_withdrawn: true, made_cut: false })
          .eq('pga_tournament_id', pgaTournamentId)
          .eq('player_id', rp.id)
          .eq('is_withdrawn', false); // only write if not already set
        wdCount++;
        console.log(`  WD detected: ${rp.name}`);
      }
    } catch (e) {
      console.warn(`  WD check failed for "${rp.name}": ${e.message}`);
    }
  }
  if (wdCount > 0) console.log(`  Withdrawal sync: ${wdCount} new withdrawal(s)`);
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

    const espnEventId = event.id;
    const competitors = event.competitions?.[0]?.competitors || [];
    if (!competitors.length) {
      console.log('No competitors found in ESPN response yet.');
      return { playersMatched: 0, playersCreated: 0, scoresUpserted: 0 };
    }

    // Build name → ESPN competitor map for cut status detection
    const competitorMap = new Map();
    for (const comp of competitors) {
      const name = comp.athlete?.fullName || comp.athlete?.displayName;
      if (name && comp.id) competitorMap.set(normName(name), { id: comp.id });
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
    await syncWithdrawals(pgaTournamentId, espnEventId, competitorMap);
    await updateCutStatus(pgaTournamentId, espnEventId, competitorMap);
    await syncTeeTimes(pgaTournamentId, espnEventId, competitorMap);

    return { playersMatched: matched, playersCreated: created, scoresUpserted: totalUpserted };
  },

};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load all PGA tournaments that have sync enabled
  const { data: tournaments, error: tourErr } = await supabase
    .from('pga_tournaments')
    .select('id, name, sync_url, sync_format, sync_start_date, sync_end_date')
    .not('sync_url', 'is', null);

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
