import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword } from '../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');
    const { error } = await updatePassword(password);
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true);
    setTimeout(() => navigate('/login'), 2500);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-masters-green/20 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full bg-masters-gold/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-masters-gold/15 border border-masters-gold/30 flex items-center justify-center">
            <span className="text-3xl">⛳</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-masters-cream">Fantasy Golf</h1>
        </div>

        <div className="card-dark">
          <h2 className="font-display font-bold text-masters-cream mb-1">Set new password</h2>
          <p className="text-white/40 text-sm mb-5">Choose a new password for your account.</p>

          {done ? (
            <div className="px-4 py-3 rounded-lg bg-green-900/30 border border-green-800/40 text-green-300 text-sm text-center">
              Password updated! Redirecting to login…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">New Password</label>
                <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                  className="input" placeholder="Min. 6 characters" required autoFocus />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }}
                  className="input" placeholder="Repeat password" required />
              </div>
              {error && (
                <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/40 text-red-300 text-sm">
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
                {loading ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
