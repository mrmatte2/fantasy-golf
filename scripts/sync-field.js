/**
 * Field & Schedule Importer
 *
 * Fetches PGA Tour event data from the ESPN API and upserts into Supabase.
 * Handles three modes:
 *
 *   --list
 *       Print all ESPN event IDs and names for the current season.
 *
 *   --sync-all
 *       Create any missing pga_tournaments rows for all ESPN events,
 *       import hole pars where available, and import the field for
 *       whichever event is currently active on ESPN.
 *       Re-running is safe — already-existing records are skipped or updated.
 *
 *   <espn_event_id> <pga_tournament_id> [--hole-pars]
 *       Import the field (and optionally hole pars) for one specific event.
 *       Useful when you already have the pga_tournaments row and just need
 *       to fill in the field or pars.
 *
 * Required env vars (same as sync-scores.js):
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

const ESPN_SCOREBOARD  = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
const ESPN_CORE_EVENT  = id => `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${id}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normName(n) {
  return (n || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

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

// Run promises in batches to avoid hammering ESPN with 44 simultaneous requests
async function batchAll(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── ESPN data fetchers ───────────────────────────────────────────────────────

async function fetchScoreboard() {
  return espnFetch(ESPN_SCOREBOARD);
}

// Returns { venue, year, holePars } from ESPN's core event API
async function fetchCoreEventData(espnEventId) {
  try {
    const data = await espnFetch(ESPN_CORE_EVENT(espnEventId));
    const startDate = data.date || data.competitions?.[0]?.date || '';
    const year = startDate ? new Date(startDate).getFullYear() : null;
    const venue = data.venues?.[0]?.fullName || data.venues?.[0]?.name || null;
    const competition = data.competitions?.[0];

    // Extract hole pars — ESPN stores them on the competition or venue object
    const holes = parseHolePars(data, competition);

    return { venue, year, holes };
  } catch {
    return { venue: null, year: null, holes: [] };
  }
}

function parseHolePars(data, competition) {
  const candidates = [
    competition?.situation?.holes,
    data.venues?.[0]?.holes,
    data.venue?.holes,
  ];

  for (const list of candidates) {
    if (Array.isArray(list) && list.length > 0 && list[0]?.par !== undefined) {
      return list
        .map(h => ({ hole: h.number ?? h.id, par: h.par, yards: h.yardage ?? h.yards ?? null }))
        .filter(h => h.hole >= 1 && h.hole <= 18 && h.par)
        .sort((a, b) => a.hole - b.hole);
    }
  }

  // Last resort: any 18-element array with par fields on the competition
  if (competition) {
    for (const val of Object.values(competition)) {
      if (Array.isArray(val) && val.length === 18 && val[0]?.par !== undefined) {
        return val.map((h, i) => ({ hole: i + 1, par: h.par, yards: h.yards ?? null }));
      }
    }
  }

  return [];
}

// ─── Shared: upsert field players ─────────────────────────────────────────────

async function upsertField(pgaTournamentId, competitors) {
  if (!competitors.length) return { matched: 0, created: 0, total: 0 };

  const { data: dbPlayers } = await supabase.from('players').select('id, name');
  let matched = 0, created = 0;
  const fieldRows = [];

  for (const comp of competitors) {
    const fullName = comp.athlete?.fullName || comp.athlete?.displayName;
    if (!fullName) continue;

    let player = dbPlayers.find(p => normName(p.name) === normName(fullName));

    if (!player) {
      const country = comp.athlete?.flag?.alt || null;
      const { data: newPlayer, error } = await supabase
        .from('players')
        .insert({ name: fullName, country, is_active: true, made_cut: true })
        .select('id, name')
        .single();
      if (error) { console.warn(`  ⚠ Could not create "${fullName}": ${error.message}`); continue; }
      dbPlayers.push(newPlayer);
      player = newPlayer;
      created++;
    } else {
      matched++;
    }

    fieldRows.push({ pga_tournament_id: pgaTournamentId, player_id: player.id, is_in_field: true });
  }

  if (fieldRows.length) {
    const { error } = await supabase
      .from('pga_tournament_players')
      .upsert(fieldRows, { onConflict: 'pga_tournament_id,player_id' });
    if (error) throw new Error(`Field upsert failed: ${error.message}`);
  }

  return { matched, created, total: fieldRows.length };
}

// ─── Shared: upsert hole pars ──────────────────────────────────────────────────

async function upsertHolePars(pgaTournamentId, holes) {
  if (!holes.length) return 0;
  const parRows = holes.map(h => ({
    pga_tournament_id: pgaTournamentId,
    hole: h.hole, par: h.par, yards: h.yards ?? null,
  }));
  const { error } = await supabase
    .from('pga_hole_pars')
    .upsert(parRows, { onConflict: 'pga_tournament_id,hole' });
  if (error) throw new Error(`Hole pars upsert failed: ${error.message}`);
  return parRows.length;
}

// ─── Mode: --list ─────────────────────────────────────────────────────────────

async function listEvents() {
  console.log('Fetching 2026 PGA Tour schedule from ESPN...\n');
  const data = await fetchScoreboard();
  const calendar = data.leagues?.[0]?.calendar || [];
  console.log(`${'ESPN ID'.padEnd(15)} ${'Tournament'.padEnd(48)} Dates`);
  console.log('─'.repeat(85));
  for (const e of calendar) {
    const start = e.startDate?.slice(0, 10) ?? '?';
    const end   = e.endDate?.slice(0, 10)   ?? '?';
    console.log(`${String(e.id).padEnd(15)} ${(e.label || e.name || '').padEnd(48)} ${start} → ${end}`);
  }
  console.log(`\nTotal: ${calendar.length} events`);
}

// ─── Mode: --sync-all ─────────────────────────────────────────────────────────

async function syncAll() {
  console.log('Fetching ESPN schedule...');
  const scoreboard = await fetchScoreboard();
  const calendar   = scoreboard.leagues?.[0]?.calendar || [];
  const activeEvents = scoreboard.events || []; // events with live/completed competitor data

  // Build a map of active event competitors keyed by ESPN event ID
  const activeFieldMap = {};
  for (const ev of activeEvents) {
    const competitors = ev.competitions?.[0]?.competitors || [];
    if (competitors.length) activeFieldMap[String(ev.id)] = { name: ev.name, competitors };
  }

  console.log(`ESPN events found : ${calendar.length}`);
  console.log(`Events with field : ${Object.keys(activeFieldMap).length}`);
  console.log('');

  // Load existing pga_tournaments so we can detect what's already in the DB
  const { data: existingTournaments } = await supabase
    .from('pga_tournaments')
    .select('id, name, espn_event_id');

  const byEspnId   = Object.fromEntries((existingTournaments || []).filter(t => t.espn_event_id).map(t => [t.espn_event_id, t]));

  let created = 0, skipped = 0, parsImported = 0, fieldImported = 0;

  // Fetch core API data for all events in batches of 6
  console.log('Fetching event details from ESPN (course + hole pars)...');
  const coreData = await batchAll(calendar, 6, async e => {
    const d = await fetchCoreEventData(String(e.id));
    return { espnId: String(e.id), label: e.label || e.name, startDate: e.startDate, endDate: e.endDate, ...d };
  });
  console.log('Done.\n');

  for (const ev of coreData) {
    const espnId   = ev.espnId;
    const name     = ev.label;
    const year     = ev.year || (ev.startDate ? new Date(ev.startDate).getFullYear() : null);
    const existing = byEspnId[espnId];

    let pgaTournamentId;

    if (existing) {
      pgaTournamentId = existing.id;
      skipped++;
      process.stdout.write(`  ─ ${name} (exists)\n`);
    } else {
      // Create new pga_tournaments row
      const { data: newT, error } = await supabase
        .from('pga_tournaments')
        .insert({
          name,
          course: ev.venue || null,
          year: year || null,
          espn_event_id: espnId,
          sync_enabled: false, // admin enables sync manually when ready
        })
        .select('id')
        .single();

      if (error) {
        console.warn(`  ⚠ Could not create "${name}": ${error.message}`);
        continue;
      }

      pgaTournamentId = newT.id;
      created++;
      process.stdout.write(`  + Created: ${name}${ev.venue ? ` @ ${ev.venue}` : ''}\n`);
    }

    // Import hole pars if ESPN returned them
    if (ev.holes?.length > 0) {
      const count = await upsertHolePars(pgaTournamentId, ev.holes);
      if (count) {
        parsImported += count;
        process.stdout.write(`    ↳ Hole pars: ${count} holes imported\n`);
      }
    }

    // Import field if this event is active on ESPN
    if (activeFieldMap[espnId]) {
      const { matched, created: fc, total } = await upsertField(pgaTournamentId, activeFieldMap[espnId].competitors);
      if (total) {
        fieldImported += total;
        process.stdout.write(`    ↳ Field: ${total} players (${matched} matched, ${fc} created)\n`);
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log(`  Events created   : ${created}`);
  console.log(`  Events skipped   : ${skipped} (already in DB)`);
  console.log(`  Hole pars saved  : ${parsImported}`);
  console.log(`  Field entries    : ${fieldImported}`);
  console.log('─────────────────────────────────────────────────────────────');
}

// ─── Mode: single event ───────────────────────────────────────────────────────

async function syncSingleEvent(espnEventId, pgaTournamentId, importHolePars) {
  const { data: pgaTournament, error: ptErr } = await supabase
    .from('pga_tournaments')
    .select('id, name')
    .eq('id', pgaTournamentId)
    .single();

  if (ptErr || !pgaTournament) {
    console.error(`PGA tournament ${pgaTournamentId} not found in database.`);
    process.exit(1);
  }

  console.log(`PGA tournament   : ${pgaTournament.name}`);
  console.log(`ESPN event ID    : ${espnEventId}`);
  console.log('');

  // Field
  console.log('Fetching field from ESPN...');
  const scoreboard = await fetchScoreboard();
  const event = (scoreboard.events || []).find(e => String(e.id) === String(espnEventId));

  if (!event) {
    const calEvent = (scoreboard.leagues?.[0]?.calendar || []).find(e => String(e.id) === String(espnEventId));
    const name = calEvent?.label || calEvent?.name || espnEventId;
    console.log(`  "${name}" is not the active event on ESPN — field not available yet.`);
    console.log('  Re-run when the tournament week begins.');
  } else {
    const competitors = event.competitions?.[0]?.competitors || [];
    console.log(`  Competitors found: ${competitors.length}`);
    if (competitors.length) {
      const { matched, created, total } = await upsertField(pgaTournamentId, competitors);
      console.log(`  Players matched : ${matched}`);
      console.log(`  Players created : ${created}`);
      console.log(`  Field entries   : ${total}`);
    }
  }

  // Hole pars
  if (importHolePars) {
    console.log('\nFetching hole pars from ESPN...');
    const { holes } = await fetchCoreEventData(espnEventId);
    if (!holes.length) {
      console.log('  No hole par data found. Enter pars manually in Admin → PGA Events.');
    } else {
      const count = await upsertHolePars(pgaTournamentId, holes);
      console.log(`  Hole pars imported: ${count} holes`);
      holes.forEach(h => console.log(`    Hole ${String(h.hole).padStart(2)}: par ${h.par}${h.yards ? `  (${h.yards}y)` : ''}`));
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    await listEvents();
    return;
  }

  if (args.includes('--sync-all')) {
    await syncAll();
    return;
  }

  const importHolePars = args.includes('--hole-pars');
  const positional = args.filter(a => !a.startsWith('--'));
  const [espnEventId, pgaTournamentId] = positional;

  if (!espnEventId || !pgaTournamentId) {
    console.log('Usage:');
    console.log('  node scripts/sync-field.js --list                            List all ESPN event IDs');
    console.log('  node scripts/sync-field.js --sync-all                        Sync all events to DB');
    console.log('  node scripts/sync-field.js <espn_id> <pga_id>               Import field for one event');
    console.log('  node scripts/sync-field.js <espn_id> <pga_id> --hole-pars   Field + hole pars');
    process.exit(1);
  }

  await syncSingleEvent(espnEventId, pgaTournamentId, importHolePars);
  console.log('\n── Done ─────────────────────────────────────────────────────');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
