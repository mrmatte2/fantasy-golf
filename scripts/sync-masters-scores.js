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
  const { data: pars } = await supabase.from('hole_pars').select('hole, par');
  const parMap = Object.fromEntries(pars.map(p => [p.hole, p.par]));

  // 2. Load our players for name matching
  const { data: players } = await supabase.from('players').select('id, name, masters_id');
  const byMastersId = Object.fromEntries(players.filter(p => p.masters_id).map(p => [p.masters_id, p.id]));
  const byName     = Object.fromEntries(players.map(p => [p.name.toLowerCase().trim(), p.id]));

  // 3. Fetch live Masters leaderboard
  const res = await fetch(MASTERS_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.masters.com/en_US/scores/index.html',
    },
  });
  if (!res.ok) throw new Error(`masters.com returned HTTP ${res.status}`);
  const { player: masterPlayers = [] } = await res.json();

  // 4. Build upsert rows
  const upserts = [];
  const unmatched = [];

  for (const mp of masterPlayers) {
    const playerId = byMastersId[mp.id] || byName[mp.full_name?.toLowerCase().trim()];
    if (!playerId) { unmatched.push(mp.full_name); continue; }

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

  if (unmatched.length) console.warn('⚠ Unmatched players:', unmatched.join(', '));

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
