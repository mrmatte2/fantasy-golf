import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp } from '../lib/supabase';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    email: '', password: '', username: '', teamName: '',
  });

  function handle(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        const { error } = await signIn(form.email, form.password);
        if (error) throw error;
        navigate('/leaderboard');
      } else {
        if (!form.username.trim()) throw new Error('Username is required');
        if (!form.teamName.trim()) throw new Error('Team name is required');
        const { error } = await signUp(form.email, form.password, form.username.trim(), form.teamName.trim());
        if (error) throw error;
        navigate('/leaderboard');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-masters-green/20 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full bg-masters-gold/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-masters-gold/15 border border-masters-gold/30 flex items-center justify-center">
            <span className="text-3xl">⛳</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-masters-cream">Fantasy Golf</h1>
          <p className="text-masters-gold/70 text-sm mt-1 font-medium tracking-wider uppercase">
            The Masters · Augusta 2025
          </p>
        </div>

        {/* Card */}
        <div className="card-dark">
          {/* Tab switcher */}
          <div className="flex gap-1 mb-6 p-1 rounded-lg bg-black/30">
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
                  mode === m
                    ? 'bg-masters-gold/20 text-masters-gold border border-masters-gold/30'
                    : 'text-white/40 hover:text-white/70'
                }`}>
                {m}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="label">Username</label>
                  <input name="username" value={form.username} onChange={handle}
                    className="input" placeholder="e.g. tiger_fan" required />
                </div>
                <div>
                  <label className="label">Team Name</label>
                  <input name="teamName" value={form.teamName} onChange={handle}
                    className="input" placeholder="e.g. Amen Corner FC" required />
                </div>
              </>
            )}

            <div>
              <label className="label">Email</label>
              <input name="email" type="email" value={form.email} onChange={handle}
                className="input" placeholder="you@example.com" required />
            </div>

            <div>
              <label className="label">Password</label>
              <input name="password" type="password" value={form.password} onChange={handle}
                className="input" placeholder={mode === 'register' ? 'Min. 6 characters' : '••••••••'} required />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/40 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          Friends only · Augusta National · 2025
        </p>
      </div>
    </div>
  );
}
