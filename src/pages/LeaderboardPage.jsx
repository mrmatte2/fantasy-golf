import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournament } from '../hooks/useTournament';
import { getAllRosters, getTournament, getTournamentMembers, getRoundSnapshots, getScoresForPlayers, getHolePars } from '../lib/supabase';
import { Trophy, Medal, Star, ChevronRight } from 'lucide-react';

function formatVsPar(vp) {
  if (vp === null || vp === undefined) return '—';
  if (vp === 0) return 'E';
  return vp > 0 ? `+${vp}` : `${vp}`;
}

function vsParClass(vp) {
  if (vp < 0) return 'score-under';
  if (vp > 0) return 'score-over';
  return 'score-even';
}

function positionIcon(pos) {
  if (pos === 1) return <Trophy size={16} className="text-yellow-400" />;
  if (pos === 2) return <Medal size={16} className="text-gray-300" />;
  if (pos === 3) return <Medal size={16} className="text-amber-600" />;
  return <span className="text-white/30 font-mono text-sm w-4 text-center">{pos}</span>;
}

export default function LeaderboardPage() {
  const { id: tournamentId } = useParams();
  const { user } = useAuth();
  const { tournament } = useTournament(tournamentId);
  const [allEntries, setAllEntries] = useState([]);
  const [completedRounds, setCompletedRounds] = useState([]);
  const [pars, setPars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [selectedRound, setSelectedRound] = useState(null); // null = total view

  useEffect(() => {
    if (tournamentId) loadLeaderboard();
  }, [tournamentId]);

  // Set default selected round to the latest completed round once data loads
  useEffect(() => {
    if (completedRounds.length > 0 && selectedRound === null) {
      setSelectedRound(completedRounds[completedRounds.length - 1]);
    }
  }, [completedRounds]);

  async function loadLeaderboard() {
    setLoading(true);
    const [{ data: members }, { data: rosters }, { data: ft }, { data: snapshots }] = await Promise.all([
      getTournamentMembers(tournamentId),
      getAllRosters(tournamentId),
      getTournament(tournamentId),
      getRoundSnapshots(tournamentId),
    ]);

    const pgaId = ft?.pga_tournament_id ?? tournamentId;

    if (!members) { setLoading(false); return; }

    const rosterPlayerIds = [...new Set([
      ...(snapshots || []).map(s => s.player_id),
      ...(rosters || []).filter(r => r.is_active).map(r => r.player_id),
    ])];
    const [scores, { data: parsData }] = await Promise.all([
      getScoresForPlayers(pgaId, rosterPlayerIds),
      getHolePars(pgaId),
    ]);
    setPars(parsData || []);

    const roundsWithScores = [...new Set((scores || []).map(s => s.round))].sort((a, b) => a - b);
    setCompletedRounds(roundsWithScores);

    const lockedRounds = new Set((snapshots || []).map(s => s.round));

    const board = members.map(member => {
      let totalVsPar = 0;
      const roundBreakdown = [];

      for (const round of roundsWithScores) {
        const isLocked = lockedRounds.has(round);

        // Locked rounds use the snapshot; live rounds use the current roster
        const startersForRound = isLocked
          ? (snapshots || []).filter(s => s.user_id === member.user_id && s.round === round && s.slot_type === 'starter')
          : (rosters || []).filter(r => r.user_id === member.user_id && r.slot_type === 'starter' && r.is_active);

        const subsForRound = isLocked
          ? (snapshots || []).filter(s => s.user_id === member.user_id && s.round === round && s.slot_type === 'sub')
          : [];

        // Fallback: if snapshot was empty for a locked round, use current roster
        const effectiveStarters = startersForRound.length > 0
          ? startersForRound
          : (rosters || []).filter(r => r.user_id === member.user_id && r.slot_type === 'starter' && r.is_active);

        const toPlayerScore = r => {
          const player = r.players;
          const playerRoundScores = (scores || [])
            .filter(s => s.player_id === r.player_id && s.round === round)
            .sort((a, b) => a.hole - b.hole);
          const roundTotal = playerRoundScores.reduce((sum, s) => sum + (s.vs_par || 0), 0);
          return { playerName: player?.name, playerId: r.player_id, roundTotal, holesPlayed: playerRoundScores.length, holeScores: playerRoundScores };
        };

        const starterScores = effectiveStarters.map(toPlayerScore);
        const subScores = subsForRound.map(toPlayerScore);

        const scored = starterScores.filter(s => s.holesPlayed > 0).sort((a, b) => a.roundTotal - b.roundTotal);
        const best4 = scored.slice(0, 4);
        const roundVsPar = best4.reduce((sum, s) => sum + s.roundTotal, 0);
        totalVsPar += roundVsPar;
        roundBreakdown.push({ round, roundVsPar, starterScores, subScores, best4, isLocked });
      }

      return {
        userId: member.user_id,
        username: member.profiles?.username,
        teamName: member.team_name,
        totalVsPar: roundsWithScores.length > 0 ? totalVsPar : null,
        roundBreakdown,
      };
    });

    setAllEntries(board);
    setLoading(false);
  }

  // Derive sorted entries based on the selected round view
  const entries = React.useMemo(() => {
    if (!allEntries.length) return [];
    const list = allEntries.map(entry => {
      const rb = entry.roundBreakdown.find(r => r.round === selectedRound);
      const displayScore = selectedRound !== null ? (rb?.roundVsPar ?? null) : entry.totalVsPar;
      return { ...entry, displayScore };
    });
    return list.sort((a, b) => {
      if (a.displayScore === null && b.displayScore === null) return 0;
      if (a.displayScore === null) return 1;
      if (b.displayScore === null) return -1;
      return a.displayScore - b.displayScore;
    });
  }, [allEntries, selectedRound]);

  const isShowingTotal = selectedRound === null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 animate-fade-up">
        <h1 className="font-display text-3xl font-bold text-masters-cream">Leaderboard</h1>
        <p className="text-white/40 text-sm mt-1">
          {tournament?.name}
          {completedRounds.length === 0
            ? ' · Tournament hasn\'t started yet'
            : ` · Through R${completedRounds[completedRounds.length - 1]} · Best 4 of 5 starters count`}
        </p>
      </div>

      {completedRounds.length > 0 && (
        <div className="card-dark mb-6 animate-fade-up-delay-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-white/50">{tournament?.name}</span>
            <div className="flex gap-2">
              {completedRounds.map(r => {
                const isSelected = selectedRound === r;
                return (
                  <button
                    key={r}
                    onClick={() => setSelectedRound(isSelected ? null : r)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-masters-green/80 text-green-200 border border-green-500/50'
                        : 'bg-white/8 text-white/50 hover:bg-white/15 hover:text-white/80'
                    }`}
                  >
                    R{r}
                  </button>
                );
              })}
              <button
                onClick={() => setSelectedRound(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  isShowingTotal
                    ? 'bg-masters-gold/40 text-masters-gold border border-masters-gold/40'
                    : 'bg-white/8 text-white/50 hover:bg-white/15 hover:text-white/80'
                }`}
              >
                Total
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="card-dark text-center py-12 text-white/30">
          No teams have been drafted yet.
        </div>
      ) : (
        <div className="space-y-3 animate-fade-up-delay-2">
          {entries.map((entry, idx) => {
            const isMe = entry.userId === user?.id;
            const position = idx + 1;
            const isExpanded = expanded === entry.userId;
            const selectedRb = entry.roundBreakdown.find(r => r.round === selectedRound);

            return (
              <div key={entry.userId} className={`rounded-xl border transition-all ${
                isMe ? 'border-masters-gold/40 bg-masters-gold/5' : 'border-white/10 bg-white/3 hover:border-white/15'
              }`}>
                <div className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : entry.userId)}>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-6">{positionIcon(position)}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-masters-cream">
                          {entry.teamName || entry.username}
                        </span>
                        {isMe && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-masters-gold/20 text-masters-gold border border-masters-gold/30">You</span>
                        )}
                      </div>
                      {/* Per-round sub-scores shown under the team name */}
                      {isShowingTotal && entry.roundBreakdown.length > 0 && (
                        <div className="text-xs text-white/30 mt-0.5 font-mono">
                          {entry.roundBreakdown.map(r => formatVsPar(r.roundVsPar)).join(' / ')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {completedRounds.length > 0 && (
                      <div className="text-right">
                        <div className={`font-mono text-xl font-bold ${
                          entry.displayScore !== null ? vsParClass(entry.displayScore) : 'text-white/20'
                        }`}>
                          {entry.displayScore !== null ? formatVsPar(entry.displayScore) : '—'}
                        </div>
                        <div className="text-xs text-white/30 mt-0.5">
                          {isShowingTotal ? 'total' : `R${selectedRound}`}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    {/* If viewing a specific round, show just that round detail */}
                    {selectedRound !== null && selectedRb ? (
                      <div className="mt-3 rounded-lg border border-white/8 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/8">
                          <span className="text-xs font-semibold text-white/70 tracking-wide">Round {selectedRb.round}</span>
                          {selectedRb.isLocked
                            ? <span className="text-xs text-green-500/50">✓ locked</span>
                            : <span className="text-xs text-white/20">· in progress</span>
                          }
                          {selectedRb.isLocked && (
                            <span className={`ml-auto font-mono text-sm font-bold ${vsParClass(selectedRb.roundVsPar)}`}>
                              {formatVsPar(selectedRb.roundVsPar)}
                            </span>
                          )}
                        </div>
                        <div className="px-3 py-2">
                          {!selectedRb.isLocked ? (
                            <div className="text-xs text-white/20 italic py-1">
                              Roster hidden until first scores arrive
                            </div>
                          ) : (
                            <RoundPlayerList rb={selectedRb} pars={pars} />
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Total view: show all rounds */
                      entry.roundBreakdown.map(rb => (
                        <div key={rb.round} className="mt-3 rounded-lg border border-white/8 overflow-hidden">
                          {/* Round header bar */}
                          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/8">
                            <span className="text-xs font-semibold text-white/70 tracking-wide">Round {rb.round}</span>
                            {rb.isLocked
                              ? <span className="text-xs text-green-500/50">✓ locked</span>
                              : <span className="text-xs text-white/20">· in progress</span>
                            }
                            {rb.isLocked && (
                              <span className={`ml-auto font-mono text-sm font-bold ${vsParClass(rb.roundVsPar)}`}>
                                {formatVsPar(rb.roundVsPar)}
                              </span>
                            )}
                          </div>
                          {/* Round content */}
                          <div className="px-3 py-2">
                            {!rb.isLocked ? (
                              <div className="text-xs text-white/20 italic py-1">
                                Roster hidden until first scores arrive
                              </div>
                            ) : (
                              <RoundPlayerList rb={rb} pars={pars} />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HoleGrid({ holeScores, pars }) {
  const scoreMap = Object.fromEntries((holeScores || []).map(s => [s.hole, s]));
  const parMap = Object.fromEntries((pars || []).map(p => [p.hole, p.par]));
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto mt-1 mb-2">
      <table className="text-xs w-full min-w-max">
        <thead>
          <tr className="text-white/20">
            <td className="py-0.5 pr-2 text-left">Hole</td>
            {holes.map(h => <td key={h} className="py-0.5 px-0.5 text-center w-6">{h}</td>)}
          </tr>
          <tr className="text-white/15">
            <td className="py-0.5 pr-2 text-left">Par</td>
            {holes.map(h => <td key={h} className="py-0.5 px-0.5 text-center">{parMap[h] ?? 4}</td>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-0.5 pr-2 text-white/30">Score</td>
            {holes.map(h => {
              const s = scoreMap[h];
              return (
                <td key={h} className={`py-0.5 px-0.5 text-center font-mono ${s ? vsParClass(s.vs_par) : 'text-white/15'}`}>
                  {s ? formatVsPar(s.vs_par) : '·'}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PlayerScoreRow({ ss, isCounting, isSub, pars }) {
  const [expanded, setExpanded] = useState(false);
  const hasHoles = ss.holeScores?.length > 0;
  return (
    <div>
      <button
        onClick={() => hasHoles && setExpanded(e => !e)}
        className={`w-full flex items-center justify-between text-xs py-0.5 transition-colors ${
          isSub ? 'text-white/25' : isCounting ? 'text-masters-cream' : 'text-white/30'
        } ${hasHoles ? 'hover:text-white/60 cursor-pointer' : 'cursor-default'}`}
      >
        <span className="flex items-center gap-1">
          {!isSub && isCounting && <Star size={9} className="text-masters-gold fill-masters-gold shrink-0" />}
          {ss.playerName}
          {hasHoles && (
            <ChevronRight size={9} className={`shrink-0 opacity-40 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          )}
        </span>
        <span className={`font-mono ${ss.holesPlayed > 0 ? vsParClass(ss.roundTotal) : ''}`}>
          {ss.holesPlayed > 0 ? formatVsPar(ss.roundTotal) : '—'}
        </span>
      </button>
      {expanded && hasHoles && <HoleGrid holeScores={ss.holeScores} pars={pars} />}
    </div>
  );
}

function RoundPlayerList({ rb, pars }) {
  return (
    <div>
      <div className="space-y-0.5">
        <div className="text-xs text-white/20 uppercase tracking-wider mb-1">Starters</div>
        {rb.starterScores.map(ss => (
          <PlayerScoreRow key={ss.playerId} ss={ss}
            isCounting={rb.best4.some(b => b.playerId === ss.playerId)}
            isSub={false} pars={pars} />
        ))}
      </div>

      {rb.subScores.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/8">
          <div className="text-xs text-white/20 uppercase tracking-wider mb-1">Substitutes</div>
          <div className="space-y-0.5">
            {rb.subScores.map(ss => (
              <PlayerScoreRow key={ss.playerId} ss={ss}
                isCounting={false} isSub={true} pars={pars} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
