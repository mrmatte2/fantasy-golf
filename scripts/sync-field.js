/**
 * Field & Hole-Pars Importer
 *
 * Fetches the player field (and optionally hole pars) for a PGA Tour event
 * from the ESPN API and upserts them into Supabase.
 *
 * Usage:
 *   node scripts/sync-field.js <espn_event_id> <pga_tournament_id> [--hole-pars]
 *
 * Arguments:
 *   espn_event_id      ESPN numeric event ID  (e.g. 401811941 for Masters 2026)
 *   pga_tournament_id  UUID of the pga_tournaments row in your Supabase DB
 *   --hole-pars        Also import the 18-hole par/yardage data
 *
 * Examples:
 *   # Import field only
 *   node scripts/sync-field.js 401811941 824b51e6-4625-4ccb-bdec-44313896ca8f
 *
 *   # Import field + hole pars
 *   node scripts/sync-field.js 401811941 824b51e6-4625-4ccb-bdec-44313896ca8f --hole-pars
 *
 * How ESPN event IDs work:
 *   Run `node scripts/sync-field.js --list` to print all 2026 PGA Tour events
 *   with their ESPN IDs so you can find the one you need.
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

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
const ESPN_CORE_EVENT = id => `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${id}`;

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

// ─── List mode ────────────────────────────────────────────────────────────────

async function listEvents() {
  console.log('Fetching 2026 PGA Tour schedule from ESPN...\n');
  const data = await espnFetch(ESPN_SCOREBOARD);
  const calendar = data.leagues?.[0]?.calendar || [];

  console.log(`${'ESPN ID'.padEnd(15)} ${'Tournament'.padEnd(45)} Dates`);
  console.log('─'.repeat(90));
  for (const event of calendar) {
    const start = event.startDate ? event.startDate.slice(0, 10) : '?';
    const end   = event.endDate   ? event.endDate.slice(0, 10)   : '?';
    console.log(`${String(event.id).padEnd(15)} ${(event.label || event.name || '').padEnd(45)} ${start} → ${end}`);
  }
}

// ─── Field import ─────────────────────────────────────────────────────────────

async function fetchField(espnEventId) {
  // The scoreboard shows the current/most-recent event's full competitor list.
  // For events that are active or just finished, competitors will be populated.
  const data = await espnFetch(ESPN_SCOREBOARD);

  // Try to find the event in the active events list
  const event = (data.events || []).find(e => String(e.id) === String(espnEventId));

  if (event) {
    const competitors = event.competitions?.[0]?.competitors || [];
    return { name: event.name, competitors };
  }

  // Event not in current scoreboard — field not yet announced or event is old.
  // The calendar has the event metadata but no competitor list.
  const calEvent = (data.leagues?.[0]?.calendar || []).find(e => String(e.id) === String(espnEventId));
  const name = calEvent?.label || calEvent?.name || `ESPN event ${espnEventId}`;
  console.log(`  Note: "${name}" is not the current event on ESPN's scoreboard.`);
  console.log('  Field data is only available once the tournament week begins.');
  console.log('  Re-run this script when the event is live or has just finished.\n');
  return { name, competitors: [] };
}

// ─── Hole pars import ─────────────────────────────────────────────────────────

async function fetchHolePars(espnEventId) {
  const data = await espnFetch(ESPN_CORE_EVENT(espnEventId));
  const competition = data.competitions?.[0];
  if (!competition) return null;

  // Hole details live on each situation — try common paths
  // ESPN core API nests holes under competition.situation or venue
  const holes = [];

  // Try situation.holes (live events)
  const situationHoles = competition.situation?.holes;
  if (Array.isArray(situationHoles) && situationHoles.length) {
    for (const h of situationHoles) {
      holes.push({ hole: h.number ?? h.id, par: h.par, yards: h.yardage ?? h.yards ?? null });
    }
  }

  // Try venue.holes (pre-event / core API)
  if (!holes.length) {
    const venueHoles = data.venues?.[0]?.holes || data.venue?.holes;
    if (Array.isArray(venueHoles)) {
      for (const h of venueHoles) {
        holes.push({ hole: h.number ?? h.id, par: h.par, yards: h.yardage ?? h.yards ?? null });
      }
    }
  }

  // Fallback: look at competition.odds or any array of length 18
  if (!holes.length) {
    // Try raw competition fields
    for (const key of Object.keys(competition)) {
      const val = competition[key];
      if (Array.isArray(val) && val.length === 18 && val[0]?.par !== undefined) {
        for (let i = 0; i < val.length; i++) {
          holes.push({ hole: i + 1, par: val[i].par, yards: val[i].yards ?? null });
        }
        break;
      }
    }
  }

  if (!holes.length) return null;

  // Normalise: sort by hole number, ensure 1-18
  return holes
    .filter(h => h.hole >= 1 && h.hole <= 18 && h.par)
    .sort((a, b) => a.hole - b.hole);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // --list mode: just print the schedule
  if (args.includes('--list')) {
    await listEvents();
    return;
  }

  const importHolePars = args.includes('--hole-pars');
  const positional = args.filter(a => !a.startsWith('--'));
  const [espnEventId, pgaTournamentId] = positional;

  if (!espnEventId || !pgaTournamentId) {
    console.error('Usage: node scripts/sync-field.js <espn_event_id> <pga_tournament_id> [--hole-pars]');
    console.error('       node scripts/sync-field.js --list   (show all ESPN event IDs)');
    process.exit(1);
  }

  // Verify PGA tournament exists in DB
  const { data: pgaTournament, error: ptErr } = await supabase
    .from('pga_tournaments')
    .select('id, name')
    .eq('id', pgaTournamentId)
    .single();

  if (ptErr || !pgaTournament) {
    console.error(`PGA tournament ${pgaTournamentId} not found in your database.`);
    process.exit(1);
  }

  console.log(`PGA tournament   : ${pgaTournament.name} (${pgaTournamentId})`);
  console.log(`ESPN event ID    : ${espnEventId}`);
  console.log(`Import hole pars : ${importHolePars ? 'yes' : 'no'}`);
  console.log('');

  // ── Field ────────────────────────────────────────────────────────────────

  console.log('Fetching field from ESPN...');
  const { name: espnName, competitors } = await fetchField(espnEventId);
  console.log(`ESPN event       : ${espnName}`);
  console.log(`Competitors found: ${competitors.length}`);

  if (competitors.length === 0) {
    if (!importHolePars) process.exit(0);
  } else {
    // Load existing players
    const { data: dbPlayers } = await supabase.from('players').select('id, name');

    let matched = 0;
    let created = 0;
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

        if (error) {
          console.warn(`  ⚠ Could not create "${fullName}": ${error.message}`);
          continue;
        }

        dbPlayers.push(newPlayer);
        player = newPlayer;
        created++;
        console.log(`  + Created player: ${fullName}`);
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

    console.log('');
    console.log(`  Players matched : ${matched}`);
    console.log(`  Players created : ${created}`);
    console.log(`  Field entries   : ${fieldRows.length}`);
  }

  // ── Hole pars ────────────────────────────────────────────────────────────

  if (importHolePars) {
    console.log('\nFetching hole pars from ESPN...');
    let holes = null;
    try {
      holes = await fetchHolePars(espnEventId);
    } catch (err) {
      console.warn(`  Could not fetch hole pars: ${err.message}`);
    }

    if (!holes || holes.length === 0) {
      console.log('  No hole par data found in ESPN response.');
      console.log('  You can enter pars manually in Admin → PGA Events → Hole Pars.');
    } else {
      const parRows = holes.map(h => ({ pga_tournament_id: pgaTournamentId, hole: h.hole, par: h.par, yards: h.yards ?? null }));
      const { error } = await supabase
        .from('pga_hole_pars')
        .upsert(parRows, { onConflict: 'pga_tournament_id,hole' });
      if (error) throw new Error(`Hole pars upsert failed: ${error.message}`);
      console.log(`  Hole pars imported: ${parRows.length} holes`);
      parRows.forEach(h => console.log(`    Hole ${String(h.hole).padStart(2)}: par ${h.par}${h.yards ? `  (${h.yards}y)` : ''}`));
    }
  }

  console.log('\n── Done ─────────────────────────────────────────────────────');
}

main().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
