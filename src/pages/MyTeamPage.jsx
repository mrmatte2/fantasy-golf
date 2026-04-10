import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournament } from '../hooks/useTournament';
import {
  getUserRoster, getPlayerScores, getHolePars, updateRosterEntry, getPlayers,
  getUserMembership, joinTournament,
} from '../lib/supabase';
import { ArrowLeftRight, ChevronDown, ChevronRight, Lock, Star, LogIn } from 'lucide-react';

function vsParClass(vp) {
  if (vp < 0) return 'score-under';
  if (vp > 0) return 'score-over';
  return 'score-even';
}

function formatVsPar(vp) {
  if (vp === null || vp === undefined) return '—';
  if (vp === 0) return 'E';
  return vp > 0 ? `+${vp}` : `${vp}`;
}

function HoleByHoleRow({ scores, pars, round }) {
  const scoreMap = Object.fromEntries(
    (scores || []).filter(s => s.round === round).map(s => [s.hole, s])
  );
  const roundTotal = Object.values(scoreMap).reduce((sum, s) => sum + (s.vs_par || 0), 0);
  const holesPlayed = Object.keys(scoreMap).length;

  if (holesPlayed === 0) return (
    <div className="text-xs text-white/30 italic px-2 py-1">No scores yet for this round</div>
  );

  return (
    <div className="overflow-x-auto mt-2">
      <table className="text-xs w-full min-w-max">
        <thead>
          <tr className="text-white/30">
            <td className="py-1 px-1 text-left">Hole</td>
            {(pars || []).map(p => <td key={p.hole} className="py-1 px-1 text-center w-8">{p.hole}</td>)}
            <td className="py-1 px-2 text-right font-medium">Total</td>
          </tr>
          <tr className="text-white/20">
            <td className="py-0.5 px-1 text-left">Par</td>
            {(pars || []).map(p => <td key={p.hole} className="py-0.5 px-1 text-center">{p.par}</td>)}
            <td className="py-0.5 px-2 text-right">72</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1 px-1 text-white/50">Score</td>
            {(pars || []).map(p => {
              const s = scoreMap[p.hole];
              return (
                <td key={p.hole} className={`py-1 px-1 text-center font-mono ${s ? vsParClass(s.vs_par) : 'text-white/20'}`}>
                  {s ? formatVsPar(s.vs_par) : '·'}
                </td>
              );
            })}
            <td className={`py-1 px-2 text-right font-mono font-bold ${vsParClass(roundTotal)}`}>
              {formatVsPar(roundTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PlayerRow({ rosterEntry, isTopFour, scores, pars, currentRound, onSubClick, isLocked, isSub }) {
  const [expanded, setExpanded] = useState(false);
  const player = rosterEntry.players;
  const roundScores = (scores || []).filter(s => s.round === currentRound);
  const roundTotal = roundScores.reduce((sum, s) => sum + (s.vs_par || 0), 0);
  const holesPlayed = roundScores.length;

  return (
    <div className={`rounded-xl border transition-all ${
      isSub ? 'border-white/8 bg-white/2'
      : isTopFour ? 'border-masters-gold/30 bg-masters-gold/5'
      : 'border-white/10 bg-white/3'
    }`}>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {!isSub && <Star size={12} className={isTopFour ? 'text-masters-gold fill-masters-gold' : 'text-white/20'} />}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-semibold text-masters-cream text-sm">{player?.name}</span>
              {player?.is_withdrawn && <span className="badge-wd">WD</span>}
              {!player?.made_cut && !player?.is_withdrawn && currentRound > 2 && <span className="badge-cut">CUT</span>}
              {isSub && <span className="badge-sub">Sub</span>}
              {!isSub && isTopFour && <span className="text-xs text-masters-gold/60">Counting</span>}
            </div>
            <div className="text-xs text-white/40 mt-0.5">#{player?.world_ranking} WR · {player?.odds_fractional}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {currentRound > 0 && holesPlayed > 0 && (
            <div className="text-right">
              <div className={`font-mono font-bold text-sm ${vsParClass(roundTotal)}`}>{formatVsPar(roundTotal)}</div>
              <div className="text-xs text-white/30">{holesPlayed} holes</div>
            </div>
          )}
          {!isLocked && (
            <button onClick={() => onSubClick(rosterEntry)}
              className="p-1.5 rounded-lg text-white/30 hover:text-masters-gold hover:bg-masters-gold/10 transition-colors">
              <ArrowLeftRight size={14} />
            </button>
          )}
          {currentRound > 0 && (
            <button onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/70 transition-colors">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>
      </div>
      {expanded && currentRound > 0 && (
        <div className="px-4 pb-4 border-t border-white/5">
          {Array.from({ length: currentRound }).map((_, i) => (
            <div key={i + 1}>
              <div className="text-xs text-white/30 mt-3 mb-1 font-medium uppercase tracking-wider">Round {i + 1}</div>
              <HoleByHoleRow scores={scores} pars={pars} round={i + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyTeamPage() {
  const { id: tournamentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tournament } = useTournament(tournamentId);

  const [roster, setRoster] = useState([]);
  const [scores, setScores] = useState({});
  const [pars, setPars] = useState([]);
  const [membership, setMembership] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [subModal, setSubModal] = useState(null);
  const [subs, setSubs] = useState([]);

  // Join flow
  const [joinTeamName, setJoinTeamName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const isLocked = tournament?.is_locked;
  const currentRound = tournament?.current_round || 0;

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: rst }, { data: holePars }, { data: mem }] = await Promise.all([
      getUserRoster(user.id, tournamentId),
      getHolePars(),
      getUserMembership(tournamentId, user.id),
    ]);
    const rosterData = rst || [];
    setRoster(rosterData);
    setPars(holePars || []);
    setMembership(mem ?? null);

    const scoreResults = await Promise.all(
      rosterData.map(async r => {
        const { data } = await getPlayerScores(r.player_id, tournamentId);
        return { playerId: r.player_id, scores: data || [] };
      })
    );
    setScores(Object.fromEntries(scoreResults.map(s => [s.playerId, s.scores])));
    setLoading(false);
  }, [user.id, tournamentId]);

  useEffect(() => { loadData(); }, [loadData]);

  const starters = roster.filter(r => r.slot_type === 'starter' && r.is_active);
  const subsRoster = roster.filter(r => r.slot_type === 'sub' && r.is_active);

  const startersWithScores = starters.map(r => {
    const roundScores = (scores[r.player_id] || []).filter(s => s.round === currentRound);
    const roundTotal = roundScores.reduce((sum, s) => sum + (s.vs_par || 0), 0);
    return { ...r, roundTotal, holesPlayed: roundScores.length };
  });

  const topFourIds = new Set(
    [...startersWithScores].filter(s => s.holesPlayed > 0)
      .sort((a, b) => a.roundTotal - b.roundTotal)
      .slice(0, 4).map(s => s.player_id)
  );

  const teamTotal = startersWithScores
    .filter(s => topFourIds.has(s.player_id))
    .reduce((sum, s) => sum + s.roundTotal, 0);

  async function openSubModal(outEntry) {
    setSubModal({ outEntry });
    setSubs(subsRoster);
  }

  async function handleSub(outEntry, inEntry) {
    await updateRosterEntry(user.id, outEntry.player_id, tournamentId, { slot_type: 'sub', slot_number: inEntry.slot_number });
    await updateRosterEntry(user.id, inEntry.player_id, tournamentId, { slot_type: 'starter', slot_number: outEntry.slot_number });
    setSubModal(null);
    await loadData();
  }

  async function handleJoin() {
    if (!joinTeamName.trim()) { setJoinError('Team name is required'); return; }
    setJoining(true);
    setJoinError('');
    const { error, data } = await joinTournament(tournamentId, user.id, joinTeamName.trim());
    if (error) { setJoinError(error.message); setJoining(false); return; }
    setMembership(data);
    setJoining(false);
  }

  if (loading || membership === undefined) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="card-dark">
          <LogIn size={28} className="mx-auto mb-3 text-masters-gold/60" />
          <h2 className="font-display font-bold text-masters-cream mb-2">Join to View Your Team</h2>
          <p className="text-white/40 text-sm mb-5">
            Choose a team name for <span className="text-white/60">{tournament?.name}</span>.
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
              {joining ? 'Joining…' : 'Join Tournament'}
            </button>
            <button onClick={() => navigate('/tournaments')} className="btn-secondary flex-1">Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 animate-fade-up flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-masters-cream">My Team</h1>
          <p className="text-white/40 text-sm mt-1">
            {membership.team_name}
            {isLocked ? ' · Roster locked' : ''}
            {currentRound > 0 ? ` · Round ${currentRound} in progress` : ' · Pre-tournament'}
          </p>
        </div>
        {currentRound > 0 && (
          <div className="card-dark text-center min-w-32">
            <div className="text-xs text-white/40 uppercase tracking-wider mb-1">R{currentRound} Score</div>
            <div className={`font-mono text-2xl font-bold ${vsParClass(teamTotal)}`}>{formatVsPar(teamTotal)}</div>
            <div className="text-xs text-white/30 mt-0.5">best 4 of 5</div>
          </div>
        )}
      </div>

      {isLocked && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-red-900/20 border border-red-800/30 flex items-center gap-3 text-red-300 text-sm">
          <Lock size={15} /> Roster is locked for the current round. Substitutions open between rounds.
        </div>
      )}

      <div className="mb-6 animate-fade-up-delay-1">
        <h2 className="font-display font-semibold text-masters-cream mb-3 flex items-center gap-2">
          Starters <span className="text-xs font-body text-white/40">(best 4 count)</span>
        </h2>
        <div className="space-y-2">
          {starters.map(r => (
            <PlayerRow key={r.id} rosterEntry={r} isTopFour={topFourIds.has(r.player_id)}
              scores={scores[r.player_id]} pars={pars} currentRound={currentRound}
              onSubClick={openSubModal} isLocked={isLocked} isSub={false} />
          ))}
          {starters.length === 0 && (
            <div className="card-dark text-center text-white/30 text-sm py-8">
              No starters selected. Go to Draft to pick your team.
            </div>
          )}
        </div>
      </div>

      <div className="animate-fade-up-delay-2">
        <h2 className="font-display font-semibold text-masters-cream mb-3">Substitutes</h2>
        <div className="space-y-2">
          {subsRoster.map(r => (
            <PlayerRow key={r.id} rosterEntry={r} isTopFour={false}
              scores={scores[r.player_id]} pars={pars} currentRound={currentRound}
              onSubClick={() => {}} isLocked={isLocked} isSub={true} />
          ))}
          {subsRoster.length === 0 && (
            <div className="card-dark text-center text-white/30 text-sm py-6">No substitutes selected.</div>
          )}
        </div>
      </div>

      {subModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setSubModal(null)}>
          <div className="card max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-1">
              Substitute {subModal.outEntry.players?.name}
            </h3>
            <p className="text-white/40 text-sm mb-4">Choose a substitute to swap in:</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {subs.length === 0 && <p className="text-white/30 text-sm text-center py-4">No substitutes available</p>}
              {subs.map(sub => (
                <button key={sub.id} onClick={() => handleSub(subModal.outEntry, sub)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-white/10 hover:border-masters-gold/40 hover:bg-masters-gold/5 transition-colors">
                  <div className="font-medium text-masters-cream text-sm">{sub.players?.name}</div>
                  <div className="text-xs text-white/40">#{sub.players?.world_ranking} WR · £{sub.players?.price_override ?? sub.players?.price}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setSubModal(null)} className="btn-secondary w-full mt-4">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
