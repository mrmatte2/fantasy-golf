import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { updateProfile } from '../lib/supabase';
import { User, Lock, Phone, Check } from 'lucide-react';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [phone, setPhone] = useState(profile?.phone_number || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    const { error: err } = await updateProfile(user.id, { phone_number: phone.trim() || null });
    if (err) { setError(err.message); setSaving(false); return; }
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8 animate-fade-up flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-masters-gold/15 border border-masters-gold/30 flex items-center justify-center">
          <User size={18} className="text-masters-gold" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-masters-cream">My Profile</h1>
          <p className="text-white/40 text-sm">Manage your account details</p>
        </div>
      </div>

      <div className="card animate-fade-up-delay-1 space-y-5">
        <div>
          <label className="label">Username</label>
          <div className="input bg-white/3 text-white/40 select-none">{profile?.username}</div>
        </div>

        <div>
          <label className="label flex items-center gap-1.5">
            Team Name
            <span className="flex items-center gap-1 text-white/30 text-xs font-normal">
              <Lock size={10} /> Locked
            </span>
          </label>
          <div className="input bg-white/3 text-white/40 select-none">{profile?.team_name || '—'}</div>
        </div>

        <div>
          <label className="label flex items-center gap-1.5">
            <Phone size={12} /> Phone Number
            <span className="text-white/30 text-xs font-normal">(required for money match tournaments)</span>
          </label>
          <input
            value={phone}
            onChange={e => { setPhone(e.target.value); setSaved(false); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="input"
            placeholder="e.g. 0701234567"
          />
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? 'Saving…' : saved ? <><Check size={14} /> Saved!</> : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
