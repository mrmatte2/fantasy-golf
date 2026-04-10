import React, { useState, useEffect, useCallback } from 'react';
import { useTournament } from '../../hooks/useTournament';
import {
  updateTournamentState, getPlayers, updatePlayer, getAllProfiles, updateProfile,
  upsertScore, getHolePars, getAllScores, getAllRosters
} from '../../lib/supabase';
import { Settings, Lock, Unlock, Users, Trophy, Edit3, Save, X, RefreshCw, ChevronDown } from 'lucide-react';

const TABS = ['Tournament', 'Scores', 'Players', 'Users'];

// ─── Tournament Control ───────────────────────────────────────────────────────
function TournamentTab({ state, onRefresh }) {
  const [saving, setSaving] = useState(false);

  async function toggleLock() {
    setSaving(true);
    await updateTournamentState({ is_locked: !state.is_locked });
    onRefresh();
    setSaving(false);
  }

  async function toggleDraft() {
    setSaving(true);
    await updateTournamentState({ draft_open: !state.draft_open });
    onRefresh();
    setSaving(false);
  }

  async function setRound(r) {
    setSaving(true);
    await updateTournamentState({ current_round: r });
    onRefresh();
    setSaving(false);
  }

  if (!state) return <div className="skeleton h-40 rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="card-dark">
        <h3 className="font-display font-semibold text-masters-cream mb-4">Tournament Status</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Current round */}
          <div>
            <label className="label">Current Round</label>
            <div className="flex gap-2 flex-wrap">
              {[0,1,2,3,4].map(r => (
                <button key={r}
                  onClick={() => setRound(r)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    state.current_round === r
                      ? 'bg-masters-gold/20 text-masters-gold border border-masters-gold/40'
                      : 'border border-white/10 text-white/50 hover:text-white/80'
                  }`}>
                  {r === 0 ? 'Pre' : `R${r}`}
                </button>
              ))}
            </div>
          </div>

          {/* Roster lock */}
          <div>
            <label className="label">Roster Lock</label>
            <button onClick={toggleLock} disabled={saving}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                state.is_locked
                  ? 'bg-red-900/40 text-red-300 border border-red-800/40 hover:bg-red-800/50'
                  : 'bg-green-900/40 text-green-300 border border-green-800/40 hover:bg-green-800/50'
              }`}>
              {state.is_locked ? <Lock size={14} /> : <Unlock size={14} />}
              {state.is_locked ? 'Locked — Click to Unlock' : 'Open — Click to Lock'}
            </button>
          </div>

          {/* Draft */}
          <div>
            <label className="label">Draft Phase</label>
            <button onClick={toggleDraft} disabled={saving}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                state.draft_open
                  ? 'bg-green-900/40 text-green-300 border border-green-800/40 hover:bg-green-800/50'
                  : 'bg-yellow-900/40 text-yellow-300 border border-yellow-800/40 hover:bg-yellow-800/50'
              }`}>
              {state.draft_open ? 'Draft Open' : 'Draft Closed'}
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-white/30 border-t border-white/5 pt-4">
          Last updated: {new Date(state.updated_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ─── Score Entry ──────────────────────────────────────────────────────────────
function ScoresTab() {
  const { tournamentState } = useTournament();
  const [players, setPlayers] = useState([]);
  const [pars, setPars] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [selectedRound, setSelectedRound] = useState(1);
  const [holeScores, setHoleScores] = useState({});
  const [existingScores, setExistingScores] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPlayers().then(({ data }) => setPlayers(data || []));
    getHolePars().then(({ data }) => setPars(data || []));
  }, []);

  useEffect(() => {
    if (!selectedPlayer) return;
    getAllScores(selectedRound).then(({ data }) => {
      const playerScores = (data || []).filter(s => s.player_id === selectedPlayer);
      const map = {};
      playerScores.forEach(s => { map[s.hole] = s.strokes; });
      setHoleScores(map);
      setExistingScores(playerScores);
    });
  }, [selectedPlayer, selectedRound]);

  async function handleSave() {
    if (!selectedPlayer) return;
    setSaving(true);
    for (const par of pars) {
      const strokes = holeScores[par.hole];
      if (strokes !== undefined && strokes !== '') {
        await upsertScore(selectedPlayer, selectedRound, par.hole, parseInt(strokes), par.par);
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const currentRound = tournamentState?.current_round || 1;
  const playerObj = players.find(p => p.id === selectedPlayer);

  return (
    <div className="space-y-4">
      <div className="card-dark">
        <h3 className="font-display font-semibold text-masters-cream mb-4">Enter Scores</h3>

        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="label">Player</label>
            <select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}
              className="input appearance-none">
              <option value="">Select player…</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Round</label>
            <div className="flex gap-2">
              {[1,2,3,4].map(r => (
                <button key={r} onClick={() => setSelectedRound(r)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    selectedRound === r
                      ? 'bg-masters-gold/20 text-masters-gold border-masters-gold/40'
                      : 'border-white/10 text-white/50 hover:text-white/80'
                  }`}>
                  R{r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedPlayer && (
          <>
            <div className="text-sm text-white/50 mb-4">
              Entering scores for <span className="text-masters-cream font-medium">{playerObj?.name}</span> — Round {selectedRound}
              &nbsp;· Par 72
            </div>

            {/* Score grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
              {pars.map(p => {
                const strokes = holeScores[p.hole] ?? '';
                const vsPar = strokes !== '' ? parseInt(strokes) - p.par : null;
                return (
                  <div key={p.hole} className={`rounded-lg border p-2 text-center transition-colors ${
                    vsPar === null ? 'border-white/10 bg-white/3'
                    : vsPar < 0 ? 'border-red-500/40 bg-red-900/20'
                    : vsPar > 0 ? 'border-blue-500/30 bg-blue-900/15'
                    : 'border-white/20 bg-white/5'
                  }`}>
                    <div className="text-xs text-white/30 mb-1">H{p.hole} · P{p.par}</div>
                    <input
                      type="number" min="1" max="15"
                      value={strokes}
                      onChange={e => setHoleScores(h => ({ ...h, [p.hole]: e.target.value }))}
                      className="w-full bg-transparent text-center text-masters-cream font-mono text-lg font-bold focus:outline-none"
                      placeholder="—"
                    />
                    {vsPar !== null && (
                      <div className={`text-xs font-mono mt-0.5 ${
                        vsPar < 0 ? 'text-red-400' : vsPar > 0 ? 'text-blue-300' : 'text-white/40'
                      }`}>
                        {vsPar === 0 ? 'E' : vsPar > 0 ? `+${vsPar}` : vsPar}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Scores'}
              </button>
              <span className="text-xs text-white/30">
                {Object.values(holeScores).filter(v => v !== '').length} of 18 holes entered
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Player Management ────────────────────────────────────────────────────────
function PlayersTab() {
  const [players, setPlayers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPlayers().then(({ data }) => setPlayers(data || []));
  }, []);

  function startEdit(player) {
    setEditing(player.id);
    setEditForm({
      price_override: player.price_override ?? '',
      form_score: player.form_score ?? '',
      is_withdrawn: player.is_withdrawn,
      made_cut: player.made_cut,
      odds_fractional: player.odds_fractional ?? '',
      world_ranking: player.world_ranking ?? '',
    });
  }

  async function saveEdit(player) {
    setSaving(true);
    const updates = {
      price_override: editForm.price_override !== '' ? parseFloat(editForm.price_override) : null,
      form_score: editForm.form_score !== '' ? parseFloat(editForm.form_score) : player.form_score,
      is_withdrawn: editForm.is_withdrawn,
      made_cut: editForm.made_cut,
      odds_fractional: editForm.odds_fractional || player.odds_fractional,
      world_ranking: editForm.world_ranking !== '' ? parseInt(editForm.world_ranking) : player.world_ranking,
    };
    await updatePlayer(player.id, updates);
    const { data } = await getPlayers();
    setPlayers(data || []);
    setEditing(null);
    setSaving(false);
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-white/30 mb-3">
        Set price overrides, form scores, WD/cut status. Price override of blank = use calculated price.
      </div>
      {players.map(player => (
        <div key={player.id} className="card-dark">
          {editing === player.id ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-display font-semibold text-masters-cream">{player.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(player)} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                    <Save size={12} /> Save
                  </button>
                  <button onClick={() => setEditing(null)} className="btn-secondary text-xs px-3 py-1.5">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="label">Price Override</label>
                  <input type="number" step="0.5" value={editForm.price_override}
                    onChange={e => setEditForm(f => ({ ...f, price_override: e.target.value }))}
                    className="input" placeholder={`calc: ${player.price?.toFixed(1)}`} />
                </div>
                <div>
                  <label className="label">Form (0-10)</label>
                  <input type="number" step="0.1" min="0" max="10" value={editForm.form_score}
                    onChange={e => setEditForm(f => ({ ...f, form_score: e.target.value }))}
                    className="input" />
                </div>
                <div>
                  <label className="label">World Ranking</label>
                  <input type="number" value={editForm.world_ranking}
                    onChange={e => setEditForm(f => ({ ...f, world_ranking: e.target.value }))}
                    className="input" />
                </div>
                <div>
                  <label className="label">Odds</label>
                  <input type="text" value={editForm.odds_fractional}
                    onChange={e => setEditForm(f => ({ ...f, odds_fractional: e.target.value }))}
                    className="input" placeholder="e.g. 12/1" />
                </div>
              </div>
              <div className="flex gap-4 mt-3">
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={editForm.is_withdrawn}
                    onChange={e => setEditForm(f => ({ ...f, is_withdrawn: e.target.checked }))}
                    className="rounded" />
                  Withdrawn (WD)
                </label>
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={!editForm.made_cut}
                    onChange={e => setEditForm(f => ({ ...f, made_cut: !e.target.checked }))}
                    className="rounded" />
                  Missed Cut
                </label>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-masters-cream text-sm">{player.name}</span>
                    {player.is_withdrawn && <span className="badge-wd">WD</span>}
                    {!player.made_cut && <span className="badge-cut">CUT</span>}
                  </div>
                  <div className="text-xs text-white/30">
                    #{player.world_ranking} · {player.odds_fractional} · Form: {player.form_score}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-mono text-sm text-masters-gold">
                    £{(player.price_override ?? player.price)?.toFixed(1)}
                  </div>
                  {player.price_override && (
                    <div className="text-xs text-white/30 line-through">£{player.price?.toFixed(1)}</div>
                  )}
                </div>
                <button onClick={() => startEdit(player)}
                  className="p-2 rounded-lg text-white/30 hover:text-masters-gold hover:bg-masters-gold/10 transition-colors">
                  <Edit3 size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── User Management ──────────────────────────────────────────────────────────
function UsersTab() {
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    getAllProfiles().then(({ data }) => setProfiles(data || []));
  }, []);

  async function toggleAdmin(profile) {
    await updateProfile(profile.id, { is_admin: !profile.is_admin });
    const { data } = await getAllProfiles();
    setProfiles(data || []);
  }

  return (
    <div className="space-y-3">
      {profiles.map(p => (
        <div key={p.id} className="card-dark flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-masters-cream">{p.username}</span>
              {p.is_admin && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-masters-gold/20 text-masters-gold border border-masters-gold/30">
                  Admin
                </span>
              )}
            </div>
            <div className="text-xs text-white/40">{p.team_name}</div>
          </div>
          <button onClick={() => toggleAdmin(p)}
            className={p.is_admin ? 'btn-danger text-xs' : 'btn-secondary text-xs'}>
            {p.is_admin ? 'Remove Admin' : 'Make Admin'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPage() {
  const { tournamentState, refreshTournament } = useTournament();
  const [activeTab, setActiveTab] = useState('Tournament');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 animate-fade-up flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-masters-gold/15 border border-masters-gold/30 flex items-center justify-center">
          <Settings size={18} className="text-masters-gold" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-masters-cream">Admin Panel</h1>
          <p className="text-white/40 text-sm">Tournament management · Scores · Players</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-black/30 border border-white/5 w-fit animate-fade-up-delay-1">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-masters-gold/20 text-masters-gold border border-masters-gold/30'
                : 'text-white/40 hover:text-white/70'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      <div className="animate-fade-up-delay-2">
        {activeTab === 'Tournament' && <TournamentTab state={tournamentState} onRefresh={refreshTournament} />}
        {activeTab === 'Scores' && <ScoresTab />}
        {activeTab === 'Players' && <PlayersTab />}
        {activeTab === 'Users' && <UsersTab />}
      </div>
    </div>
  );
}
