import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTournament } from '../../hooks/useTournament';
import { signOut } from '../../lib/supabase';
import { Trophy, Users, BarChart3, Settings, LogOut, Menu, X, Lock, Unlock } from 'lucide-react';

export default function Navbar() {
  const { profile } = useAuth();
  const { tournamentState } = useTournament();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { path: '/draft',       label: 'Draft',       icon: Users },
    { path: '/my-team',     label: 'My Team',     icon: BarChart3 },
    ...(profile?.is_admin ? [{ path: '/admin', label: 'Admin', icon: Settings }] : []),
  ];

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-masters-dark/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/leaderboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-masters-gold/20 border border-masters-gold/40 flex items-center justify-center">
              <span className="text-masters-gold text-xs font-display font-bold">⛳</span>
            </div>
            <div>
              <span className="font-display font-bold text-masters-cream text-sm leading-none block">Fantasy Golf</span>
              <span className="text-masters-gold/60 text-xs leading-none">The Masters 2025</span>
            </div>
          </Link>

          {/* Lock status pill */}
          {tournamentState && (
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              tournamentState.is_locked
                ? 'bg-red-900/30 text-red-400 border border-red-800/40'
                : 'bg-green-900/30 text-green-400 border border-green-800/40'
            }`}>
              {tournamentState.is_locked ? <Lock size={11} /> : <Unlock size={11} />}
              {tournamentState.is_locked ? 'Roster Locked' : 'Roster Open'}
              {tournamentState.current_round > 0 && (
                <span className="ml-1 opacity-70">· R{tournamentState.current_round}</span>
              )}
            </div>
          )}

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link key={path} to={path}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive(path)
                    ? 'bg-masters-gold/15 text-masters-gold'
                    : 'text-white/60 hover:text-masters-cream hover:bg-white/5'
                }`}>
                <Icon size={15} />
                {label}
              </Link>
            ))}

            <div className="ml-2 pl-2 border-l border-white/10 flex items-center gap-2">
              <span className="text-xs text-white/40">{profile?.username}</span>
              <button onClick={handleSignOut}
                className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                <LogOut size={15} />
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <button className="sm:hidden p-2 text-white/60" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-white/10 bg-masters-dark/95 px-4 py-3 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link key={path} to={path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive(path) ? 'bg-masters-gold/15 text-masters-gold' : 'text-white/70'
              }`}>
              <Icon size={16} />
              {label}
            </Link>
          ))}
          <button onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-900/20 transition-colors">
            <LogOut size={16} />
            Sign out ({profile?.username})
          </button>
        </div>
      )}
    </nav>
  );
}
