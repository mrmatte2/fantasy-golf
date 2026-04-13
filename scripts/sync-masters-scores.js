// Fetches live scores from masters.com and upserts into Supabase.
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, TOURNAMENT_ID

const { createClient } = require('@supabase/supabase-js');

const MASTERS_URL = 'https://www.masters.com/en_US/scores/feeds/2026/scores.json';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service role key — bypasses RLS
);

async function main() {
  const TOURNAMENT_ID = process.env.TOURNAMENT_ID;
  if (!TOURNAMENT_ID) throw new Error('TOURNAMENT_ID env var is required');

  // 1. Load hole pars (hole → par number)
  const { data: pars, error: parsError } = await supabase.from('hole_pars').select('hole, par');
  if (parsError) throw new Error(`hole_pars query failed: ${parsError.message}`);
  if (!pars?.length) throw new Error('hole_pars table is empty — check SUPABASE_URL and SUPABASE_SERVICE_KEY secrets');
  const parMap = Object.fromEntries(pars.map(p => [p.hole, p.par]));
  console.log(`Loaded ${pars.length} hole pars`);

  // 2. Load our players for name matching
  const { data: players, error: playersError } = await supabase.from('players').select('id, name, masters_id');
  if (playersError) throw new Error(`players query failed: ${playersError.message}`);
  if (!players?.length) throw new Error('No players found in DB');
  const byMastersId = Object.fromEntries(players.filter(p => p.masters_id).map(p => [p.masters_id, p.id]));
  const byName     = Object.fromEntries(players.map(p => [p.name.toLowerCase().trim(), p.id]));
  console.log(`Loaded ${players.length} players from DB`);

  // 3. Fetch live Masters leaderboard
  const res = await fetch(MASTERS_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.masters.com/en_US/scores/index.html',
    },
  });
  if (!res.ok) throw new Error(`masters.com returned HTTP ${res.status}`);
  const raw = await res.json();
  console.log('masters.com top-level keys:', Object.keys(raw));
  const masterPlayers = raw.player || raw.players || raw.data?.player || raw.leaderboard?.player || [];
  console.log(`Found ${masterPlayers.length} players in Masters feed`);

  // 4. Build upsert rows
  const upserts = [];
  const created = [];

  for (const mp of masterPlayers) {
    let playerId = byMastersId[mp.id] || byName[mp.full_name?.toLowerCase().trim()];

    // Auto-create player if not in DB
    if (!playerId) {
      const { data: newPlayer, error: createError } = await supabase
        .from('players')
        .insert({
          name: mp.full_name,
          country: mp.countryName || null,
          masters_id: String(mp.id),
          is_active: true,
          made_cut: mp.active === true || (mp.status !== 'C' && mp.status !== 'WD'),
          is_withdrawn: mp.status === 'WD',
        })
        .select('id')
        .single();

      if (createError) { console.warn(`Could not create player ${mp.full_name}: ${createError.message}`); continue; }
      playerId = newPlayer.id;
      byName[mp.full_name.toLowerCase().trim()] = playerId; // cache for deduplication
      created.push(mp.full_name);
    }

    for (let round = 1; round <= 4; round++) {
      const roundData = mp[`round${round}`];
      if (!roundData || roundData.roundStatus === 'Pre') continue;

      (roundData.scores || []).forEach((strokes, i) => {
        if (!strokes) return; // 0 = hole not played yet
        const hole = i + 1;  // scores[] is 0-indexed, holes are 1-indexed
        upserts.push({ tournament_id: TOURNAMENT_ID, player_id: playerId, round, hole, strokes, par: parMap[hole] });
      });
    }
  }

  if (created.length) console.log(`Created ${created.length} new players: ${created.join(', ')}`);

  // 5. Upsert into scores table
  if (upserts.length) {
    const { error } = await supabase.from('scores').upsert(upserts, { onConflict: 'tournament_id,player_id,round,hole' });
    if (error) throw error;
    console.log(`✓ Upserted ${upserts.length} hole scores`);
  } else {
    console.log('No scores to upsert yet.');
  }
}

main().catch(err => { console.error('Sync failed:', err.message); process.exit(1); });
