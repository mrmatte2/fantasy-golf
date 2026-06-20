// Changelog entries — shown in the "What's New" modal.
// public: true  → shown to users in the modal
// public: false → internal record only, never rendered

export const CHANGELOG = [
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
        text: "Teams that can't field 4 starters after the cut are now marked DQ instead of DNF.",
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
export const LATEST_VERSION = '2026-06-20';
