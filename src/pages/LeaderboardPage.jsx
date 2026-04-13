import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournament } from '../hooks/useTournament';
import { getAllRosters, getAllScores, getTournament, getTournamentMembers, getRoundSnapshots } from '../lib/supabase';
import { Trophy, Medal, Star } from 'lucide-react';

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
  const [entries, setEntries] = useState([]);
  const [completedRounds, setCompletedRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (tournamentId) loadLeaderboard();
  }, [tournamentId]);

  async function loadLeaderboard() {
    setLoading(true);
    const [{ data: members }, { data: rosters }, { data: ft }, { data: snapshots }] = await Promise.all([
      getTournamentMembers(tournamentId),
      getAllRosters(tournamentId),
      getTournament(tournamentId),
      getRoundSnapshots(tournamentId),
    ]);

    // Resolve pga_tournament_id: scores belong to the PGA event, not the fantasy league
    const pgaId = ft?.pga_tournament_id ?? tournamentId;
    const { data: scores } = await getAllScores(pgaId);

    if (!members) { setLoading(false); return; }

    // Determine rounds purely from score data
    const roundsWithScores = [...new Set((scores || []).map(s => s.round))].sort((a, b) => a - b);
    setCompletedRounds(roundsWithScores);

    // Rounds that have a snapshot are "locked" — rosters are visible
    const lockedRounds = new Set((snapshots || []).map(s => s.round));

    const board = members.map(member => {
      let totalVsPar = 0;
      const roundBreakdown = [];

      for (const round of roundsWithScores) {
        const isLocked = lockedRounds.has(round);

        // Starters: use snapshot for locked rounds, current roster for live rounds
        const startersForRound = isLocked
          ? (snapshots || []).filter(s => s.user_id === member.user_id && s.round === round && s.slot_type === 'starter')
          : (rosters || []).filter(r => r.user_id === member.user_id && r.slot_type === 'starter' && r.is_active);

        const subsForRound = isLocked
          ? (snapshots || []).filter(s => s.user_id === member.user_id && s.round === round && s.slot_type === 'sub')
          : [];

        const starterScores = startersForRound.map(r => {
          const player = r.players;
          const playerRoundScores = (scores || []).filter(s => s.player_id === r.player_id && s.round === round);
          const roundTotal = playerRoundScores.reduce((sum, s) => sum + (s.vs_par || 0), 0);
          return { playerName: player?.name, playerId: r.player_id, roundTotal, holesPlayed: playerRoundScores.length };
        });

        const subScores = subsForRound.map(r => {
          const player = r.players;
          const playerRoundScores = (scores || []).filter(s => s.player_id === r.player_id && s.round === round);
          const roundTotal = playerRoundScores.reduce((sum, s) => sum + (s.vs_par || 0), 0);
          return { playerName: player?.name, playerId: r.player_id, roundTotal, holesPlayed: playerRoundScores.length };
        });

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

    board.sort((a, b) => {
      if (a.totalVsPar === null && b.totalVsPar === null) return 0;
      if (a.totalVsPar === null) return 1;
      if (b.totalVsPar === null) return -1;
      return a.totalVsPar - b.totalVsPar;
    });

    setEntries(board);
    setLoading(false);
  }

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
              {[1,2,3,4].map(r => {
                const done = completedRounds.includes(r);
                const isLatest = r === completedRounds[completedRounds.length - 1];
                return (
                  <div key={r} className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isLatest ? 'bg-masters-green/60 text-green-300 border border-green-600/30'
                    : done ? 'bg-masters-gold/20 text-masters-gold'
                    : 'bg-white/5 text-white/20'
                  }`}>
                    R{r} {isLatest ? '▶' : done ? '✓' : ''}
                  </div>
                );
              })}
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
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {completedRounds.length > 0 && (
                      <div className="text-right">
                        <div className={`font-mono text-xl font-bold ${
                          entry.totalVsPar !== null ? vsParClass(entry.totalVsPar) : 'text-white/20'
                        }`}>
                          {entry.totalVsPar !== null ? formatVsPar(entry.totalVsPar) : '—'}
                        </div>
                        {entry.roundBreakdown.length > 1 && (
                          <div className="text-xs text-white/30">
                            {entry.roundBreakdown.map(r => r.isLocked ? formatVsPar(r.roundVsPar) : '?').join(' / ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    {entry.roundBreakdown.map(rb => (
                      <div key={rb.round} className="mt-4">
                        <div className="text-xs text-white/30 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <span>Round {rb.round}</span>
                          {rb.isLocked
                            ? <span className="text-green-600/60">✓ locked</span>
                            : <span className="text-white/20">• in progress</span>
                          }
                          {rb.isLocked && (
                            <span className={`ml-auto font-mono text-sm ${vsParClass(rb.roundVsPar)}`}>
                              {formatVsPar(rb.roundVsPar)}
                            </span>
                          )}
                        </div>
                        {!rb.isLocked ? (
                          <div className="text-xs text-white/20 italic px-1">
                            Roster hidden until first scores arrive
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            {rb.starterScores.map(ss => {
                              const isCounting = rb.best4.some(b => b.playerId === ss.playerId);
                              return (
                                <div key={ss.playerId} className={`flex items-center justify-between text-xs py-0.5 ${
                                  isCounting ? 'text-masters-cream' : 'text-white/30'
                                }`}>
                                  <span className="flex items-center gap-1">
                                    {isCounting && <Star size={9} className="text-masters-gold fill-masters-gold" />}
                                    {ss.playerName}
                                  </span>
                                  <span className={`font-mono ${ss.holesPlayed > 0 ? vsParClass(ss.roundTotal) : ''}`}>
                                    {ss.holesPlayed > 0 ? formatVsPar(ss.roundTotal) : '—'}
                                  </span>
                                </div>
                              );
                            })}
                            {rb.subScores.map(ss => (
                              <div key={ss.playerId} className="flex items-center justify-between text-xs py-0.5 text-white/20">
                                <span className="flex items-center gap-2">
                                  <span className="text-white/15 text-xs italic">sub</span>
                                  {ss.playerName}
                                </span>
                                <span className={`font-mono ${ss.holesPlayed > 0 ? vsParClass(ss.roundTotal) : ''}`}>
                                  {ss.holesPlayed > 0 ? formatVsPar(ss.roundTotal) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
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
