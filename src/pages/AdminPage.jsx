import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getTournaments, createTournament, updateTournament, deleteTournament,
  getAllPlayers, updatePlayer, createPlayer, deletePlayer,
  getAllProfiles, updateProfile,
  getPlayers, getAllScores, upsertScore, getHolePars,
} from '../lib/supabase';
import { Settings, Lock, Unlock, Edit3, Save, X, RefreshCw, Plus, Trash2, Trophy, Users, BarChart3 } from 'lucide-react';

const TABS = ['Tournaments', 'Scores', 'Players', 'Users'];

// ─── Tournaments Tab ──────────────────────────────────────────────────────────
function TournamentsTab({ currentUserId }) {
  const [tournaments, setTournaments] = useState([]);
  const [modal, setModal] = useState(null); // null | 'create' | tournament object (edit)
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await getTournaments();
    setTournaments(data || []);
  }

  function openCreate() {
    setForm({ name: '', course: '', year: new Date().getFullYear(), budget: 100, current_round: 0, draft_open: true, is_locked: false });
    setModal('create');
  }

  function openEdit(t) {
    setForm({ name: t.name, course: t.course || '', year: t.year || '', budget: t.budget, current_round: t.current_round, draft_open: t.draft_open, is_locked: t.is_locked });
    setModal(t);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    if (modal === 'create') {
      await createTournament({ ...form, created_by: currentUserId });
    } else {
      await updateTournament(modal.id, form);
    }
    setModal(null);
    await load();
    setSaving(false);
  }

  async function handleDelete(t) {
    await deleteTournament(t.id);
    setDeleteConfirm(null);
    await load();
  }

  async function quickUpdate(t, updates) {
    await updateTournament(t.id, updates);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">Create and manage fantasy tournaments. Each tournament uses the global player list.</p>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> New Tournament
        </button>
      </div>

      {tournaments.length === 0 ? (
        <div className="card-dark text-center py-12 text-white/30">
          <Trophy size={28} className="mx-auto mb-2 opacity-30" />
          No tournaments yet. Create one above.
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map(t => (
            <div key={t.id} className="card-dark">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-display font-semibold text-masters-cream">{t.name}</span>
                    {t.current_round > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-masters-gold/20 text-masters-gold border border-masters-gold/30">
                        R{t.current_round}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/40">
                    {[t.course, t.year, `£${t.budget} budget`].filter(Boolean).join(' · ')}
                  </div>

                  {/* Quick controls */}
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <div>
                      <label className="text-xs text-white/30 block mb-1">Round</label>
                      <div className="flex gap-1">
                        {[0,1,2,3,4].map(r => (
                          <button key={r} onClick={() => quickUpdate(t, { current_round: r })}
                            className={`w-8 h-7 rounded text-xs font-medium transition-colors ${
                              t.current_round === r
                                ? 'bg-masters-gold/20 text-masters-gold border border-masters-gold/40'
                                : 'border border-white/10 text-white/40 hover:text-white/70'
                            }`}>
                            {r === 0 ? 'P' : r}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button onClick={() => quickUpdate(t, { is_locked: !t.is_locked })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        t.is_locked
                          ? 'bg-red-900/30 text-red-400 border-red-800/40 hover:bg-red-800/40'
                          : 'bg-green-900/30 text-green-400 border-green-800/40 hover:bg-green-800/40'
                      }`}>
                      {t.is_locked ? <Lock size={11} /> : <Unlock size={11} />}
                      {t.is_locked ? 'Locked' : 'Open'}
                    </button>

                    <button onClick={() => quickUpdate(t, { draft_open: !t.draft_open })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        t.draft_open
                          ? 'bg-green-900/30 text-green-400 border-green-800/40 hover:bg-green-800/40'
                          : 'bg-yellow-900/30 text-yellow-400 border-yellow-800/40 hover:bg-yellow-800/40'
                      }`}>
                      {t.draft_open ? 'Draft Open' : 'Draft Closed'}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(t)}
                    className="p-2 rounded-lg text-white/30 hover:text-masters-gold hover:bg-masters-gold/10 transition-colors">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => setDeleteConfirm(t)}
                    className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setModal(null)}>
          <div className="card max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-5">
              {modal === 'create' ? 'New Tournament' : `Edit: ${modal.name}`}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label">Tournament Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="e.g. The Masters 2025" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Course</label>
                  <input value={form.course} onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
                    className="input" placeholder="e.g. Augusta National" />
                </div>
                <div>
                  <label className="label">Year</label>
                  <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                    className="input" />
                </div>
              </div>
              <div>
                <label className="label">Budget per team (£)</label>
                <input type="number" step="10" value={form.budget}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  className="input" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={form.draft_open}
                    onChange={e => setForm(f => ({ ...f, draft_open: e.target.checked }))} />
                  Draft Open
                </label>
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={form.is_locked}
                    onChange={e => setForm(f => ({ ...f, is_locked: e.target.checked }))} />
                  Roster Locked
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setDeleteConfirm(null)}>
          <div className="card max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-2">Delete Tournament?</h3>
            <p className="text-white/40 text-sm mb-5">
              This will permanently delete <strong className="text-white/70">{deleteConfirm.name}</strong> and all its rosters and scores. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)}
                className="btn-danger flex-1">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scores Tab ───────────────────────────────────────────────────────────────
function ScoresTab() {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [players, setPlayers] = useState([]);
  const [pars, setPars] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [selectedRound, setSelectedRound] = useState(1);
  const [holeScores, setHoleScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getTournaments().then(({ data }) => setTournaments(data || []));
    getPlayers().then(({ data }) => setPlayers(data || []));
    getHolePars().then(({ data }) => setPars(data || []));
  }, []);

  useEffect(() => {
    if (!selectedPlayer || !selectedTournamentId) return;
    getAllScores(selectedTournamentId, selectedRound).then(({ data }) => {
      const playerScores = (data || []).filter(s => s.player_id === selectedPlayer);
      const map = {};
      playerScores.forEach(s => { map[s.hole] = s.strokes; });
      setHoleScores(map);
    });
  }, [selectedPlayer, selectedRound, selectedTournamentId]);

  async function handleSave() {
    if (!selectedPlayer || !selectedTournamentId) return;
    setSaving(true);
    for (const par of pars) {
      const strokes = holeScores[par.hole];
      if (strokes !== undefined && strokes !== '') {
        await upsertScore(selectedPlayer, selectedTournamentId, selectedRound, par.hole, parseInt(strokes), par.par);
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const playerObj = players.find(p => p.id === selectedPlayer);

  return (
    <div className="space-y-4">
      <div className="card-dark">
        <h3 className="font-display font-semibold text-masters-cream mb-4">Enter Scores</h3>

        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="label">Tournament</label>
            <select value={selectedTournamentId} onChange={e => { setSelectedTournamentId(e.target.value); setSelectedPlayer(''); }}
              className="input appearance-none">
              <option value="">Select tournament…</option>
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className="label">Player</label>
            <select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}
              className="input appearance-none" disabled={!selectedTournamentId}>
              <option value="">Select player…</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                  }`}>R{r}</button>
              ))}
            </div>
          </div>
        </div>

        {selectedPlayer && selectedTournamentId && (
          <>
            <div className="text-sm text-white/50 mb-4">
              <span className="text-masters-cream font-medium">{playerObj?.name}</span> · Round {selectedRound} · Par 72
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
              {pars.map(p => {
                const strokes = holeScores[p.hole] ?? '';
                const vsPar = strokes !== '' ? parseInt(strokes) - p.par : null;
                return (
                  <div key={p.hole} className={`rounded-lg border p-2 text-center transition-colors ${
                    vsPar === null ? 'border-white/10'
                    : vsPar < 0 ? 'border-red-500/40 bg-red-900/20'
                    : vsPar > 0 ? 'border-blue-500/30 bg-blue-900/15'
                    : 'border-white/20 bg-white/5'
                  }`}>
                    <div className="text-xs text-white/30 mb-1">H{p.hole} · P{p.par}</div>
                    <input type="number" min="1" max="15" value={strokes}
                      onChange={e => setHoleScores(h => ({ ...h, [p.hole]: e.target.value }))}
                      className="w-full bg-transparent text-center text-masters-cream font-mono text-lg font-bold focus:outline-none"
                      placeholder="—" />
                    {vsPar !== null && (
                      <div className={`text-xs font-mono mt-0.5 ${vsPar < 0 ? 'text-red-400' : vsPar > 0 ? 'text-blue-300' : 'text-white/40'}`}>
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

// ─── Players Tab ──────────────────────────────────────────────────────────────
function PlayersTab() {
  const [players, setPlayers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addModal, setAddModal] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', country: '', world_ranking: '', odds_fractional: '', odds_decimal: '', form_score: 5, price: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await getAllPlayers();
    setPlayers(data || []);
  }

  function startEdit(player) {
    setEditing(player.id);
    setEditForm({
      price_override: player.price_override ?? '',
      price: player.price ?? '',
      form_score: player.form_score ?? '',
      is_withdrawn: player.is_withdrawn,
      made_cut: player.made_cut,
      is_active: player.is_active,
      odds_fractional: player.odds_fractional ?? '',
      world_ranking: player.world_ranking ?? '',
    });
  }

  async function saveEdit(player) {
    setSaving(true);
    await updatePlayer(player.id, {
      price_override: editForm.price_override !== '' ? parseFloat(editForm.price_override) : null,
      price: editForm.price !== '' ? parseFloat(editForm.price) : player.price,
      form_score: editForm.form_score !== '' ? parseFloat(editForm.form_score) : player.form_score,
      is_withdrawn: editForm.is_withdrawn,
      made_cut: editForm.made_cut,
      is_active: editForm.is_active,
      odds_fractional: editForm.odds_fractional || player.odds_fractional,
      world_ranking: editForm.world_ranking !== '' ? parseInt(editForm.world_ranking) : player.world_ranking,
    });
    await load();
    setEditing(null);
    setSaving(false);
  }

  async function handleAdd() {
    if (!newForm.name.trim()) return;
    setSaving(true);
    await createPlayer({
      name: newForm.name.trim(),
      country: newForm.country || null,
      world_ranking: newForm.world_ranking ? parseInt(newForm.world_ranking) : null,
      odds_fractional: newForm.odds_fractional || null,
      odds_decimal: newForm.odds_decimal ? parseFloat(newForm.odds_decimal) : null,
      form_score: newForm.form_score ? parseFloat(newForm.form_score) : 5,
      price: newForm.price ? parseFloat(newForm.price) : null,
    });
    await load();
    setAddModal(false);
    setNewForm({ name: '', country: '', world_ranking: '', odds_fractional: '', odds_decimal: '', form_score: 5, price: '' });
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">Global player list — update odds and prices before each event.</p>
        <button onClick={() => setAddModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
          <Plus size={14} /> Add Player
        </button>
      </div>

      {players.map(player => (
        <div key={player.id} className={`card-dark ${!player.is_active ? 'opacity-50' : ''}`}>
          {editing === player.id ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-display font-semibold text-masters-cream">{player.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(player)} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                    <Save size={12} /> Save
                  </button>
                  <button onClick={() => setEditing(null)} className="btn-secondary text-xs px-3 py-1.5"><X size={12} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="label">Base Price</label>
                  <input type="number" step="0.5" value={editForm.price}
                    onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                    className="input" />
                </div>
                <div>
                  <label className="label">Price Override</label>
                  <input type="number" step="0.5" value={editForm.price_override}
                    onChange={e => setEditForm(f => ({ ...f, price_override: e.target.value }))}
                    className="input" placeholder="blank = use base" />
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
              <div className="flex gap-4 mt-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={editForm.is_active}
                    onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Active (in field)
                </label>
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={editForm.is_withdrawn}
                    onChange={e => setEditForm(f => ({ ...f, is_withdrawn: e.target.checked }))} />
                  Withdrawn (WD)
                </label>
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={!editForm.made_cut}
                    onChange={e => setEditForm(f => ({ ...f, made_cut: !e.target.checked }))} />
                  Missed Cut
                </label>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-masters-cream text-sm">{player.name}</span>
                  {!player.is_active && <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/40">Inactive</span>}
                  {player.is_withdrawn && <span className="badge-wd">WD</span>}
                  {!player.made_cut && <span className="badge-cut">CUT</span>}
                </div>
                <div className="text-xs text-white/30 mt-0.5">
                  #{player.world_ranking} · {player.odds_fractional} · Form: {player.form_score}
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

      {/* Add player modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setAddModal(false)}>
          <div className="card max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-5">Add Player</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Name *</label>
                <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="Full name" />
              </div>
              <div>
                <label className="label">Country</label>
                <input value={newForm.country} onChange={e => setNewForm(f => ({ ...f, country: e.target.value }))}
                  className="input" placeholder="e.g. USA" />
              </div>
              <div>
                <label className="label">World Ranking</label>
                <input type="number" value={newForm.world_ranking}
                  onChange={e => setNewForm(f => ({ ...f, world_ranking: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="label">Odds (e.g. 12/1)</label>
                <input value={newForm.odds_fractional}
                  onChange={e => setNewForm(f => ({ ...f, odds_fractional: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="label">Price (£)</label>
                <input type="number" step="0.5" value={newForm.price}
                  onChange={e => setNewForm(f => ({ ...f, price: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="label">Form (0-10)</label>
                <input type="number" step="0.1" min="0" max="10" value={newForm.form_score}
                  onChange={e => setNewForm(f => ({ ...f, form_score: e.target.value }))}
                  className="input" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleAdd} disabled={saving || !newForm.name.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                Add Player
              </button>
              <button onClick={() => setAddModal(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
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
                <span className="text-xs px-2 py-0.5 rounded-full bg-masters-gold/20 text-masters-gold border border-masters-gold/30">Admin</span>
              )}
            </div>
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Tournaments');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 animate-fade-up flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-masters-gold/15 border border-masters-gold/30 flex items-center justify-center">
          <Settings size={18} className="text-masters-gold" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-masters-cream">Admin Panel</h1>
          <p className="text-white/40 text-sm">Tournaments · Scores · Players · Users</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-black/30 border border-white/5 w-fit animate-fade-up-delay-1 flex-wrap">
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
        {activeTab === 'Tournaments' && <TournamentsTab currentUserId={user?.id} />}
        {activeTab === 'Scores'      && <ScoresTab />}
        {activeTab === 'Players'     && <PlayersTab />}
        {activeTab === 'Users'       && <UsersTab />}
      </div>
    </div>
  );
}
