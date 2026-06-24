import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournament } from '../hooks/useTournament';
import {
  getTournamentPlayers,
  getUserRoster, addToRoster, removeFromRoster,
  getUserMembership, joinTournament, getTournamentCutStatus,
} from '../lib/supabase';
import { getTier, TIER_LIMITS, TIER_META } from '../lib/tiers';
import { Search, Lock, Info, LogIn, KeyRound } from 'lucide-react';

const MAX_STARTERS = 5;
const MAX_SUBS = 4;
const TIER_ORDER = ['S', 'A', 'B', 'C'];

function TierBadge({ worldRanking }) {
  const tier = getTier(worldRanking);
  const meta = TIER_META[tier];
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${meta.bg} ${meta.color}`}>
      {tier}
    </span>
  );
}

function PlayerCard({ player, rosterEntry, onAdd, onRemove, tierLimitReached, isLocked }) {
  const isStarter = rosterEntry?.slot_type === 'starter';
  const isSub = rosterEntry?.slot_type === 'sub';
  const inRoster = !!rosterEntry;

  return (
    <div className={`rounded-xl border transition-all duration-200 p-3 ${
      inRoster ? 'border-masters-gold/40 bg-masters-gold/8' : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/6'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-masters-cream text-sm">{player.name}</span>
            {player.is_withdrawn && <span className="badge-wd">WD</span>}
            {player.made_cut === false && !player.is_withdrawn && <span className="badge-cut">CUT</span>}
            {isStarter && <span className="badge-starter">Starter {rosterEntry?.slot_number}</span>}
            {isSub && <span className="badge-sub">Sub {rosterEntry?.slot_number}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-white/40 mt-0.5">
            <span>#{player.world_ranking} WR</span>
            <span>{player.country}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isLocked && (
            inRoster ? (
              <button onClick={() => onRemove(player)} className="btn-danger text-xs px-3 py-1">Remove</button>
            ) : (
              <button onClick={() => onAdd(player)} disabled={tierLimitReached}
                title={tierLimitReached ? 'Tier limit reached' : undefined}
                className="btn-secondary text-xs px-3 py-1 disabled:opacity-30">+ Add</button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function DraftPage() {
  const { id: tournamentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tournament } = useTournament(tournamentId);

  const [players, setPlayers] = useState([]);
  const [roster, setRoster] = useState([]);
  const [membership, setMembership] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hideCut, setHideCut] = useState(true);
  const [slotModal, setSlotModal] = useState(null);
  const [collapsedTiers, setCollapsedTiers] = useState({});

  // Join flow state
  const [joinTeamName, setJoinTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const pgaTournamentId = tournament?.pga_tournament_id ?? null;
  const isLocked = tournament?.is_locked || !tournament?.draft_open;
  const starters = roster.filter(r => r.slot_type === 'starter' && r.is_active);
  const subs = roster.filter(r => r.slot_type === 'sub' && r.is_active);

  // Tier usage across entire roster (starters + subs combined)
  const tierCounts = { S: 0, A: 0, B: 0, C: 0 };
  for (const r of [...starters, ...subs]) {
    tierCounts[getTier(r.players?.world_ranking)]++;
  }

  // Carry-over: unused picks from higher tiers cascade down
  const sUnused = Math.max(0, 1 - tierCounts.S);
  const aLimit  = 2 + sUnused;
  const aUnused = Math.max(0, aLimit - tierCounts.A);
  const bLimit  = 2 + aUnused;
  const effectiveLimits = { S: 1, A: aLimit, B: bLimit, C: Infinity };
  const carryOver = { S: 0, A: sUnused, B: aUnused, C: 0 };

  // C-tier starter warning
  const hasCtierStarter = starters.some(r => getTier(r.players?.world_ranking) === 'C');
  const showCtierWarning = starters.length === MAX_STARTERS && !hasCtierStarter;

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: pls }, { data: rst }, { data: mem }, cutStatus] = await Promise.all([
      getTournamentPlayers(tournamentId),
      getUserRoster(user.id, tournamentId),
      getUserMembership(tournamentId, user.id),
      getTournamentCutStatus(pgaTournamentId),
    ]);
    const playersWithCut = (pls || []).map(p => ({ ...p, made_cut: cutStatus[p.id] ?? null }));
    setPlayers(playersWithCut);
    setRoster(rst || []);
    setMembership(mem ?? null);
    setLoading(false);
  }, [user.id, tournamentId, pgaTournamentId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleJoin() {
    if (!joinTeamName.trim()) { setJoinError('Team name is required'); return; }
    setJoining(true);
    setJoinError('');
    const { error, data } = await joinTournament(
      tournamentId, user.id, joinTeamName.trim(),
      joinCode, tournament?.join_code
    );
    if (error) { setJoinError(error.message); setJoining(false); return; }
    setMembership(data);
    setJoining(false);
  }

  async function handleAdd(player, slotType) {
    if (slotType === 'starter' && starters.length >= MAX_STARTERS) {
      if (subs.length >= MAX_SUBS) { alert('Roster is full (5 starters + 3 subs)'); return; }
      setSlotModal(player); return;
    }
    const slotNumber = slotType === 'starter' ? starters.length + 1 : subs.length + 1;
    const { error } = await addToRoster(user.id, player.id, tournamentId, slotType, slotNumber);
    if (error) { alert(error.message); return; }
    await loadData();
  }

  async function handleSlotChoice(player, slotType) {
    setSlotModal(null);
    const slotNumber = slotType === 'starter' ? starters.length + 1 : subs.length + 1;
    const { error } = await addToRoster(user.id, player.id, tournamentId, slotType, slotNumber);
    if (error) { alert(error.message); return; }
    await loadData();
  }

  async function handleRemove(player) {
    const { error } = await removeFromRoster(user.id, player.id, tournamentId);
    if (error) { alert(error.message); return; }
    await loadData();
  }

  function toggleTier(tier) {
    setCollapsedTiers(prev => ({ ...prev, [tier]: !prev[tier] }));
  }

  if (loading || membership === undefined) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="card-dark">
          <LogIn size={28} className="mx-auto mb-3 text-masters-gold/60" />
          <h2 className="font-display font-bold text-masters-cream mb-2">Join to Draft</h2>
          <p className="text-white/40 text-sm mb-5">
            Choose a team name for <span className="text-white/60">{tournament?.name}</span> to start drafting.
          </p>
          <div className="text-left space-y-3 mb-4">
            {tournament?.join_code && (
              <div>
                <label className="label flex items-center gap-1.5"><KeyRound size={12} /> Join Code</label>
                <input value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
                  className="input font-mono tracking-widest" placeholder="Enter code" autoFocus />
              </div>
            )}
            <div>
              <label className="label">Team Name</label>
              <input value={joinTeamName} onChange={e => { setJoinTeamName(e.target.value); setJoinError(''); }}
                className="input" placeholder="e.g. Amen Corner FC"
                autoFocus={!tournament?.join_code}
                onKeyDown={e => e.key === 'Enter' && handleJoin()} />
            </div>
            {joinError && <p className="text-red-400 text-xs">{joinError}</p>}
          </div>
          <div className="flex gap-3">
            <button onClick={handleJoin} disabled={joining} className="btn-primary flex-1">
              {joining ? 'Joining…' : 'Join & Draft'}
            </button>
            <button onClick={() => navigate('/tournaments')} className="btn-secondary flex-1">Back</button>
          </div>
        </div>
      </div>
    );
  }

  const cutCount = players.filter(p => p.is_active && !p.is_withdrawn && p.made_cut === false).length;
  const rosterMap = Object.fromEntries(roster.map(r => [r.player_id, r]));

  const filtered = players
    .filter(p => {
      if (hideCut && p.made_cut === false && !p.is_withdrawn) return false;
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.country || '').toLowerCase().includes(q);
    })
    .sort((a, b) => (a.world_ranking ?? 999) - (b.world_ranking ?? 999));

  // Group filtered players by tier
  const playersByTier = {};
  for (const tier of TIER_ORDER) playersByTier[tier] = [];
  for (const p of filtered) playersByTier[getTier(p.world_ranking)].push(p);

  return (
    <div className="max-w-6xl mx-auto px-4 lg:h-[calc(100vh-64px)] lg:overflow-hidden flex flex-col">
      <div className="py-6 shrink-0 animate-fade-up">
        <h1 className="font-display text-3xl font-bold text-masters-cream">Draft Your Team</h1>
        <p className="text-white/40 text-sm mt-1">
          {membership.team_name} · 5 starters + 3 substitutes · Best 4 of 5 count each round
        </p>
      </div>

      {isLocked && (
        <div className="mb-2 shrink-0 px-4 py-3 rounded-xl bg-red-900/20 border border-red-800/30 flex items-center gap-3 text-red-300 text-sm">
          <Lock size={16} className="shrink-0" />
          Rosters are locked — you can view players but cannot make changes.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 pb-4">
        {/* Roster summary */}
        <div className="lg:col-span-1 lg:overflow-y-auto space-y-4 animate-fade-up-delay-1">

          {/* Tier usage */}
          <div className="card-dark">
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-xs uppercase tracking-wider text-white/40">Tier Usage</span>
              <span className="text-xs text-white/30">{roster.length}/8 picks</span>
            </div>
            <div className="space-y-2">
              {TIER_ORDER.map(tier => {
                const meta = TIER_META[tier];
                const count = tierCounts[tier];
                const limit = effectiveLimits[tier];
                const carry = carryOver[tier];
                const limitLabel = limit === Infinity ? '∞' : limit;
                const full = count >= limit;
                return (
                  <div key={tier} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 ${meta.color}`}>{tier}</span>
                      <span className="text-xs text-white/40">{meta.range}</span>
                      {carry > 0 && (
                        <span className="text-xs text-masters-gold/60">+{carry} carried</span>
                      )}
                    </div>
                    <span className={`text-xs font-mono font-medium ${full && limit !== Infinity ? 'text-masters-gold' : 'text-white/40'}`}>
                      {count}/{limitLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* C-tier starter warning */}
          {showCtierWarning && (
            <div className="px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/40 flex items-start gap-3">
              <Info size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="text-xs font-semibold text-amber-300 mb-0.5">No C-tier starter</p>
                <p className="text-xs text-amber-300/60 leading-relaxed">
                  R1 &amp; R2 require a C-tier player in your starting lineup.{' '}
                  <button
                    onClick={() => navigate(`/tournament/${tournamentId}/my-team`)}
                    className="underline underline-offset-2 hover:text-amber-200 transition-colors text-amber-400"
                  >
                    Go to My Team
                  </button>{' '}
                  to rearrange.
                </p>
              </div>
            </div>
          )}

          {/* Starters */}
          <div className="card-dark">
            <h3 className="font-display font-semibold text-masters-cream mb-3 flex items-center justify-between">
              Starters <span className="text-xs font-body text-white/40">{starters.length}/{MAX_STARTERS}</span>
            </h3>
            <div className="space-y-2">
              {starters.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-masters-gold/20 text-masters-gold text-xs flex items-center justify-center font-mono shrink-0">{i + 1}</span>
                    <span className="text-sm text-masters-cream truncate">{r.players?.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TierBadge worldRanking={r.players?.world_ranking} />
                    {!isLocked && (
                      <button onClick={() => handleRemove(r.players)}
                        className="text-white/25 hover:text-red-400 transition-colors text-lg leading-none"
                        title="Remove">×</button>
                    )}
                  </div>
                </div>
              ))}
              {Array.from({ length: MAX_STARTERS - starters.length }).map((_, i) => (
                <div key={`es-${i}`} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 opacity-30">
                  <span className="w-5 h-5 rounded-full border border-white/20 text-xs flex items-center justify-center">{starters.length + i + 1}</span>
                  <span className="text-sm text-white/40 italic">Empty slot</span>
                </div>
              ))}
            </div>
          </div>

          {/* Subs */}
          <div className="card-dark">
            <h3 className="font-display font-semibold text-masters-cream mb-3 flex items-center justify-between">
              Substitutes <span className="text-xs font-body text-white/40">{subs.length}/{MAX_SUBS}</span>
            </h3>
            <div className="space-y-2">
              {subs.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-white/50 text-xs flex items-center justify-center font-mono shrink-0">S{i + 1}</span>
                    <span className="text-sm text-masters-cream truncate">{r.players?.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TierBadge worldRanking={r.players?.world_ranking} />
                    {!isLocked && (
                      <button onClick={() => handleRemove(r.players)}
                        className="text-white/25 hover:text-red-400 transition-colors text-lg leading-none"
                        title="Remove">×</button>
                    )}
                  </div>
                </div>
              ))}
              {Array.from({ length: MAX_SUBS - subs.length }).map((_, i) => (
                <div key={`esub-${i}`} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 opacity-30">
                  <span className="w-5 h-5 rounded-full border border-white/20 text-xs flex items-center justify-center">S{subs.length + i + 1}</span>
                  <span className="text-sm text-white/40 italic">Empty slot</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-white/30 flex items-start gap-1.5 px-1">
            <Info size={12} className="shrink-0 mt-0.5" />
            Best 4 of your 5 starters count per round. At least 1 C-tier starter required for R1 &amp; R2.
          </div>
        </div>

        {/* Player pool — grouped by tier */}
        <div className="lg:col-span-2 flex flex-col min-h-0 animate-fade-up-delay-2">
          <div className="flex gap-3 mb-4 flex-wrap shrink-0">
            <div className="flex-1 min-w-48 relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="input pl-9 h-10" placeholder="Search players…" />
            </div>
            {cutCount > 0 && (
              <button onClick={() => setHideCut(!hideCut)}
                className={`h-10 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  hideCut
                    ? 'border-red-800/40 bg-red-900/20 text-red-400'
                    : 'border-white/10 text-white/40 hover:text-white/70'
                }`}>
                {hideCut ? `${cutCount} CUT hidden` : 'Show all'}
              </button>
            )}
          </div>

          <div className="space-y-6 flex-1 overflow-y-auto pr-1 min-h-0">
            {TIER_ORDER.map(tier => {
              const tierPlayers = playersByTier[tier];
              if (!tierPlayers.length) return null;
              const meta = TIER_META[tier];
              const count = tierCounts[tier];
              const limit = effectiveLimits[tier];
              const carry = carryOver[tier];
              const limitReached = count >= limit;
              const isCollapsed = !!collapsedTiers[tier];

              return (
                <div key={tier}>
                  {/* Tier header — clickable to collapse */}
                  <button
                    onClick={() => toggleTier(tier)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border mb-2 ${meta.bg} transition-opacity hover:opacity-80 cursor-pointer`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-bold text-sm ${meta.color}`}>{meta.label}</span>
                      <span className="text-xs text-white/40">{meta.range}</span>
                      {!isCollapsed && (
                        <span className="text-xs text-white/30">
                          · Pick up to {limit === Infinity ? '∞' : limit}
                          {carry > 0 && <span className="text-masters-gold/70"> (+{carry} from above)</span>}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono font-semibold ${limitReached && limit !== Infinity ? 'text-masters-gold' : 'text-white/40'}`}>
                        {count}/{limit === Infinity ? '∞' : limit} picked
                      </span>
                      <svg
                        className={`w-4 h-4 text-white/40 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                        viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                      >
                        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </button>

                  {/* Collapsible player list */}
                  {!isCollapsed && (
                    <div className="space-y-2">
                      {tierPlayers.map(player => (
                        <PlayerCard key={player.id} player={player} rosterEntry={rosterMap[player.id]}
                          onAdd={(p) => {
                            if (starters.length >= MAX_STARTERS && subs.length >= MAX_SUBS) { alert('Roster is full'); return; }
                            if (starters.length >= MAX_STARTERS) { handleSlotChoice(p, 'sub'); return; }
                            handleAdd(p, 'starter');
                          }}
                          onRemove={handleRemove}
                          tierLimitReached={!rosterMap[player.id] && tierCounts[getTier(player.world_ranking)] >= effectiveLimits[getTier(player.world_ranking)]}
                          isLocked={isLocked}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Slot modal */}
      {slotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setSlotModal(null)}>
          <div className="card max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-1">Add {slotModal.name}</h3>
            <p className="text-white/40 text-sm mb-5">Starter slots are full. Add as a substitute instead?</p>
            <div className="flex gap-3">
              <button onClick={() => handleSlotChoice(slotModal, 'sub')} className="btn-primary flex-1">Add as Sub</button>
              <button onClick={() => setSlotModal(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
