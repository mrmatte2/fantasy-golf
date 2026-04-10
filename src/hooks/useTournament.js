import { useState, useEffect } from 'react';
import { getTournament, supabase } from '../lib/supabase';

// Pass a tournamentId to subscribe to a specific tournament's state.
// Used by Draft, MyTeam, Leaderboard pages inside /tournament/:id/*
export function useTournament(tournamentId) {
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tournamentId) {
      setTournament(null);
      setLoading(false);
      return;
    }

    fetchTournament();

    // Real-time updates when admin changes round/lock/draft state
    const channel = supabase
      .channel(`tournament_${tournamentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'tournaments',
        filter: `id=eq.${tournamentId}`,
      }, (payload) => setTournament(payload.new))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [tournamentId]);

  async function fetchTournament() {
    setLoading(true);
    const { data } = await getTournament(tournamentId);
    setTournament(data);
    setLoading(false);
  }

  return { tournament, tournamentLoading: loading, refreshTournament: fetchTournament };
}
