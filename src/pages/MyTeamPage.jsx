import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournament } from '../hooks/useTournament';
import {
  getUserRoster, getPlayerScores, getHolePars, updateRosterEntry,
  getUserMembership, joinTournament, getRoundSnapshots, getTournament,
  getTournamentCutStatus,
} from '../lib/supabase';
import { ArrowLeftRight, ChevronDown, ChevronRight, Lock, Star, LogIn, ChevronUp, AlertTriangle } from 'lucide-react';

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

function PlayerRow({ rosterEntry, isTopFour, scores, pars, currentRound, onSubClick, isLocked, isSub, madeCut }) {
  const [expanded, setExpanded] = useState(false);
  const player = rosterEntry.players;
  const roundScores = (scores || []).filter(s => s.round === currentRound);
  const roundTotal = roundScores.reduce((sum, s) => sum + (s.vs_par || 0), 0);
  const holesPlayed = roundScores.length;
  // madeCut: true = made cut, false = missed cut, null/undefined = not yet determined
  const missedCut = madeCut === false && !player?.is_withdrawn;
  const needsSub = !isSub && missedCut && !isLocked;

  return (
    <div className={`rounded-xl border transition-all ${
      missedCut && !isSub ? 'border-red-700/50 bg-red-900/10'
      : isSub && missedCut ? 'border-red-800/30 bg-red-900/5 opacity-60'
      : isSub ? 'border-white/8 bg-white/2'
      : isTopFour ? 'border-masters-gold/30 bg-masters-gold/5'
      : 'border-white/10 bg-white/3'
    }`}>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {!isSub && (
            missedCut
              ? <ArrowLeftRight size={14} className="text-red-400 shrink-0" />
              : <Star size={12} className={isTopFour ? 'text-masters-gold fill-masters-gold' : 'text-white/20'} />
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-display font-semibold text-sm ${missedCut ? 'text-red-300/80 line-through' : 'text-masters-cream'}`}>
                {player?.name}
              </span>
              {player?.is_withdrawn && <span className="badge-wd">WD</span>}
              {missedCut && <span className="badge-cut">MISSED CUT</span>}
              {isSub && !missedCut && <span className="badge-sub">Sub</span>}
              {isSub && missedCut && <span className="text-xs text-red-400/60">Sub · Cut</span>}
              {!isSub && !missedCut && isTopFour && <span className="text-xs text-masters-gold/60">Counting</span>}
            </div>
            <div className="text-xs text-white/40 mt-0.5">#{player?.world_ranking} WR · {player?.odds_fractional}</div>
            {needsSub && (
              <div className="text-xs text-red-400 mt-1 font-medium">⚠ Substitute needed for Round {currentRound + 1}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {currentRound > 0 && holesPlayed > 0 && (
            <div className="text-right">
              <div className={`font-mono font-bold text-sm ${vsParClass(roundTotal)}`}>{formatVsPar(roundTotal)}</div>
              <div className="text-xs text-white/30">{holesPlayed} holes</div>
            </div>
          )}
          {!isLocked && !isSub && (
            <button onClick={() => onSubClick(rosterEntry)}
              className={`p-1.5 rounded-lg transition-colors ${
                needsSub
                  ? 'text-red-400 bg-red-900/30 hover:bg-red-900/50'
                  : 'text-white/30 hover:text-masters-gold hover:bg-masters-gold/10'
              }`}>
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
  const [lockedRounds, setLockedRounds] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [cutStatus, setCutStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [subModal, setSubModal] = useState(null);
  const [subs, setSubs] = useState([]);

  // Join flow
  const [joinTeamName, setJoinTeamName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: rst }, { data: mem }, { data: snapData }, { data: ft }] = await Promise.all([
      getUserRoster(user.id, tournamentId),
      getUserMembership(tournamentId, user.id),
      getRoundSnapshots(tournamentId),
      getTournament(tournamentId),
    ]);

    const pgaTournamentId = ft?.pga_tournament_id;
    const rosterData = rst || [];
    const snapshotData = snapData || [];
    setRoster(rosterData);
    setMembership(mem ?? null);
    setSnapshots(snapshotData);
    setLockedRounds([...new Set(snapshotData.map(s => s.round))].sort());
    setCutStatus(await getTournamentCutStatus(pgaTournamentId));

    // Load scores for all players: current roster + anyone in snapshots (may differ after swaps)
    const allPlayerIds = [...new Set([
      ...rosterData.map(r => r.player_id),
      ...snapshotData.map(s => s.player_id),
    ])];

    const [holeParsResult, ...scoreResponses] = await Promise.all([
      getHolePars(pgaTournamentId),
      ...allPlayerIds.map(pid => getPlayerScores(pid, pgaTournamentId ?? tournamentId)),
    ]);

    setPars(holeParsResult.data || []);
    setScores(Object.fromEntries(
      scoreResponses.map(({ data }, i) => [allPlayerIds[i], data || []])
    ));
    setLoading(false);
  }, [user.id, tournamentId]);

  useEffect(() => { loadData(); }, [loadData]);

  const allScoresList = Object.values(scores).flat();
  const currentRound = allScoresList.length > 0 ? Math.max(...allScoresList.map(s => s.round)) : 0;
  // Subs are blocked only while a round has scores but no snapshot yet (the brief sync window).
  // Once snapshotted, the round is frozen — subs only affect future rounds, so allow them.
  const isLocked = currentRound > 0 && !lockedRounds.includes(currentRound);

  const starters = roster.filter(r => r.slot_type === 'starter' && r.is_active);
  const subsRoster = roster.filter(r => r.slot_type === 'sub' && r.is_active).sort((a, b) => a.slot_number - b.slot_number);

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

  // Compute best-4-of-5 for any set of player IDs in a given round
  function computeRoundBest4(playerIds, round) {
    const totals = playerIds
      .map(pid => {
        const roundScores = (scores[pid] || []).filter(s => s.round === round);
        if (!roundScores.length) return null;
        return roundScores.reduce((sum, s) => sum + (s.vs_par || 0), 0);
      })
      .filter(t => t !== null)
      .sort((a, b) => a - b)
      .slice(0, 4);
    return totals.length > 0 ? totals.reduce((sum, t) => sum + t, 0) : null;
  }

  const currentStarterIds = starters.map(r => r.player_id);
  const allScoreRounds = [...new Set(Object.values(scores).flat().map(s => s.round))].sort();

  // Per-round breakdown: locked rounds use snapshot, current round uses current roster
  const roundBreakdown = allScoreRounds.map(round => {
    const isLocked = lockedRounds.includes(round);
    if (isLocked) {
      const snapStarterIds = snapshots
        .filter(s => s.user_id === user.id && s.round === round && s.slot_type === 'starter')
        .map(s => s.player_id);
      const lockedScore = computeRoundBest4(snapStarterIds, round);
      const currentScore = computeRoundBest4(currentStarterIds, round);
      const unchanged = snapStarterIds.length === currentStarterIds.length &&
        snapStarterIds.every(id => currentStarterIds.includes(id));
      return { round, isLocked: true, lockedScore, currentScore, unchanged };
    }
    return { round, isLocked: false, liveScore: computeRoundBest4(currentStarterIds, round) };
  });

  const teamTotal = roundBreakdown
    .filter(r => r.isLocked)
    .reduce((sum, r) => sum + (r.lockedScore ?? 0), 0)
    + (roundBreakdown.find(r => !r.isLocked)?.liveScore ?? 0);

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

  async function handleReorderSub(subA, subB) {
    // Swap slot_numbers between two adjacent subs
    await Promise.all([
      updateRosterEntry(user.id, subA.player_id, tournamentId, { slot_number: subB.slot_number }),
      updateRosterEntry(user.id, subB.player_id, tournamentId, { slot_number: subA.slot_number }),
    ]);
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
        {roundBreakdown.length > 0 && (
          <div className="card-dark text-center min-w-32">
            <div className="text-xs text-white/40 uppercase tracking-wider mb-1">
              {roundBreakdown.every(r => r.isLocked) ? 'Tournament' : `R${currentRound}`} Score
            </div>
            <div className={`font-mono text-2xl font-bold ${vsParClass(teamTotal)}`}>{formatVsPar(teamTotal)}</div>
            <div className="text-xs text-white/30 mt-0.5">best 4 of 5</div>
          </div>
        )}
      </div>

      {membership.is_dnf && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-red-950/40 border border-red-700/50 flex items-center gap-3 text-red-300 text-sm">
          <AlertTriangle size={15} className="shrink-0" />
          <div>
            <div className="font-semibold">Team DNF</div>
            <div className="text-red-300/60 text-xs mt-0.5">
              Your team couldn't field 4 valid starters after the cut — no score for R3 or R4.
            </div>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-red-900/20 border border-red-800/30 flex items-center gap-3 text-red-300 text-sm">
          <Lock size={15} /> Round {currentRound} is in progress — substitutions temporarily unavailable until the round locks in.
        </div>
      )}

      {(() => {
        const cutStarters = starters.filter(r => cutStatus[r.player_id] === false && !r.players?.is_withdrawn);
        const cutSubs = subsRoster.filter(r => cutStatus[r.player_id] === false && !r.players?.is_withdrawn);
        if (cutStarters.length === 0) return null;
        return (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-900/20 border border-red-800/30 text-sm">
            <div className="flex items-center gap-2 text-red-300 font-medium mb-1">
              <ArrowLeftRight size={15} />
              {cutStarters.length} starter{cutStarters.length > 1 ? 's' : ''} missed the cut
            </div>
            <p className="text-red-300/60 text-xs">
              {isLocked
                ? 'Substitutions will open once the round locks in.'
                : `Swap them out now — changes take effect from Round ${currentRound + 1}. ${cutSubs.length > 0 ? `Note: ${cutSubs.length} of your subs also missed the cut.` : 'Check your subs below — pick one who survived.'}`
              }
            </p>
          </div>
        );
      })()}

      {roundBreakdown.length > 0 && (
        <div className="mb-6 animate-fade-up-delay-1">
          <h2 className="font-display font-semibold text-masters-cream mb-3">Round Scores</h2>
          <div className="space-y-2">
            {roundBreakdown.map(rd => (
              <div key={rd.round} className="rounded-xl border border-white/10 bg-white/3 px-4 py-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-masters-cream text-sm">Round {rd.round}</span>
                    {rd.isLocked
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-masters-gold/15 text-masters-gold border border-masters-gold/30 flex items-center gap-1"><Lock size={9} /> Locked</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800/40">In progress</span>
                    }
                  </div>
                  <div className="flex items-center gap-4">
                    {rd.isLocked ? (
                      <>
                        <div className="text-right">
                          <div className="text-xs text-white/40 mb-0.5">Locked score</div>
                          <div className={`font-mono font-bold ${vsParClass(rd.lockedScore)}`}>{formatVsPar(rd.lockedScore)}</div>
                        </div>
                        {!rd.unchanged && rd.currentScore !== null && (
                          <div className="text-right">
                            <div className="text-xs text-white/40 mb-0.5">Current selection</div>
                            <div className={`font-mono font-bold ${vsParClass(rd.currentScore)}`}>{formatVsPar(rd.currentScore)}</div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-right">
                        <div className="text-xs text-white/40 mb-0.5">Current selection</div>
                        <div className={`font-mono font-bold ${vsParClass(rd.liveScore)}`}>{formatVsPar(rd.liveScore)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
              onSubClick={openSubModal} isLocked={isLocked} isSub={false}
              madeCut={cutStatus[r.player_id] ?? null} />
          ))}
          {starters.length === 0 && (
            <div className="card-dark text-center text-white/30 text-sm py-8">
              No starters selected. Go to Draft to pick your team.
            </div>
          )}
        </div>
      </div>

      <div className="animate-fade-up-delay-2">
        <h2 className="font-display font-semibold text-masters-cream mb-1 flex items-center gap-2">
          Substitutes
          <span className="text-xs font-body text-white/40">(auto-sub order)</span>
        </h2>
        {!isLocked && subsRoster.length > 1 && (
          <p className="text-xs text-white/30 mb-3">Use the arrows to set priority order — Sub 1 auto-subs in first.</p>
        )}
        {isLocked && <div className="mb-3" />}
        <div className="space-y-2">
          {subsRoster.map((r, idx) => (
            <div key={r.id} className="flex items-stretch gap-2">
              {/* Order badge + reorder buttons */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <span className="text-xs font-mono text-white/30 font-medium w-8 text-center pt-4">
                  S{idx + 1}
                </span>
                {!isLocked && (
                  <>
                    <button
                      onClick={() => idx > 0 && handleReorderSub(r, subsRoster[idx - 1])}
                      disabled={idx === 0}
                      className="p-0.5 text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors">
                      <ChevronUp size={13} />
                    </button>
                    <button
                      onClick={() => idx < subsRoster.length - 1 && handleReorderSub(r, subsRoster[idx + 1])}
                      disabled={idx === subsRoster.length - 1}
                      className="p-0.5 text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors">
                      <ChevronDown size={13} />
                    </button>
                  </>
                )}
              </div>
              <div className="flex-1">
                <PlayerRow rosterEntry={r} isTopFour={false}
                  scores={scores[r.player_id]} pars={pars} currentRound={currentRound}
                  onSubClick={() => {}} isLocked={isLocked} isSub={true}
                  madeCut={cutStatus[r.player_id] ?? null} />
              </div>
            </div>
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
              {subs
                .sort((a, b) => {
                  const aOk = cutStatus[a.player_id] !== false && !a.players?.is_withdrawn;
                  const bOk = cutStatus[b.player_id] !== false && !b.players?.is_withdrawn;
                  return bOk - aOk;
                })
                .map(sub => {
                  const survived = cutStatus[sub.player_id] !== false && !sub.players?.is_withdrawn;
                  const subRoundScores = currentRound > 0
                    ? (scores[sub.player_id] || []).filter(s => s.round === currentRound)
                    : [];
                  const subRoundTotal = subRoundScores.reduce((sum, s) => sum + (s.vs_par || 0), 0);
                  const subHolesPlayed = subRoundScores.length;
                  return (
                    <button key={sub.id} onClick={() => survived && handleSub(subModal.outEntry, sub)}
                      disabled={!survived}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                        survived
                          ? 'border-white/10 hover:border-masters-gold/40 hover:bg-masters-gold/5'
                          : 'border-red-900/30 bg-red-900/10 opacity-50 cursor-not-allowed'
                      }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium text-sm ${survived ? 'text-masters-cream' : 'text-red-300/70 line-through'}`}>
                            {sub.players?.name}
                          </span>
                        </div>
                        {currentRound > 0 && subHolesPlayed > 0 && (
                          <div className="text-right shrink-0">
                            <span className={`font-mono font-bold text-sm ${vsParClass(subRoundTotal)}`}>
                              {formatVsPar(subRoundTotal)}
                            </span>
                            <span className="text-xs text-white/30 ml-1">({subHolesPlayed})</span>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-white/40 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>#{sub.players?.world_ranking} WR · £{sub.players?.price_override ?? sub.players?.price}</span>
                        {survived
                          ? <span className="text-green-400">✓ Made cut</span>
                          : <span className="text-red-400">✗ Missed cut</span>
                        }
                      </div>
                    </button>
                  );
                })}
            </div>
            <button onClick={() => setSubModal(null)} className="btn-secondary w-full mt-4">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
