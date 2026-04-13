import { useState, useEffect } from 'react';
import { getTournament, getPgaTournament, supabase } from '../lib/supabase';

// Pass a tournamentId to subscribe to a specific tournament's state.
// Used by Draft, MyTeam, Leaderboard pages inside /tournament/:id/*
export function useTournament(tournamentId) {
  const [tournament, setTournament] = useState(null);
  const [pgaTournament, setPgaTournament] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tournamentId) {
      setTournament(null);
      setPgaTournament(null);
      setLoading(false);
      return;
    }

    fetchTournament();

    // Real-time updates when admin changes lock/draft state
    const channel = supabase
      .channel(`tournament_${tournamentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'tournaments',
        filter: `id=eq.${tournamentId}`,
      }, async (payload) => {
        setTournament(payload.new);
        if (payload.new.pga_tournament_id) {
          const { data } = await getPgaTournament(payload.new.pga_tournament_id);
          setPgaTournament(data);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [tournamentId]);

  async function fetchTournament() {
    setLoading(true);
    const { data } = await getTournament(tournamentId);
    setTournament(data);
    if (data?.pga_tournament_id) {
      const { data: pga } = await getPgaTournament(data.pga_tournament_id);
      setPgaTournament(pga);
    } else {
      setPgaTournament(null);
    }
    setLoading(false);
  }

  return { tournament, pgaTournament, tournamentLoading: loading, refreshTournament: fetchTournament };
}
