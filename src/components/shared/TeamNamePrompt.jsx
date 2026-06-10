import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile } from '../../lib/supabase';
import { Trophy } from 'lucide-react';

export default function TeamNamePrompt() {
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Team name is required.'); return; }
    if (trimmed.length > 30) { setError('Max 30 characters.'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await updateProfile(user.id, { team_name: trimmed });
    if (err) { setError(err.message); setSaving(false); return; }
    await refreshProfile();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="card max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-masters-gold/15 flex items-center justify-center">
            <Trophy size={16} className="text-masters-gold" />
          </div>
          <h3 className="font-display font-bold text-masters-cream">Choose Your Team Name</h3>
        </div>
        <p className="text-white/50 text-sm mb-5">
          This will be your identifier across all tournaments.
          Choose carefully — it cannot be changed later.
        </p>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          className="input mb-1"
          placeholder="e.g. Amen Corner FC"
          maxLength={30}
          autoFocus
        />
        <div className="flex justify-between items-center mb-4">
          {error
            ? <p className="text-red-400 text-xs">{error}</p>
            : <span />}
          <span className="text-white/30 text-xs">{name.length}/30</span>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving…' : 'Save Team Name'}
        </button>
      </div>
    </div>
  );
}
