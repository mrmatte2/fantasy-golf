import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Navbar from './components/shared/Navbar';
import LoginPage from './pages/LoginPage';
import LeaderboardPage from './pages/LeaderboardPage';
import DraftPage from './pages/DraftPage';
import MyTeamPage from './pages/MyTeamPage';
import AdminPage from './pages/AdminPage';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-masters-gold/60 text-sm animate-pulse">Loading…</div>
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !profile?.is_admin) return <Navigate to="/leaderboard" replace />;

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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/leaderboard" element={
            <ProtectedRoute>
              <AppLayout><LeaderboardPage /></AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/draft" element={
            <ProtectedRoute>
              <AppLayout><DraftPage /></AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/my-team" element={
            <ProtectedRoute>
              <AppLayout><MyTeamPage /></AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/admin" element={
            <ProtectedRoute adminOnly>
              <AppLayout><AdminPage /></AppLayout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/leaderboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
