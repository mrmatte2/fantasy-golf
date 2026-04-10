import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournament } from '../hooks/useTournament';
import { getAllRosters, getAllScores, getTournamentMembers } from '../lib/supabase';
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
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const currentRound = tournament?.current_round || 0;

  useEffect(() => {
    if (tournamentId) loadLeaderboard();
  }, [tournamentId, currentRound]);

  async function loadLeaderboard() {
    setLoading(true);
    const [{ data: members }, { data: rosters }, { data: scores }] = await Promise.all([
      getTournamentMembers(tournamentId),
      getAllRosters(tournamentId),
      getAllScores(tournamentId),
    ]);

    if (!members) { setLoading(false); return; }

    // Build leaderboard per member
    const board = members.map(member => {
      const userRosters = (rosters || []).filter(r =>
        r.user_id === member.user_id && r.slot_type === 'starter' && r.is_active
      );

      let totalVsPar = 0;
      const roundBreakdown = [];

      for (let round = 1; round <= currentRound; round++) {
        const starterScores = userRosters.map(r => {
          const playerRoundScores = (scores || []).filter(
            s => s.player_id === r.player_id && s.round === round
          );
          const roundTotal = playerRoundScores.reduce((sum, s) => sum + (s.vs_par || 0), 0);
          return { playerName: r.players?.name, roundTotal, holesPlayed: playerRoundScores.length };
        });

        const scored = starterScores.filter(s => s.holesPlayed > 0)
          .sort((a, b) => a.roundTotal - b.roundTotal);
        const best4 = scored.slice(0, 4);
        const roundVsPar = best4.reduce((sum, s) => sum + s.roundTotal, 0);
        totalVsPar += roundVsPar;
        roundBreakdown.push({ round, roundVsPar, starterScores, best4 });
      }

      return {
        userId: member.user_id,
        username: member.profiles?.username,
        teamName: member.team_name,
        totalVsPar: currentRound > 0 ? totalVsPar : null,
        roundBreakdown,
        starters: userRosters,
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
          {currentRound === 0
            ? ' · Tournament hasn\'t started yet'
            : ` · Round ${currentRound} · Best 4 of 5 starters count`}
        </p>
      </div>

      {currentRound > 0 && (
        <div className="card-dark mb-6 animate-fade-up-delay-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-white/50">{tournament?.name}</span>
            <div className="flex gap-2">
              {[1,2,3,4].map(r => (
                <div key={r} className={`px-3 py-1 rounded-full text-xs font-medium ${
                  r < currentRound ? 'bg-masters-gold/20 text-masters-gold'
                  : r === currentRound ? 'bg-masters-green/60 text-green-300 border border-green-600/30'
                  : 'bg-white/5 text-white/20'
                }`}>
                  R{r} {r === currentRound ? '▶' : r < currentRound ? '✓' : ''}
                </div>
              ))}
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
                      <div className="text-xs text-white/40 mt-0.5">{entry.starters.length} starters selected</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {currentRound > 0 && (
                      <div className="text-right">
                        <div className={`font-mono text-xl font-bold ${
                          entry.totalVsPar !== null ? vsParClass(entry.totalVsPar) : 'text-white/20'
                        }`}>
                          {entry.totalVsPar !== null ? formatVsPar(entry.totalVsPar) : '—'}
                        </div>
                        {entry.roundBreakdown.length > 1 && (
                          <div className="text-xs text-white/30">
                            {entry.roundBreakdown.map(r => formatVsPar(r.roundVsPar)).join(' / ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <div>
                        <div className="text-xs text-white/30 uppercase tracking-wider mb-2">Starters</div>
                        <div className="space-y-1.5">
                          {entry.starters.map(r => (
                            <div key={r.id} className="flex items-center justify-between text-sm">
                              <span className="text-masters-cream">{r.players?.name}</span>
                              <span className="text-white/30 text-xs">#{r.players?.world_ranking}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {entry.roundBreakdown.length > 0 && (
                        <div>
                          <div className="text-xs text-white/30 uppercase tracking-wider mb-2">Round Scores</div>
                          {entry.roundBreakdown.map(rb => (
                            <div key={rb.round} className="mb-3">
                              <div className="text-xs text-white/40 mb-1">Round {rb.round}</div>
                              {rb.starterScores.map((ss, i) => {
                                const isCounting = rb.best4.some(b => b.playerName === ss.playerName);
                                return (
                                  <div key={i} className={`flex items-center justify-between text-xs py-0.5 ${
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
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
