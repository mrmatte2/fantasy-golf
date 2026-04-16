import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getTournaments, createTournament, updateTournament, deleteTournament,
  supabase,
  getPgaTournaments, createPgaTournament, updatePgaTournament, deletePgaTournament,
  getPgaField, upsertPgaField, getPgaHolePars, upsertPgaHolePars, getPgaFieldCounts,
  getAllPlayers, updatePlayer, createPlayer,
  getAllProfiles, updateProfile,
  getPlayers, getAllScores, upsertScore,
  getTournamentPlayers, upsertTournamentPlayers, getPlayerScores,
} from '../lib/supabase';
import { Settings, Lock, Unlock, Edit3, Save, X, RefreshCw, Plus, Trash2, Trophy, ChevronLeft, Users, Calendar } from 'lucide-react';

const TABS = ['PGA Events', 'Tournaments', 'Field Pricing', 'Scores', 'Players', 'Users'];

// ─── PGA Events Tab ───────────────────────────────────────────────────────────
function formatDateRange(start, end) {
  if (!start && !end) return null;
  const fmt = d => {
    const dt = new Date(d + 'T12:00:00Z');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end)}`;
}

function eventStatus(event) {
  const today = new Date().toISOString().slice(0, 10);
  if (!event.sync_enabled) {
    if (event.sync_start_date && today < event.sync_start_date)
      return { label: 'Upcoming', cls: 'bg-blue-900/30 text-blue-300 border-blue-800/40' };
    if (event.sync_end_date && today > event.sync_end_date)
      return { label: 'Past', cls: 'bg-white/5 text-white/30 border-white/10' };
    return { label: 'Sync off', cls: 'bg-white/5 text-white/30 border-white/10' };
  }
  if (event.sync_start_date && today < event.sync_start_date) {
    const days = Math.ceil((new Date(event.sync_start_date) - new Date()) / 86400000);
    return { label: `In ${days}d`, cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-800/40' };
  }
  if (event.sync_end_date && today > event.sync_end_date)
    return { label: 'Ended', cls: 'bg-white/5 text-white/40 border-white/10' };
  return { label: 'Live', cls: 'bg-green-900/30 text-green-300 border-green-800/40' };
}

function isPast(event) {
  const today = new Date().toISOString().slice(0, 10);
  return event.sync_end_date && today > event.sync_end_date;
}

function PgaEventsTab() {
  const [events, setEvents] = useState([]);
  const [fieldCounts, setFieldCounts] = useState({});
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [selectedId, setSelectedId] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', course: '', year: new Date().getFullYear() });
  const [infoForm, setInfoForm] = useState({});
  const [syncForm, setSyncForm] = useState({});
  const [holePars, setHolePars] = useState({});
  const [allPlayers, setAllPlayers] = useState([]);
  const [fieldMap, setFieldMap] = useState({});
  const [saving, setSaving] = useState(''); // 'info' | 'sync' | 'pars' | 'field'
  const [savedSection, setSavedSection] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    loadEvents();
    getAllPlayers().then(({ data }) => setAllPlayers(data || []));
    getPgaFieldCounts().then(counts => setFieldCounts(counts));
  }, []);

  useEffect(() => {
    if (!selectedId || !events.length) return;
    const event = events.find(e => e.id === selectedId);
    if (!event) return;
    setInfoForm({ name: event.name, course: event.course || '', year: event.year || '' });
    setSyncForm({
      sync_url: event.sync_url || '',
      sync_format: event.sync_format || 'espn',
      sync_start_date: event.sync_start_date || '',
      sync_end_date: event.sync_end_date || '',
      sync_enabled: event.sync_enabled || false,
    });
    getPgaHolePars(selectedId).then(({ data }) => {
      const map = {};
      (data || []).forEach(p => { map[p.hole] = p.par; });
      setHolePars(map);
    });
    getPgaField(selectedId).then(({ data }) => {
      const map = {};
      (data || []).forEach(fp => { map[fp.player_id] = true; });
      setFieldMap(map);
    });
  }, [selectedId, events]);

  async function loadEvents() {
    const { data } = await getPgaTournaments();
    setEvents(data || []);
  }

  function openEvent(id) {
    setSelectedId(id);
    setView('detail');
  }

  function markSaved(section) {
    setSavedSection(section);
    setTimeout(() => setSavedSection(''), 2000);
  }

  async function handleCreate() {
    if (!createForm.name.trim()) return;
    const { data } = await createPgaTournament({
      name: createForm.name.trim(),
      course: createForm.course || null,
      year: createForm.year ? parseInt(createForm.year) : null,
    });
    setCreateModal(false);
    setCreateForm({ name: '', course: '', year: new Date().getFullYear() });
    await loadEvents();
    if (data) openEvent(data.id);
  }

  async function handleDelete() {
    await deletePgaTournament(selectedId);
    setDeleteConfirm(false);
    setSelectedId('');
    setView('list');
    await loadEvents();
  }

  async function saveInfo() {
    setSaving('info');
    await updatePgaTournament(selectedId, {
      name: infoForm.name,
      course: infoForm.course || null,
      year: infoForm.year ? parseInt(infoForm.year) : null,
    });
    await loadEvents();
    setSaving('');
    markSaved('info');
  }

  async function saveSync() {
    setSaving('sync');
    await updatePgaTournament(selectedId, {
      sync_url: syncForm.sync_url || null,
      sync_format: syncForm.sync_format,
      sync_start_date: syncForm.sync_start_date || null,
      sync_end_date: syncForm.sync_end_date || null,
      sync_enabled: syncForm.sync_enabled,
    });
    await loadEvents();
    setSaving('');
    markSaved('sync');
  }

  async function saveHolePars() {
    setSaving('pars');
    const pars = Object.entries(holePars)
      .filter(([, par]) => par !== '' && par !== undefined)
      .map(([hole, par]) => ({ hole: parseInt(hole), par: parseInt(par) }));
    await upsertPgaHolePars(selectedId, pars);
    setSaving('');
    markSaved('pars');
  }

  async function saveField() {
    setSaving('field');

    // Create any new players from the paste import, then add them to the field
    let currentFieldMap = { ...fieldMap };
    if (importNewNames.length) {
      for (const name of importNewNames) {
        const { data: newPlayer } = await supabase
          .from('players')
          .insert({ name, is_active: true })
          .select('id, name')
          .single();
        if (newPlayer) {
          currentFieldMap[newPlayer.id] = true;
          setAllPlayers(prev => [...prev, newPlayer]);
        }
      }
      setImportNewNames([]);
      setFieldMap(currentFieldMap);
    }

    const entries = Object.entries(currentFieldMap).map(([player_id, is_in_field]) => ({ player_id, is_in_field }));
    await upsertPgaField(selectedId, entries);
    getPgaFieldCounts().then(counts => setFieldCounts(counts));
    setSaving('');
    markSaved('field');
  }

  function getSyncStatus() {
    if (!syncForm.sync_enabled) return { label: 'Disabled', cls: 'bg-white/5 text-white/30 border-white/10' };
    const today = new Date().toISOString().slice(0, 10);
    if (syncForm.sync_start_date && today < syncForm.sync_start_date) {
      const days = Math.ceil((new Date(syncForm.sync_start_date) - new Date()) / 86400000);
      return { label: `Starts in ${days}d`, cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-800/40' };
    }
    if (syncForm.sync_end_date && today > syncForm.sync_end_date)
      return { label: 'Ended', cls: 'bg-white/5 text-white/40 border-white/10' };
    return { label: 'Active now', cls: 'bg-green-900/30 text-green-300 border-green-800/40' };
  }

  const [fieldSearch, setFieldSearch] = useState('');
  const [importModal, setImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState(null); // null | { matched, newPlayers, names }

  // Exhaustive list of countries/territories that appear in PGA Tour data.
  // Any line matching one of these is silently dropped during import.
  const GOLF_COUNTRIES = new Set([
    'argentina','australia','austria','bahamas','barbados','belgium','brazil',
    'canada','chile','china','colombia','costa rica','czech republic','denmark',
    'england','fiji','finland','france','germany','ghana','great britain',
    'hungary','india','indonesia','ireland','italy','jamaica','japan',
    'kenya','korea','malaysia','mexico','namibia','netherlands','new zealand',
    'nicaragua','nigeria','northern ireland','norway','panama','paraguay',
    'peru','philippines','portugal','puerto rico','qatar','russia','scotland',
    'singapore','south africa','south korea','spain','sweden','switzerland',
    'taiwan','thailand','trinidad and tobago','turkey','ukraine','united states',
    'usa','us','uk','uruguay','venezuela','wales','zimbabwe',
  ]);

  function parseAndPreview(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Drop any line that is a known country name (case-insensitive).
    // Everything else is treated as a player name — order-independent.
    const names = lines.filter(l => !GOLF_COUNTRIES.has(l.toLowerCase()));

    const norm = n => n.toLowerCase().trim().replace(/\s+/g, ' ');
    const matched = [];
    const newPlayers = [];
    for (const name of names) {
      const player = allPlayers.find(p => norm(p.name) === norm(name));
      if (player) matched.push({ name, player });
      else newPlayers.push({ name });
    }
    setImportPreview({ matched, newPlayers, total: names.length });
  }

  function applyImport() {
    if (!importPreview) return;
    const updates = {};
    for (const { player } of importPreview.matched) updates[player.id] = true;
    // New players won't have IDs yet — they'll be created on Save Field
    // Store them separately so saveField can handle them
    setImportNewNames(importPreview.newPlayers.map(p => p.name));
    setFieldMap(m => ({ ...m, ...updates }));
    setImportModal(false);
    setImportText('');
    setImportPreview(null);
  }

  const [importNewNames, setImportNewNames] = useState([]);

  const inField = allPlayers
    .filter(p => fieldMap[p.id])
    .filter(p => !fieldSearch || p.name.toLowerCase().includes(fieldSearch.toLowerCase()) || (p.country || '').toLowerCase().includes(fieldSearch.toLowerCase()))
    .sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999));
  const notInField = allPlayers
    .filter(p => !fieldMap[p.id])
    .filter(p => !fieldSearch || p.name.toLowerCase().includes(fieldSearch.toLowerCase()) || (p.country || '').toLowerCase().includes(fieldSearch.toLowerCase()))
    .sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999));
  const inFieldCount = Object.values(fieldMap).filter(Boolean).length;
  const parsEntered = Object.values(holePars).filter(p => p !== '' && p !== undefined).length;
  const parTotal = Object.values(holePars).reduce((s, p) => s + (parseInt(p) || 0), 0);
  const syncStatus = getSyncStatus();

  // Sort events by start date ascending (no date = end of list)
  const sortedEvents = [...events].sort((a, b) => {
    const da = a.sync_start_date || '9999';
    const db = b.sync_start_date || '9999';
    return da.localeCompare(db);
  });
  const visibleEvents = showPast ? sortedEvents : sortedEvents.filter(e => !isPast(e));
  const pastCount = sortedEvents.filter(e => isPast(e)).length;

  return (
    <div className="space-y-4">
      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-masters-cream">PGA Events</h2>
              <p className="text-xs text-white/30 mt-0.5">{events.length} events total · {pastCount} past</p>
            </div>
            <div className="flex items-center gap-2">
              {pastCount > 0 && (
                <button onClick={() => setShowPast(p => !p)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    showPast
                      ? 'bg-white/10 text-white/60 border-white/20'
                      : 'bg-white/5 text-white/30 border-white/10 hover:border-white/20'
                  }`}>
                  {showPast ? 'Hide past' : `Show ${pastCount} past`}
                </button>
              )}
              <button onClick={() => setCreateModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
                <Plus size={14} /> New PGA Event
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {visibleEvents.map(event => {
              const status = eventStatus(event);
              const fieldCount = fieldCounts[event.id] || 0;
              const dateStr = formatDateRange(event.sync_start_date, event.sync_end_date);
              const past = isPast(event);
              return (
                <button key={event.id} onClick={() => openEvent(event.id)}
                  className={`w-full text-left rounded-xl border transition-all p-4 group ${
                    past
                      ? 'border-white/5 bg-black/10 hover:border-white/10'
                      : 'border-white/10 bg-white/3 hover:border-masters-gold/30 hover:bg-masters-gold/3'
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-display font-semibold truncate ${past ? 'text-white/40' : 'text-masters-cream'}`}>
                          {event.name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${status.cls}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {event.course && (
                          <span className="text-xs text-white/30">{event.course}</span>
                        )}
                        {dateStr && (
                          <span className="flex items-center gap-1 text-xs text-white/25">
                            <Calendar size={10} />
                            {dateStr}
                          </span>
                        )}
                        <span className={`flex items-center gap-1 text-xs ${fieldCount > 0 ? 'text-green-400/70' : 'text-white/20'}`}>
                          <Users size={10} />
                          {fieldCount > 0 ? `${fieldCount} in field` : 'No field yet'}
                        </span>
                      </div>
                    </div>
                    <span className="text-white/20 group-hover:text-white/40 transition-colors shrink-0 mt-0.5">›</span>
                  </div>
                </button>
              );
            })}
            {visibleEvents.length === 0 && (
              <div className="card-dark text-center py-10 text-white/30 text-sm">
                No events yet. Click "New PGA Event" to add one.
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DETAIL VIEW ────────────────────────────────────────────────────── */}
      {view === 'detail' && selectedId && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => setView('list')}
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-masters-cream transition-colors">
              <ChevronLeft size={16} /> All Events
            </button>
            <button onClick={() => setDeleteConfirm(true)}
              className="p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-900/20 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>

          <div className="space-y-4">
          {/* Basic Info */}
          <div className="card-dark">
            <h3 className="font-display font-semibold text-masters-cream mb-4">Basic Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Event Name</label>
                <input value={infoForm.name || ''} onChange={e => setInfoForm(f => ({ ...f, name: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="label">Course</label>
                <input value={infoForm.course || ''} onChange={e => setInfoForm(f => ({ ...f, course: e.target.value }))}
                  className="input" placeholder="e.g. Augusta National" />
              </div>
              <div>
                <label className="label">Year</label>
                <input type="number" value={infoForm.year || ''} onChange={e => setInfoForm(f => ({ ...f, year: e.target.value }))}
                  className="input" />
              </div>
            </div>
            <button onClick={saveInfo} disabled={saving === 'info'} className="btn-primary text-sm mt-4 flex items-center gap-2">
              {saving === 'info' ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              {savedSection === 'info' ? 'Saved ✓' : saving === 'info' ? 'Saving…' : 'Save Info'}
            </button>
          </div>

          {/* Sync Config */}
          <div className="card-dark">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-masters-cream">Score Sync</h3>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${syncStatus.cls}`}>
                {syncStatus.label}
              </span>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 cursor-pointer"
                onClick={() => setSyncForm(f => ({ ...f, sync_enabled: !f.sync_enabled }))}>
                <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                  syncForm.sync_enabled ? 'bg-green-600' : 'bg-white/10'
                }`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    syncForm.sync_enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-sm text-white/70 select-none">Enable automated score sync</span>
              </div>
              <div>
                <label className="label">Score API URL</label>
                <input type="url" value={syncForm.sync_url}
                  onChange={e => setSyncForm(f => ({ ...f, sync_url: e.target.value }))}
                  className="input w-full font-mono text-xs"
                  placeholder="https://www.masters.com/en_US/scores/feeds/2026/scores.json" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Format / Parser</label>
                  <select value={syncForm.sync_format}
                    onChange={e => setSyncForm(f => ({ ...f, sync_format: e.target.value }))}
                    className="input appearance-none w-full">
                    <option value="espn">ESPN (All PGA Tour events)</option>
                    <option value="masters">Masters (masters.com)</option>
                    <option value="pga_tour">PGA Tour (coming soon)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" value={syncForm.sync_start_date}
                    onChange={e => setSyncForm(f => ({ ...f, sync_start_date: e.target.value }))}
                    className="input w-full" />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" value={syncForm.sync_end_date}
                    onChange={e => setSyncForm(f => ({ ...f, sync_end_date: e.target.value }))}
                    className="input w-full" />
                </div>
              </div>
              <p className="text-xs text-white/30">
                The GitHub Action runs every 15 minutes and only syncs when today falls within the date window.
              </p>
              <button onClick={saveSync} disabled={saving === 'sync'} className="btn-primary text-sm flex items-center gap-2">
                {saving === 'sync' ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                {savedSection === 'sync' ? 'Saved ✓' : saving === 'sync' ? 'Saving…' : 'Save Sync Config'}
              </button>
            </div>
          </div>

          {/* Hole Pars */}
          <div className="card-dark">
            <div className="mb-4">
              <h3 className="font-display font-semibold text-masters-cream">Hole Pars</h3>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 mb-4">
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                <div key={hole} className="text-center">
                  <div className="text-xs text-white/30 mb-1">H{hole}</div>
                  <input type="number" min="3" max="5" value={holePars[hole] ?? ''}
                    onChange={e => setHolePars(p => ({ ...p, [hole]: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-1 py-1.5 text-xs text-masters-cream text-center focus:outline-none focus:border-masters-gold/40" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveHolePars} disabled={saving === 'pars'} className="btn-primary text-sm flex items-center gap-2">
                {saving === 'pars' ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                {savedSection === 'pars' ? 'Saved ✓' : saving === 'pars' ? 'Saving…' : 'Save Pars'}
              </button>
              <span className="text-xs text-white/30">
                {parsEntered}/18 holes · Par {parTotal || '—'}
              </span>
            </div>
          </div>

          {/* Field Management */}
          <div className="card-dark">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-display font-semibold text-masters-cream">Field</h3>
                <p className="text-xs text-white/30 mt-0.5">Click a player to move them between panels</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)}
                  className="input text-sm py-2 w-36" placeholder="Search…" />
                <button onClick={() => { setImportText(''); setImportPreview(null); setImportModal(true); }}
                  className="btn-secondary text-sm flex items-center gap-2">
                  <Plus size={13} /> Paste import
                </button>
                <button onClick={saveField} disabled={saving === 'field'} className="btn-primary text-sm flex items-center gap-2">
                  {saving === 'field' ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                  {savedSection === 'field' ? 'Saved ✓' : saving === 'field' ? 'Saving…' : 'Save Field'}
                </button>
              </div>
            </div>

            {importNewNames.length > 0 && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-800/30 text-xs text-yellow-300">
                {importNewNames.length} new player{importNewNames.length !== 1 ? 's' : ''} will be created when you save: {importNewNames.join(', ')}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* In Field */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-green-400">In Field</span>
                  <span className="text-xs text-white/30">{inFieldCount} players</span>
                </div>
                <div className="bg-green-900/10 border border-green-800/30 rounded-xl overflow-hidden flex-1">
                  <div className="space-y-px max-h-80 overflow-y-auto p-1">
                    {inField.length === 0 && (
                      <div className="text-xs text-white/20 text-center py-6 italic">
                        {fieldSearch ? 'No matches' : 'No players in field'}
                      </div>
                    )}
                    {inField.map(player => (
                      <button key={player.id}
                        onClick={() => setFieldMap(m => ({ ...m, [player.id]: false }))}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-red-900/20 hover:border-red-800/30 border border-transparent transition-colors group">
                        <span className="text-xs text-white/20 w-5 text-right shrink-0">
                          {player.world_ranking ? `#${player.world_ranking}` : '—'}
                        </span>
                        <span className="text-sm text-masters-cream flex-1 truncate">{player.name}</span>
                        <span className="text-xs text-white/20 shrink-0 group-hover:hidden">{player.country}</span>
                        <span className="text-xs text-red-400/70 shrink-0 hidden group-hover:inline">remove</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Not in Field */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-white/30">Not in Field</span>
                  <span className="text-xs text-white/30">{allPlayers.length - inFieldCount} players</span>
                </div>
                <div className="bg-black/20 border border-white/8 rounded-xl overflow-hidden flex-1">
                  <div className="space-y-px max-h-80 overflow-y-auto p-1">
                    {notInField.length === 0 && (
                      <div className="text-xs text-white/20 text-center py-6 italic">
                        {fieldSearch ? 'No matches' : 'All players are in the field'}
                      </div>
                    )}
                    {notInField.map(player => (
                      <button key={player.id}
                        onClick={() => setFieldMap(m => ({ ...m, [player.id]: true }))}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-green-900/20 hover:border-green-800/30 border border-transparent transition-colors group">
                        <span className="text-xs text-white/20 w-5 text-right shrink-0">
                          {player.world_ranking ? `#${player.world_ranking}` : '—'}
                        </span>
                        <span className="text-sm text-white/50 flex-1 truncate">{player.name}</span>
                        <span className="text-xs text-white/20 shrink-0 group-hover:hidden">{player.country}</span>
                        <span className="text-xs text-green-400/70 shrink-0 hidden group-hover:inline">add</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {/* Paste Import modal */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setImportModal(false)}>
          <div className="card-modal max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-masters-cream">Paste Field Import</h3>
              <button onClick={() => setImportModal(false)} className="text-white/30 hover:text-white/60"><X size={18} /></button>
            </div>
            <p className="text-xs text-white/40 mb-3">
              Paste player names from any source. Supports RotoWire format (name then country on alternating lines) or a plain list of names.
            </p>
            <textarea
              value={importText}
              onChange={e => { setImportText(e.target.value); setImportPreview(null); }}
              className="input w-full font-mono text-xs resize-none h-48 mb-3"
              placeholder={'Ludvig Aberg\nSweden\nScottie Scheffler\nUSA\n…'}
            />
            {!importPreview ? (
              <button
                onClick={() => parseAndPreview(importText)}
                disabled={!importText.trim()}
                className="btn-primary w-full">
                Preview import
              </button>
            ) : (
              <div>
                <div className="rounded-lg bg-black/20 border border-white/8 p-3 mb-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {importPreview.matched.length > 0 && (
                    <div>
                      <div className="text-xs text-green-400/80 uppercase tracking-wider mb-1">
                        Matched ({importPreview.matched.length})
                      </div>
                      {importPreview.matched.map(({ name }) => (
                        <div key={name} className="text-xs text-white/50 py-0.5 pl-2">{name}</div>
                      ))}
                    </div>
                  )}
                  {importPreview.newPlayers.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-yellow-400/80 uppercase tracking-wider mb-1">
                        New players to create ({importPreview.newPlayers.length})
                      </div>
                      {importPreview.newPlayers.map(({ name }) => (
                        <div key={name} className="text-xs text-yellow-300/50 py-0.5 pl-2">{name}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={applyImport} className="btn-primary flex-1">
                    Add {importPreview.total} players to field
                  </button>
                  <button onClick={() => setImportPreview(null)} className="btn-secondary">
                    Re-paste
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setCreateModal(false)}>
          <div className="card-modal max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-5">New PGA Event</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Event Name *</label>
                <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="e.g. The Masters 2026" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Course</label>
                  <input value={createForm.course} onChange={e => setCreateForm(f => ({ ...f, course: e.target.value }))}
                    className="input" placeholder="e.g. Augusta National" />
                </div>
                <div>
                  <label className="label">Year</label>
                  <input type="number" value={createForm.year} onChange={e => setCreateForm(f => ({ ...f, year: e.target.value }))}
                    className="input" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreate} disabled={!createForm.name.trim()} className="btn-primary flex-1">Create</button>
              <button onClick={() => setCreateModal(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setDeleteConfirm(false)}>
          <div className="card-modal max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-2">Delete PGA Event?</h3>
            <p className="text-white/40 text-sm mb-5">
              This will permanently delete <strong className="text-white/70">{events.find(e => e.id === selectedId)?.name}</strong> and all associated scores. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={handleDelete} className="btn-danger flex-1">Delete</button>
              <button onClick={() => setDeleteConfirm(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tournaments Tab ──────────────────────────────────────────────────────────
function TournamentsTab({ currentUserId }) {
  const [tournaments, setTournaments] = useState([]);
  const [pgaEvents, setPgaEvents] = useState([]);
  const [modal, setModal] = useState(null); // null | 'create' | tournament object (edit)
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    load();
    getPgaTournaments().then(({ data }) => setPgaEvents(data || []));
  }, []);

  async function load() {
    const { data } = await getTournaments();
    setTournaments(data || []);
  }

  function openCreate() {
    setForm({ name: '', pga_tournament_id: '', budget: 100, draft_open: true, is_locked: false, join_code: '' });
    setSaveError('');
    setModal('create');
  }

  function openEdit(t) {
    setForm({ name: t.name, pga_tournament_id: t.pga_tournament_id || '', budget: t.budget, draft_open: t.draft_open, is_locked: t.is_locked, join_code: t.join_code || '' });
    setSaveError('');
    setModal(t);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveError('');
    const payload = {
      name: form.name,
      pga_tournament_id: form.pga_tournament_id || null,
      budget: form.budget,
      draft_open: form.draft_open,
      is_locked: form.is_locked,
      join_code: form.join_code.trim().toUpperCase() || null,
    };
    const { error } = modal === 'create'
      ? await createTournament({ ...payload, created_by: currentUserId })
      : await updateTournament(modal.id, payload);
    if (error) { setSaveError(error.message); setSaving(false); return; }
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
        <p className="text-xs text-white/40">Create and manage fantasy leagues. Each league links to a PGA event for shared scores.</p>
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
                  </div>
                  <div className="text-xs text-white/40 flex items-center gap-3 flex-wrap">
                    <span>{[t.pga_tournaments?.name, `£${t.budget} budget`].filter(Boolean).join(' · ')}</span>
                    {t.join_code && (
                      <span className="font-mono tracking-wider px-2 py-0.5 rounded bg-masters-gold/10 text-masters-gold/70 border border-masters-gold/20">
                        🔑 {t.join_code}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
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
          <div className="card-modal max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-5">
              {modal === 'create' ? 'New Tournament' : `Edit: ${modal.name}`}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label">League Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="e.g. The Lads Masters 2026" />
              </div>
              <div>
                <label className="label">PGA Event</label>
                <select value={form.pga_tournament_id}
                  onChange={e => setForm(f => ({ ...f, pga_tournament_id: e.target.value }))}
                  className="input appearance-none">
                  <option value="">None (standalone)</option>
                  {pgaEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Budget per team (£)</label>
                <input type="number" step="10" value={form.budget}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="label">Join Code <span className="text-white/30 font-normal">(optional — leave blank for open)</span></label>
                <input value={form.join_code}
                  onChange={e => setForm(f => ({ ...f, join_code: e.target.value.toUpperCase() }))}
                  className="input font-mono tracking-widest" placeholder="e.g. MASTERS26" maxLength={20} />
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
            {saveError && (
              <p className="text-red-400 text-xs mt-4 p-3 rounded-lg bg-red-900/20 border border-red-800/30 break-words">{saveError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setModal(null); setSaveError(''); }} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setDeleteConfirm(null)}>
          <div className="card-modal max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-2">Delete Tournament?</h3>
            <p className="text-white/40 text-sm mb-5">
              This will permanently delete <strong className="text-white/70">{deleteConfirm.name}</strong> and all its rosters. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)} className="btn-danger flex-1">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field Pricing Tab ────────────────────────────────────────────────────────
function FieldPricingTab() {
  const [tournaments, setTournaments] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [players, setPlayers] = useState([]);
  const [priceMap, setPriceMap] = useState({}); // player_id → { price, odds_fractional, world_ranking }
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getTournaments().then(({ data }) => setTournaments(data || []));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    getTournamentPlayers(selectedId).then(({ data }) => {
      setPlayers(data || []);
      const map = {};
      (data || []).forEach(p => {
        map[p.id] = {
          price: p.price ?? '',
          odds_fractional: p.odds_fractional ?? '',
          world_ranking: p.world_ranking ?? '',
        };
      });
      setPriceMap(map);
    });
  }, [selectedId]);

  function updateField(playerId, key, value) {
    setPriceMap(m => ({ ...m, [playerId]: { ...m[playerId], [key]: value } }));
  }

  function autoPrice(player) {
    const wr = priceMap[player.id]?.world_ranking || player.world_ranking;
    if (!wr) return;
    const price = Math.round(Math.max(4, 20 - (wr - 1) * 0.12) * 2) / 2;
    updateField(player.id, 'price', price);
  }

  function autoPriceAll() {
    setPriceMap(m => {
      const next = { ...m };
      players.forEach(player => {
        const wr = next[player.id]?.world_ranking || player.world_ranking;
        if (wr) {
          next[player.id] = { ...next[player.id], price: Math.round(Math.max(4, 20 - (wr - 1) * 0.12) * 2) / 2 };
        }
      });
      return next;
    });
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    const entries = players.map(p => ({
      player_id: p.id,
      price: priceMap[p.id]?.price !== '' ? parseFloat(priceMap[p.id]?.price) : null,
      odds_fractional: priceMap[p.id]?.odds_fractional || null,
      world_ranking: priceMap[p.id]?.world_ranking !== '' ? parseInt(priceMap[p.id]?.world_ranking) : null,
    }));
    await upsertTournamentPlayers(selectedId, entries);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.country || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-48">
          <label className="label">Fantasy Tournament</label>
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setSearch(''); }} className="input appearance-none">
            <option value="">Select tournament…</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {selectedId && (
          <>
            <button onClick={autoPriceAll} className="btn-secondary text-sm flex items-center gap-1.5">
              <RefreshCw size={13} /> Auto-price all
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              {saved ? 'Saved ✓' : 'Save Prices'}
            </button>
          </>
        )}
      </div>

      {selectedId && players.length === 0 && (
        <div className="card-dark text-center py-8 text-white/30 text-sm">
          No players in field yet. Add players to the PGA event's field in the PGA Events tab first.
        </div>
      )}

      {selectedId && players.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="input flex-1 min-w-48" placeholder="Search players…" />
            <span className="text-xs text-white/40">{players.length} players in field</span>
          </div>

          <div className="space-y-1.5">
            {filtered.map(player => {
              const entry = priceMap[player.id] || {};
              return (
                <div key={player.id} className="rounded-xl border border-masters-gold/20 bg-masters-gold/5 p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-masters-cream text-sm truncate block">{player.name}</span>
                      <span className="text-xs text-white/30">#{entry.world_ranking || player.world_ranking} · {player.country}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-white/30">£</span>
                        <input type="number" step="0.5" min="1" value={entry.price ?? ''}
                          onChange={e => updateField(player.id, 'price', e.target.value)}
                          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-masters-cream text-center focus:outline-none focus:border-masters-gold/40"
                          placeholder="price" />
                      </div>
                      <input type="text" value={entry.odds_fractional ?? ''}
                        onChange={e => updateField(player.id, 'odds_fractional', e.target.value)}
                        className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-masters-cream text-center focus:outline-none focus:border-masters-gold/40"
                        placeholder="12/1" />
                      <button onClick={() => autoPrice(player)}
                        className="text-xs text-white/30 hover:text-masters-gold transition-colors px-1">
                        auto
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Scores Tab ───────────────────────────────────────────────────────────────
function ScoresTab() {
  const [pgaTournaments, setPgaTournaments] = useState([]);
  const [selectedPgaId, setSelectedPgaId] = useState('');
  const [players, setPlayers] = useState([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [pars, setPars] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [selectedRound, setSelectedRound] = useState(1);
  const [holeScores, setHoleScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPgaTournaments().then(({ data }) =>
      setPgaTournaments((data || []).filter(t => t.sync_enabled))
    );
  }, []);

  useEffect(() => {
    if (!selectedPgaId) { setPlayers([]); return; }
    getPgaHolePars(selectedPgaId).then(({ data }) => setPars(data || []));
    getPgaField(selectedPgaId).then(({ data }) => {
      const fieldPlayers = (data || [])
        .filter(fp => fp.is_in_field)
        .map(fp => fp.players)
        .filter(Boolean)
        .sort((a, b) => (a.world_ranking ?? 999) - (b.world_ranking ?? 999));
      setPlayers(fieldPlayers);
      setSelectedPlayer('');
      setPlayerSearch('');
    });
  }, [selectedPgaId]);

  useEffect(() => {
    if (!selectedPlayer || !selectedPgaId) return;
    getPlayerScores(selectedPlayer, selectedPgaId).then(({ data }) => {
      const roundScores = (data || []).filter(s => s.round === selectedRound);
      const map = {};
      roundScores.forEach(s => { map[s.hole] = s.strokes; });
      setHoleScores(map);
    });
  }, [selectedPlayer, selectedRound, selectedPgaId]);

  async function handleSave() {
    if (!selectedPlayer || !selectedPgaId) return;
    setSaving(true);
    for (const par of pars) {
      const strokes = holeScores[par.hole];
      if (strokes !== undefined && strokes !== '') {
        await upsertScore(selectedPlayer, selectedPgaId, selectedRound, par.hole, parseInt(strokes), par.par);
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
            <label className="label">PGA Event</label>
            <select value={selectedPgaId} onChange={e => setSelectedPgaId(e.target.value)}
              className="input appearance-none">
              <option value="">Select PGA event…</option>
              {pgaTournaments.map(t => <option key={t.id} value={t.id}>{t.name} {t.year ? `(${t.year})` : ''}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-48 space-y-1.5">
            <label className="label">Player</label>
            <input
              value={playerSearch}
              onChange={e => { setPlayerSearch(e.target.value); setSelectedPlayer(''); }}
              className="input"
              placeholder={selectedPgaId ? 'Search player…' : 'Select an event first'}
              disabled={!selectedPgaId}
            />
            {playerSearch && (
              <select size={5} value={selectedPlayer}
                onChange={e => { setSelectedPlayer(e.target.value); setPlayerSearch(players.find(p => p.id === e.target.value)?.name ?? ''); }}
                className="input w-full appearance-none p-0 overflow-y-auto">
                {players
                  .filter(p => p.name.toLowerCase().includes(playerSearch.toLowerCase()))
                  .map(p => (
                    <option key={p.id} value={p.id} className="px-3 py-1.5">{p.name}</option>
                  ))}
              </select>
            )}
            {selectedPlayer && (
              <div className="text-xs text-masters-gold/70 px-1">
                ✓ {players.find(p => p.id === selectedPlayer)?.name}
              </div>
            )}
          </div>
          <div>
            <label className="label">Round</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(r => (
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

        {pars.length === 0 && selectedPgaId && (
          <p className="text-xs text-yellow-400/70 mb-4">
            No hole pars configured for this event. Set them in the PGA Events tab first.
          </p>
        )}

        {selectedPlayer && selectedPgaId && pars.length > 0 && (
          <>
            <div className="text-sm text-white/50 mb-4">
              <span className="text-masters-cream font-medium">{playerObj?.name}</span> · Round {selectedRound}
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
                {Object.values(holeScores).filter(v => v !== '').length} of {pars.length} holes entered
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Players Tab ──────────────────────────────────────────────────────────────
const PLAYERS_PAGE_SIZE = 50;

function PlayersTab() {
  const [players, setPlayers] = useState([]);
  const [editModal, setEditModal] = useState(null); // null or player object
  const [editForm, setEditForm] = useState({});
  const [addModal, setAddModal] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', country: '', world_ranking: '', odds_fractional: '', odds_decimal: '', form_score: 5, price: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  async function load() {
    const { data } = await getAllPlayers();
    setPlayers(data || []);
  }

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PLAYERS_PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PLAYERS_PAGE_SIZE, page * PLAYERS_PAGE_SIZE);

  function startEdit(player) {
    setEditModal(player);
    setEditForm({
      price_override: player.price_override ?? '',
      price: player.price ?? '',
      form_score: player.form_score ?? '',
      is_withdrawn: player.is_withdrawn,
      is_active: player.is_active,
      odds_fractional: player.odds_fractional ?? '',
      world_ranking: player.world_ranking ?? '',
    });
  }

  async function saveEdit() {
    const player = editModal;
    setSaving(true);
    await updatePlayer(player.id, {
      price_override: editForm.price_override !== '' ? parseFloat(editForm.price_override) : null,
      price: editForm.price !== '' ? parseFloat(editForm.price) : player.price,
      form_score: editForm.form_score !== '' ? parseFloat(editForm.form_score) : player.form_score,
      is_withdrawn: editForm.is_withdrawn,
      is_active: editForm.is_active,
      odds_fractional: editForm.odds_fractional || player.odds_fractional,
      world_ranking: editForm.world_ranking !== '' ? parseInt(editForm.world_ranking) : player.world_ranking,
    });
    await load();
    setEditModal(null);
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
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="search"
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input flex-1 min-w-48"
        />
        <button onClick={() => setAddModal(true)} className="btn-secondary flex items-center gap-2 text-sm shrink-0">
          <Plus size={14} /> Add Player
        </button>
      </div>

      <p className="text-xs text-white/30 mb-3">
        {filtered.length} player{filtered.length !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
      </p>

      <>
          {/* Compact table */}
          <div className="rounded-xl border border-white/8 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  <th className="text-left px-4 py-2.5 text-xs text-white/40 font-medium">Player</th>
                  <th className="text-center px-3 py-2.5 text-xs text-white/40 font-medium hidden sm:table-cell">WR</th>
                  <th className="text-left px-3 py-2.5 text-xs text-white/40 font-medium hidden sm:table-cell">Odds</th>
                  <th className="text-right px-3 py-2.5 text-xs text-white/40 font-medium">Price</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {paged.map(player => (
                  <tr key={player.id}
                    className={`border-b border-white/5 hover:bg-white/3 transition-colors ${!player.is_active ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-masters-cream font-medium">{player.name}</span>
                        {player.is_withdrawn && <span className="badge-wd">WD</span>}
                        {!player.is_active && <span className="text-xs text-white/30 italic">inactive</span>}
                      </div>
                      <div className="text-xs text-white/30 sm:hidden mt-0.5">
                        #{player.world_ranking} · {player.odds_fractional}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-white/40 font-mono text-xs hidden sm:table-cell">
                      {player.world_ranking ? `#${player.world_ranking}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-white/40 text-xs hidden sm:table-cell">
                      {player.odds_fractional || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-mono text-sm text-masters-gold">
                        £{(player.price_override ?? player.price)?.toFixed(1) ?? '—'}
                      </div>
                      {player.price_override && (
                        <div className="text-xs text-white/25 line-through">£{player.price?.toFixed(1)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => startEdit(player)}
                        className="p-1.5 rounded text-white/30 hover:text-masters-gold hover:bg-masters-gold/10 transition-colors">
                        <Edit3 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-xs text-white/40">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="btn-secondary px-3 py-1 text-xs disabled:opacity-30">← Prev</button>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="btn-secondary px-3 py-1 text-xs disabled:opacity-30">Next →</button>
              </div>
            </div>
          )}
        </>

      {/* Edit player modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setEditModal(null)}>
          <div className="card-modal max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-5">Edit: {editModal.name}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Base Price</label>
                <input type="number" step="0.5" value={editForm.price}
                  onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Price Override</label>
                <input type="number" step="0.5" value={editForm.price_override}
                  onChange={e => setEditForm(f => ({ ...f, price_override: e.target.value }))}
                  className="input" placeholder="blank = use base" />
              </div>
              <div>
                <label className="label">World Ranking</label>
                <input type="number" value={editForm.world_ranking}
                  onChange={e => setEditForm(f => ({ ...f, world_ranking: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Odds (e.g. 12/1)</label>
                <input type="text" value={editForm.odds_fractional}
                  onChange={e => setEditForm(f => ({ ...f, odds_fractional: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Form (0-10)</label>
                <input type="number" step="0.1" min="0" max="10" value={editForm.form_score}
                  onChange={e => setEditForm(f => ({ ...f, form_score: e.target.value }))} className="input" />
              </div>
            </div>
            <div className="flex gap-4 mt-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                <input type="checkbox" checked={editForm.is_active}
                  onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                <input type="checkbox" checked={editForm.is_withdrawn}
                  onChange={e => setEditForm(f => ({ ...f, is_withdrawn: e.target.checked }))} />
                Withdrawn (WD)
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={saveEdit} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
              <button onClick={() => setEditModal(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add player modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setAddModal(false)}>
          <div className="card-modal max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-masters-cream mb-5">Add Player</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Name *</label>
                <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="Full name" autoFocus />
              </div>
              <div>
                <label className="label">Country</label>
                <input value={newForm.country} onChange={e => setNewForm(f => ({ ...f, country: e.target.value }))}
                  className="input" placeholder="e.g. USA" />
              </div>
              <div>
                <label className="label">World Ranking</label>
                <input type="number" value={newForm.world_ranking}
                  onChange={e => setNewForm(f => ({ ...f, world_ranking: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Odds (e.g. 12/1)</label>
                <input value={newForm.odds_fractional}
                  onChange={e => setNewForm(f => ({ ...f, odds_fractional: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Price (£)</label>
                <input type="number" step="0.5" value={newForm.price}
                  onChange={e => setNewForm(f => ({ ...f, price: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Form (0-10)</label>
                <input type="number" step="0.1" min="0" max="10" value={newForm.form_score}
                  onChange={e => setNewForm(f => ({ ...f, form_score: e.target.value }))} className="input" />
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
            <div className="text-xs text-white/30 mt-0.5">{p.id}</div>
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
  const [activeTab, setActiveTab] = useState('PGA Events');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 animate-fade-up flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-masters-gold/15 border border-masters-gold/30 flex items-center justify-center">
          <Settings size={18} className="text-masters-gold" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-masters-cream">Admin Panel</h1>
          <p className="text-white/40 text-sm">PGA Events · Tournaments · Players · Users</p>
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
        {activeTab === 'PGA Events'    && <PgaEventsTab />}
        {activeTab === 'Tournaments'   && <TournamentsTab currentUserId={user?.id} />}
        {activeTab === 'Field Pricing' && <FieldPricingTab />}
        {activeTab === 'Scores'        && <ScoresTab />}
        {activeTab === 'Players'       && <PlayersTab />}
        {activeTab === 'Users'         && <UsersTab />}
      </div>
    </div>
  );
}
