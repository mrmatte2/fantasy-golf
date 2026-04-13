import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getTournaments, getUserMemberships, joinTournament } from '../lib/supabase';
import { Trophy, LogIn, ChevronRight, Lock, Unlock, Settings } from 'lucide-react';

export default function TournamentsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [memberships, setMemberships] = useState({});
  const [loading, setLoading] = useState(true);
  const [joinModal, setJoinModal] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: t }, { data: m }] = await Promise.all([
      getTournaments(),
      getUserMemberships(user.id),
    ]);
    setTournaments(t || []);
    const map = {};
    (m || []).forEach(mem => { map[mem.tournament_id] = mem; });
    setMemberships(map);
    setLoading(false);
  }

  async function handleJoin() {
    if (!teamName.trim()) { setJoinError('Team name is required'); return; }
    setJoining(true);
    setJoinError('');
    const { error } = await joinTournament(joinModal.id, user.id, teamName.trim());
    if (error) { setJoinError(error.message); setJoining(false); return; }
    setJoinModal(null);
    setTeamName('');
    await loadData();
    setJoining(false);
    navigate(`/tournament/${joinModal.id}/leaderboard`);
  }

  function statusBadge(t) {
    if (t.is_locked) return { label: 'Locked', cls: 'bg-red-900/30 text-red-400 border-red-800/40' };
    if (t.draft_open) return { label: 'Draft Open', cls: 'bg-green-900/30 text-green-400 border-green-800/40' };
    return { label: 'Draft Closed', cls: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/40' };
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 animate-fade-up flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-masters-cream">Tournaments</h1>
          <p className="text-white/40 text-sm mt-1">Join a tournament and draft your team</p>
        </div>
        {profile?.is_admin && (
          <button onClick={() => navigate('/admin')}
            className="btn-secondary flex items-center gap-2 text-sm">
            <Settings size={14} /> Admin Panel
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : tournaments.length === 0 ? (
        <div className="card-dark text-center py-16">
          <Trophy size={32} className="mx-auto mb-3 text-white/20" />
          <p className="text-white/40 text-sm">
            {profile?.is_admin
              ? 'No tournaments yet. Create one in the Admin Panel.'
              : 'No tournaments available yet. Check back soon.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-up-delay-1">
          {tournaments.map(t => {
            const membership = memberships[t.id];
            const joined = !!membership;
            const badge = statusBadge(t);
            return (
              <div key={t.id} className={`rounded-xl border transition-all ${
                joined ? 'border-masters-gold/30 bg-masters-gold/5' : 'border-white/10 bg-white/3 hover:border-white/20'
              }`}>
                <div className="flex items-center justify-between p-5 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h2 className="font-display font-semibold text-masters-cream">{t.name}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {t.current_round > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-masters-gold/20 text-masters-gold border border-masters-gold/30">
                          Round {t.current_round}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 flex items-center gap-3 flex-wrap">
                      {t.course && <span>{t.course}</span>}
                      {t.year && <span>{t.year}</span>}
                      <span>Budget: £{Number(t.budget).toFixed(0)}</span>
                      <span className="flex items-center gap-1">
                        {t.is_locked ? <Lock size={10} /> : <Unlock size={10} />}
                        {t.is_locked ? 'Roster locked' : 'Roster open'}
                      </span>
                    </div>
                    {joined && (
                      <div className="text-xs text-masters-gold/70 mt-1.5">
                        Your team: <span className="font-medium text-masters-gold">{membership.team_name}</span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0">
                    {joined ? (
                      <button
                        onClick={() => navigate(`/tournament/${t.id}/leaderboard`)}
                        className="btn-primary flex items-center gap-2 text-sm">
                        Enter <ChevronRight size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => { setJoinModal(t); setTeamName(''); setJoinError(''); }}
                        className="btn-secondary flex items-center gap-2 text-sm">
                        <LogIn size={14} /> Join
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Join modal */}
      {joinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setJoinModal(null)}>
          <div className="card max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-1">Join {joinModal.name}</h3>
            <p className="text-white/40 text-sm mb-5">Choose a team name for this tournament.</p>
            <div className="mb-4">
              <label className="label">Team Name</label>
              <input
                value={teamName}
                onChange={e => { setTeamName(e.target.value); setJoinError(''); }}
                className="input"
                placeholder="e.g. Amen Corner FC"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
              {joinError && <p className="text-red-400 text-xs mt-1">{joinError}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={handleJoin} disabled={joining} className="btn-primary flex-1">
                {joining ? 'Joining…' : 'Join & Draft'}
              </button>
              <button onClick={() => setJoinModal(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
