import { useState, useEffect } from 'react';
import { getTournamentState, supabase } from '../lib/supabase';

export function useTournament() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchState();

    // Real-time subscription to tournament state changes
    const channel = supabase
      .channel('tournament_state')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_state' },
        (payload) => setState(payload.new))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchState() {
    setLoading(true);
    const { data } = await getTournamentState();
    setState(data);
    setLoading(false);
  }

  return { tournamentState: state, tournamentLoading: loading, refreshTournament: fetchState };
}
