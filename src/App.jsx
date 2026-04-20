import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabase';
import Navbar from './components/shared/Navbar';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import TournamentsPage from './pages/TournamentsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import DraftPage from './pages/DraftPage';
import MyTeamPage from './pages/MyTeamPage';
import AdminPage from './pages/AdminPage';
import RulesPage from './pages/RulesPage';

function AuthEventHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password');
    });
    // Supabase processes the token before React mounts, so the event may already
    // have fired — check the hash directly as a fallback.
    if (window.location.hash.includes('type=recovery')) {
      navigate('/reset-password');
    }
    return () => subscription.unsubscribe();
  }, [navigate]);
  return null;
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-masters-gold/60 text-sm animate-pulse">Loading…</div>
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !profile?.is_admin) return <Navigate to="/tournaments" replace />;

  return children;
}

function AppLayout({ children }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AuthEventHandler />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Tournament lobby */}
          <Route path="/tournaments" element={
            <ProtectedRoute>
              <AppLayout><TournamentsPage /></AppLayout>
            </ProtectedRoute>
          } />

          {/* Per-tournament routes — all under /tournament/:id/ */}
          <Route path="/tournament/:id/leaderboard" element={
            <ProtectedRoute>
              <AppLayout><LeaderboardPage /></AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/tournament/:id/draft" element={
            <ProtectedRoute>
              <AppLayout><DraftPage /></AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/tournament/:id/my-team" element={
            <ProtectedRoute>
              <AppLayout><MyTeamPage /></AppLayout>
            </ProtectedRoute>
          } />

          {/* Rules */}
          <Route path="/rules" element={
            <ProtectedRoute>
              <AppLayout><RulesPage /></AppLayout>
            </ProtectedRoute>
          } />

          {/* Admin */}
          <Route path="/admin" element={
            <ProtectedRoute adminOnly>
              <AppLayout><AdminPage /></AppLayout>
            </ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/tournaments" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
