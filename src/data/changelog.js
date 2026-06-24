// Changelog entries — shown in the "What's New" modal.
// public: true  → shown to users in the modal
// public: false → internal record only, never rendered

export const CHANGELOG = [
  {
    date: '2026-06-24',
    entries: [
      {
        public: true,
        label: 'New rules for Round 3 & 4',
        text: "We're changing how the weekend rounds are scored — all 5 of your starters now count, good or bad. No more dropping your worst player on the weekend. This means every pick matters more and the leaderboard can shift more dramatically over the final two days.\n\nTo go with this, you now need a full team of 5 valid starters entering Round 3 or your team is DQ'd. To help you get there, we've added a 4th substitute slot and bumped the B-tier limit from 2 to 3, giving you a squad of 9 picks in total.\n\nA reminder that you still need at least one C-tier player in your starting lineup for Rounds 1 and 2.",
      },
      {
        public: true,
        label: 'Weekend scoring changed',
        text: 'All 5 starters count in R3 & R4 — no drop.',
      },
      {
        public: true,
        label: 'New DQ rule',
        text: 'You need 5 valid starters entering Round 3 (up from 4).',
      },
      {
        public: true,
        label: '4th sub slot',
        text: 'You can now draft 4 substitutes instead of 3.',
      },
      {
        public: true,
        label: 'B-tier limit increased',
        text: 'Pick up to 3 B-tier players across your squad (up from 2).',
      },
    ],
  },
  {
    date: '2026-06-20',
    entries: [
      {
        public: true,
        label: 'Smarter live scoring',
        text: 'While a round is in progress, any starter who hasn\'t teed off yet is automatically treated as your drop score. Once all 5 starters are on the course, your worst scorer is dropped as usual.',
      },
      {
        public: true,
        label: 'Withdrawal (WD) support',
        text: 'Players who withdraw from a tournament now show a WD badge on your team page and are automatically replaced by your next available sub in order — no manual action needed.',
      },
      {
        public: true,
        label: 'Cleaner status labels',
        text: "Teams that can't field 5 starters after the cut are now marked DQ instead of DNF.",
      },
      {
        public: false,
        label: 'Cut detection fix',
        text: 'Removed a fallback that could incorrectly mark unresolved players as having made the cut if the ESPN feed was slow and R3 had already started.',
      },
      {
        public: false,
        label: 'Duffduffduff roster fix',
        text: 'Harris English (missed cut) swapped to sub, Justin Rose moved in as R3 starter.',
      },
    ],
  },
];

// Bump this whenever a new public entry is added — drives the "unseen" dot in the nav.
export const LATEST_VERSION = '2026-06-24';
