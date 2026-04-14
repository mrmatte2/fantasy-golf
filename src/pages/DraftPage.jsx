import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournament } from '../hooks/useTournament';
import {
  getTournamentPlayers, getTournamentPriceMap,
  getUserRoster, addToRoster, removeFromRoster,
  getUserMembership, joinTournament, getTournamentCutStatus,
} from '../lib/supabase';
import { Search, Lock, Info, LogIn } from 'lucide-react';

const MAX_STARTERS = 5;
const MAX_SUBS = 3;

function PriceTag({ price }) {
  return <span className="font-mono text-sm font-medium text-masters-gold">£{price?.toFixed(1)}</span>;
}

function PlayerCard({ player, rosterEntry, onAdd, onRemove, canAdd, isLocked }) {
  const isStarter = rosterEntry?.slot_type === 'starter';
  const isSub = rosterEntry?.slot_type === 'sub';
  const inRoster = !!rosterEntry;
  const formStars = Math.round(player.form_score || 5);

  return (
    <div className={`rounded-xl border transition-all duration-200 p-4 ${
      inRoster ? 'border-masters-gold/40 bg-masters-gold/8' : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/6'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-display font-semibold text-masters-cream text-sm">{player.name}</span>
            {player.is_withdrawn && <span className="badge-wd">WD</span>}
            {player.made_cut === false && !player.is_withdrawn && <span className="badge-cut">CUT</span>}
            {isStarter && <span className="badge-starter">Starter {rosterEntry?.slot_number}</span>}
            {isSub && <span className="badge-sub">Sub {rosterEntry?.slot_number}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-white/40">
            <span>#{player.world_ranking} WR</span>
            <span>{player.country}</span>
            <span>{player.odds_fractional}</span>
          </div>
          <div className="flex items-center gap-0.5 mt-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < formStars ? 'bg-masters-gold' : 'bg-white/10'}`} />
            ))}
            <span className="text-xs text-white/30 ml-1">form</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <PriceTag price={player.price_override ?? player.price} />
          {!isLocked && (
            inRoster ? (
              <button onClick={() => onRemove(player)} className="btn-danger text-xs px-3 py-1">Remove</button>
            ) : (
              <button onClick={() => onAdd(player)} disabled={!canAdd}
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
  const [membership, setMembership] = useState(undefined); // undefined = loading
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('price');
  const [hideCut, setHideCut] = useState(true);
  const [slotModal, setSlotModal] = useState(null);
  const [currentBudget, setCurrentBudget] = useState(0);

  // Join flow state
  const [joinTeamName, setJoinTeamName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const budget = tournament?.budget ?? 100;
  const pgaTournamentId = tournament?.pga_tournament_id ?? null;
  const isLocked = tournament?.is_locked || !tournament?.draft_open;
  const starters = roster.filter(r => r.slot_type === 'starter' && r.is_active);
  const subs = roster.filter(r => r.slot_type === 'sub' && r.is_active);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: pls }, { data: rst }, { data: mem }, priceMap, cutStatus] = await Promise.all([
      getTournamentPlayers(tournamentId),
      getUserRoster(user.id, tournamentId),
      getUserMembership(tournamentId, user.id),
      getTournamentPriceMap(tournamentId),
      getTournamentCutStatus(pgaTournamentId),
    ]);
    // Merge per-tournament cut status into players
    const playersWithCut = (pls || []).map(p => ({ ...p, made_cut: cutStatus[p.id] ?? null }));
    setPlayers(playersWithCut);
    setRoster(rst || []);
    setMembership(mem ?? null);
    // Use tournament-specific prices for budget calculation
    const spent = (rst || []).reduce((sum, r) => sum + (priceMap[r.player_id] ?? r.players?.price ?? 0), 0);
    setCurrentBudget(budget - spent);
    setLoading(false);
  }, [user.id, tournamentId, budget, pgaTournamentId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleJoin() {
    if (!joinTeamName.trim()) { setJoinError('Team name is required'); return; }
    setJoining(true);
    setJoinError('');
    const { error, data } = await joinTournament(tournamentId, user.id, joinTeamName.trim());
    if (error) { setJoinError(error.message); setJoining(false); return; }
    setMembership(data);
    setJoining(false);
  }

  async function handleAdd(player, slotType) {
    const price = player.price;
    if (price > currentBudget) { alert('Not enough budget!'); return; }
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

  if (loading || membership === undefined) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
      </div>
    );
  }

  // Not a member yet — show join prompt
  if (!membership) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="card-dark">
          <LogIn size={28} className="mx-auto mb-3 text-masters-gold/60" />
          <h2 className="font-display font-bold text-masters-cream mb-2">Join to Draft</h2>
          <p className="text-white/40 text-sm mb-5">
            Choose a team name for <span className="text-white/60">{tournament?.name}</span> to start drafting.
          </p>
          <div className="text-left mb-4">
            <label className="label">Team Name</label>
            <input value={joinTeamName} onChange={e => { setJoinTeamName(e.target.value); setJoinError(''); }}
              className="input" placeholder="e.g. Amen Corner FC" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleJoin()} />
            {joinError && <p className="text-red-400 text-xs mt-1">{joinError}</p>}
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

  const filtered = players
    .filter(p => {
      if (hideCut && p.made_cut === false && !p.is_withdrawn) return false;
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.country || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'ranking') return a.world_ranking - b.world_ranking;
      if (sortBy === 'odds') return a.odds_decimal - b.odds_decimal;
      return (b.price_override ?? b.price) - (a.price_override ?? a.price);
    });

  const rosterMap = Object.fromEntries(roster.map(r => [r.player_id, r]));
  const totalSpent = budget - currentBudget;
  const budgetPct = (totalSpent / budget) * 100;

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
          <div className="card-dark">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs uppercase tracking-wider text-white/40">Budget</span>
              <span className="font-mono text-lg font-bold text-masters-gold">
                £{currentBudget.toFixed(1)}
                <span className="text-white/30 text-sm font-normal"> / £{budget}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-masters-gold transition-all duration-500"
                style={{ width: `${Math.min(budgetPct, 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>Spent £{totalSpent.toFixed(1)}</span>
              <span>{roster.length}/8 picks</span>
            </div>
          </div>

          <div className="card-dark">
            <h3 className="font-display font-semibold text-masters-cream mb-3 flex items-center justify-between">
              Starters <span className="text-xs font-body text-white/40">{starters.length}/{MAX_STARTERS}</span>
            </h3>
            <div className="space-y-2">
              {starters.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-masters-gold/20 text-masters-gold text-xs flex items-center justify-center font-mono">{i + 1}</span>
                    <span className="text-sm text-masters-cream">{r.players?.name}</span>
                  </div>
                  <PriceTag price={r.players?.price} />
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

          <div className="card-dark">
            <h3 className="font-display font-semibold text-masters-cream mb-3 flex items-center justify-between">
              Substitutes <span className="text-xs font-body text-white/40">{subs.length}/{MAX_SUBS}</span>
            </h3>
            <div className="space-y-2">
              {subs.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-white/50 text-xs flex items-center justify-center font-mono">S{i + 1}</span>
                    <span className="text-sm text-masters-cream">{r.players?.name}</span>
                  </div>
                  <PriceTag price={r.players?.price} />
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
            Best 4 of your 5 starters count per round. Subs can replace starters between rounds.
          </div>
        </div>

        {/* Player pool */}
        <div className="lg:col-span-2 flex flex-col min-h-0 animate-fade-up-delay-2">
          <div className="flex gap-3 mb-4 flex-wrap shrink-0">
            <div className="flex-1 min-w-48 relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="input pl-9 h-10" placeholder="Search players…" />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="input w-auto h-10 pr-8 appearance-none cursor-pointer">
              <option value="price">Sort: Price</option>
              <option value="ranking">Sort: World Ranking</option>
              <option value="odds">Sort: Odds</option>
            </select>
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

          <div className="space-y-2 flex-1 overflow-y-auto pr-1 min-h-0">
            {filtered.map(player => (
              <PlayerCard key={player.id} player={player} rosterEntry={rosterMap[player.id]}
                onAdd={(p) => {
                  if (starters.length >= MAX_STARTERS && subs.length >= MAX_SUBS) { alert('Roster is full'); return; }
                  if (starters.length >= MAX_STARTERS) { handleSlotChoice(p, 'sub'); return; }
                  handleAdd(p, 'starter');
                }}
                onRemove={handleRemove}
                canAdd={
                  (starters.length < MAX_STARTERS || subs.length < MAX_SUBS) &&
                  (player.price ?? 0) <= currentBudget
                }
                isLocked={isLocked}
              />
            ))}
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
