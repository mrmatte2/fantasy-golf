import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getTournaments, getUserMemberships, joinTournament } from '../lib/supabase';
import { Trophy, LogIn, ChevronRight, Lock, Unlock, Settings, KeyRound, Clock, CheckCircle2 } from 'lucide-react';

const TODAY = new Date().toISOString().slice(0, 10);

function isPast(t) {
  const end = t.pga_tournaments?.sync_end_date;
  return !!end && end < TODAY;
}

const TABS = [
  { key: 'active',    label: 'Active',     icon: CheckCircle2 },
  { key: 'available', label: 'Available',  icon: LogIn },
  { key: 'past',      label: 'Past',       icon: Clock },
];

function TournamentCard({ t, membership, onJoin, onEnter }) {
  const joined = !!membership;
  const past = isPast(t);

  function statusBadge() {
    if (past) return { label: 'Finished', cls: 'bg-white/8 text-white/40 border-white/10' };
    if (t.is_locked) return { label: 'In Progress', cls: 'bg-masters-gold/15 text-masters-gold border-masters-gold/30' };
    if (t.draft_open) return { label: 'Draft Open', cls: 'bg-green-900/30 text-green-400 border-green-800/40' };
    return { label: 'Draft Closed', cls: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/40' };
  }

  const badge = statusBadge();

  return (
    <div className={`rounded-xl border transition-all ${
      joined && !past
        ? 'border-masters-gold/30 bg-masters-gold/5'
        : 'border-white/10 bg-white/3 hover:border-white/20'
    }`}>
      <div className="flex items-center justify-between p-5 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="font-display font-semibold text-masters-cream">{t.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}>
              {badge.label}
            </span>
            {t.current_round > 0 && !past && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-masters-gold/20 text-masters-gold border border-masters-gold/30">
                R{t.current_round}
              </span>
            )}
            {t.join_code && !joined && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/30 border border-white/10 flex items-center gap-1">
                <KeyRound size={9} /> Code required
              </span>
            )}
          </div>
          <div className="text-xs text-white/40 flex items-center gap-3 flex-wrap">
            {t.pga_tournaments?.name && <span>{t.pga_tournaments.name}</span>}
            <span>Budget: £{Number(t.budget).toFixed(0)}</span>
            {!past && (
              <span className="flex items-center gap-1">
                {t.is_locked ? <Lock size={10} /> : <Unlock size={10} />}
                {t.is_locked ? 'Roster locked' : 'Roster open'}
              </span>
            )}
          </div>
          {joined && (
            <div className="text-xs text-masters-gold/70 mt-1.5">
              Your team: <span className="font-medium text-masters-gold">{membership.team_name}</span>
            </div>
          )}
        </div>

        <div className="shrink-0">
          {joined ? (
            <button onClick={onEnter} className="btn-primary flex items-center gap-2 text-sm">
              {past ? 'Results' : 'Enter'} <ChevronRight size={14} />
            </button>
          ) : t.draft_open ? (
            <button onClick={onJoin} className="btn-secondary flex items-center gap-2 text-sm">
              <LogIn size={14} /> Join
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab, isAdmin }) {
  const messages = {
    active:    isAdmin ? 'No active tournaments. Create one in the Admin Panel.' : 'You haven\'t joined any active tournaments yet.',
    available: 'No tournaments are open to join right now.',
    past:      'No past tournaments yet.',
  };
  return (
    <div className="card-dark text-center py-16">
      <Trophy size={32} className="mx-auto mb-3 text-white/20" />
      <p className="text-white/40 text-sm">{messages[tab]}</p>
    </div>
  );
}

export default function TournamentsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [memberships, setMemberships] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');

  // Join modal state
  const [joinModal, setJoinModal] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
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

  function openJoin(t) {
    setJoinModal(t);
    setTeamName('');
    setJoinCode('');
    setJoinError('');
  }

  async function handleJoin() {
    if (!teamName.trim()) { setJoinError('Team name is required.'); return; }
    setJoining(true);
    setJoinError('');
    const { error } = await joinTournament(
      joinModal.id, user.id, teamName.trim(),
      joinCode, joinModal.join_code
    );
    if (error) { setJoinError(error.message); setJoining(false); return; }
    setJoinModal(null);
    await loadData();
    setJoining(false);
    navigate(`/tournament/${joinModal.id}/draft`);
  }

  // Classify tournaments into tabs
  const joined   = (t) => !!memberships[t.id];
  const tabLists = {
    active:    tournaments.filter(t => !isPast(t) && joined(t)),
    available: tournaments.filter(t => !isPast(t) && !joined(t) && t.draft_open),
    past:      tournaments.filter(t => isPast(t)),
  };

  // Auto-switch to a tab with content if the default is empty
  const resolvedTab = tabLists[activeTab].length > 0
    ? activeTab
    : TABS.find(tb => tabLists[tb.key].length > 0)?.key ?? 'active';

  const displayed = tabLists[resolvedTab];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6 animate-fade-up flex items-start justify-between">
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

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white/5 rounded-xl p-1 animate-fade-up-delay-1">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = tabLists[key].length;
          const isActive = resolvedTab === key;
          return (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-masters-dark text-masters-cream shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              }`}>
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-masters-gold/20 text-masters-gold' : 'bg-white/10 text-white/40'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tournament list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : displayed.length === 0 ? (
        <EmptyState tab={resolvedTab} isAdmin={profile?.is_admin} />
      ) : (
        <div className="space-y-3 animate-fade-up-delay-1">
          {displayed.map(t => (
            <TournamentCard
              key={t.id}
              t={t}
              membership={memberships[t.id]}
              onJoin={() => openJoin(t)}
              onEnter={() => navigate(`/tournament/${t.id}/leaderboard`)}
            />
          ))}
        </div>
      )}

      {/* Join modal */}
      {joinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setJoinModal(null)}>
          <div className="card max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-1">Join {joinModal.name}</h3>
            <p className="text-white/40 text-sm mb-5">Choose a team name to start drafting.</p>
            <div className="space-y-3 mb-4">
              {joinModal.join_code && (
                <div>
                  <label className="label flex items-center gap-1.5">
                    <KeyRound size={12} /> Join Code
                  </label>
                  <input
                    value={joinCode}
                    onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
                    className="input font-mono tracking-widest"
                    placeholder="Enter code"
                    autoFocus
                  />
                </div>
              )}
              <div>
                <label className="label">Team Name</label>
                <input
                  value={teamName}
                  onChange={e => { setTeamName(e.target.value); setJoinError(''); }}
                  className="input"
                  placeholder="e.g. Amen Corner FC"
                  autoFocus={!joinModal.join_code}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
              </div>
            </div>
            {joinError && <p className="text-red-400 text-xs mb-3">{joinError}</p>}
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
