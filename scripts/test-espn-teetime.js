'use strict';

/**
 * Probe the ESPN golf scoreboard response to see what tee-time fields exist.
 *
 * Usage:
 *   node scripts/test-espn-teetime.js                        # active event
 *   node scripts/test-espn-teetime.js <espn_event_id>        # specific event
 */

const eventId = process.argv[2] || null;
const url = eventId
  ? `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${eventId}`
  : 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

async function run() {
  console.log(`Fetching: ${url}\n`);

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept': 'application/json, */*',
    },
  });

  if (!resp.ok) {
    console.error(`HTTP ${resp.status}`);
    process.exit(1);
  }

  const data = await resp.json();
  const event = (data.events || [])[0];

  if (!event) {
    console.log('No active event found in response.');
    console.log('Top-level keys:', Object.keys(data));
    process.exit(0);
  }

  console.log('Event:', event.name, `(id: ${event.id})`);

  const comp = event.competitions?.[0]?.competitors?.[0];
  if (!comp) {
    console.log('No competitors in response yet.');
    process.exit(0);
  }

  console.log('\n── First competitor top-level keys ─────────────────');
  console.log(Object.keys(comp));

  console.log('\n── athlete keys ─────────────────────────────────────');
  console.log(Object.keys(comp.athlete || {}));

  // Print tee-time candidates
  const teeCandidates = ['teeTime', 'teeTimeEpoch', 'startTime', 'status'];
  console.log('\n── Tee-time field values ────────────────────────────');
  for (const key of teeCandidates) {
    if (key in comp) {
      console.log(`  comp.${key}:`, JSON.stringify(comp[key], null, 2));
    } else {
      console.log(`  comp.${key}: (not present)`);
    }
  }

  // Also check status sub-object if it exists
  if (comp.status && typeof comp.status === 'object') {
    console.log('\n── comp.status keys ─────────────────────────────────');
    console.log(Object.keys(comp.status));
    if ('teeTime' in comp.status) {
      console.log('  comp.status.teeTime:', comp.status.teeTime);
    }
  }

  // Print a sample of competitors with their tee times (first 5)
  const competitors = event.competitions?.[0]?.competitors || [];
  console.log(`\n── Tee times for first 5 of ${competitors.length} competitors ──`);
  for (const c of competitors.slice(0, 5)) {
    const name = c.athlete?.fullName || c.athlete?.displayName || '?';
    const teeTime = c.teeTime ?? c.status?.teeTime ?? '(no teeTime field)';
    console.log(`  ${name.padEnd(30)} teeTime: ${teeTime}`);
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
