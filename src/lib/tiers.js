export const TIER_LIMITS = { S: 1, A: 2, B: 3, C: Infinity };

export function getTier(worldRanking) {
  if (!worldRanking || worldRanking > 40) return 'C';
  if (worldRanking <= 3) return 'S';
  if (worldRanking <= 15) return 'A';
  return 'B';
}

export const TIER_META = {
  S: { label: 'S Tier', range: 'World Ranking 1–3',   limit: 'Pick 1',        color: 'text-yellow-400',  bg: 'bg-yellow-400/10 border-yellow-400/30' },
  A: { label: 'A Tier', range: 'World Ranking 4–15',  limit: 'Pick up to 2',  color: 'text-masters-gold', bg: 'bg-masters-gold/10 border-masters-gold/30' },
  B: { label: 'B Tier', range: 'World Ranking 16–40', limit: 'Pick up to 3',  color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/30' },
  C: { label: 'C Tier', range: 'World Ranking 41+',   limit: 'Unlimited',     color: 'text-white/50',    bg: 'bg-white/5 border-white/10' },
};
