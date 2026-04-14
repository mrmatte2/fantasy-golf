// Fetches world rankings from OWGR and upserts into the players table.
// Run manually before each new tournament via GitHub Actions workflow_dispatch.
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const OWGR_URL = (page) =>
  `https://apiweb.owgr.com/api/owgr/rankings/getRankings?regionId=0&pageSize=100&pageNumber=${page}&countryId=0&sortString=Rank%20ASC`;

async function fetchPage(page) {
  const res = await fetch(OWGR_URL(page), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`OWGR returned HTTP ${res.status} for page ${page}`);
  const json = await res.json();
  return json.rankingsList || [];
}

async function main() {
  console.log('Fetching OWGR rankings (top 300)...');

  // Fetch pages 1-3 (300 players — covers any realistic tournament field)
  const pages = await Promise.all([fetchPage(1), fetchPage(2), fetchPage(3)]);
  const rankings = pages.flat();
  console.log(`Fetched ${rankings.length} ranked players from OWGR`);

  // Load existing players from DB for name matching
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, name, owgr_id');
  if (playersError) throw new Error(`players query failed: ${playersError.message}`);

  const byOwgrId = Object.fromEntries(players.filter(p => p.owgr_id).map(p => [p.owgr_id, p]));
  const byName   = Object.fromEntries(players.map(p => [p.name.toLowerCase().trim(), p]));

  let updated = 0;
  let created = 0;
  const unmatched = [];

  for (const entry of rankings) {
    const owgrId  = String(entry.player?.id);
    const fullName = entry.player?.fullName;
    const rank     = entry.rank;
    const country  = entry.player?.country?.name || null;

    if (!fullName) continue;

    // Find existing player
    const existing = byOwgrId[owgrId] || byName[fullName.toLowerCase().trim()];

    if (existing) {
      // Update world_ranking and set owgr_id if not already set
      await supabase.from('players').update({
        world_ranking: rank,
        owgr_id: owgrId,
        ...(country && !existing.country ? { country } : {}),
      }).eq('id', existing.id);
      updated++;
    } else {
      // Create new player
      const { error } = await supabase.from('players').insert({
        name: fullName,
        country,
        world_ranking: rank,
        owgr_id: owgrId,
        is_active: true,
      });
      if (error) {
        unmatched.push(`${fullName} (create failed: ${error.message})`);
      } else {
        created++;
      }
    }
  }

  if (unmatched.length) console.warn('⚠ Issues:', unmatched.join(', '));
  console.log(`✓ Updated ${updated} players, created ${created} new players from OWGR`);
}

main().catch(err => { console.error('OWGR sync failed:', err.message); process.exit(1); });
