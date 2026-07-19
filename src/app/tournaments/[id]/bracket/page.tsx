'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BracketView from '../../active/BracketView';
import { Tournament, Player, Match } from '../../../../types/pingpong';

export default function TournamentBracketPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tournamentId = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [tRes, pRes] = await Promise.all([fetch('/api/tournaments'), fetch('/api/players')]);
    const allTournaments: Tournament[] = await tRes.json();
    const allPlayers: Player[] = await pRes.json();
    setTournament(allTournaments.find(t => t.id === tournamentId) ?? null);
    setPlayers(allPlayers);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const getPlayerName = (id: string) => {
    if (id === 'BYE') return 'BYE';
    if (id === 'PLAY_IN_WINNER') return 'Play-in Winner';
    if (id === 'TBD') return 'TBD';
    return players.find(p => p.id === id)?.name ?? 'Unknown';
  };

  const bracketStarted = Boolean(
    tournament?.bracketStartedAt ||
    (tournament?.matches ?? []).some(m => m.round === 'bracket') ||
    tournament?.status === 'bracket'
  );

  const bracketMatches = useMemo(
    () => (tournament?.matches ?? []).filter(m => m.round === 'bracket'),
    [tournament]
  );

  const checkBracketAdvancement = async (id: string) => {
    const [tRes, mRes] = await Promise.all([fetch('/api/tournaments'), fetch('/api/matches')]);
    const allT: Tournament[] = await tRes.json();
    const allM: Match[] = await mRes.json();
    const currentTournament = allT.find(t => t.id === id);
    if (!currentTournament) return;

    const bm = allM.filter(m => m.tournamentId === id && m.round === 'bracket');
    const rounds = bm.map(m => m.bracketRound ?? 0).filter(r => r > 0);
    if (!rounds.length) return;
    const currentRound = Math.max(...rounds);
    const current = bm.filter(m => m.bracketRound === currentRound);
    if (!current.length || !current.every(m => m.winnerId)) return;

    await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'advanceRound' }),
    });
    await fetchData();
    const refreshedTournament = await (await fetch('/api/tournaments')).json() as Tournament[];
    const updatedTournament = refreshedTournament.find(t => t.id === id);
    if (updatedTournament?.status === 'completed') {
      router.push(`/tournaments/history?id=${id}`);
    }
  };

  const addGameToMatch = async (match: Match, score1: number, score2: number) => {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Id: match.player1Id, player2Id: match.player2Id, score1, score2, matchId: match.id }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? 'Failed to record game');
      return;
    }
    await fetchData();
    await checkBracketAdvancement(match.tournamentId);
  };

  const saveGameEdit = async (gameId: string, score1: number, score2: number) => {
    const res = await fetch(`/api/games/${gameId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score1, score2 }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? 'Failed to update game');
      return;
    }
    await fetchData();
    if (tournament) {
      await checkBracketAdvancement(tournament.id);
    }
  };

  const swapPlayers = async (matchId: string, player1Id: string, player2Id: string) => {
    const res = await fetch(`/api/matches/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Id, player2Id }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? 'Failed to update players');
      return;
    }
    await fetchData();
  };

  const deleteGame = async (gameId: string) => {
    if (!confirm('Delete this game?')) return;
    const res = await fetch(`/api/games/${gameId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? 'Failed to delete game');
      return;
    }
    await fetchData();
    if (tournament) {
      await checkBracketAdvancement(tournament.id);
    }
  };

  const changeMatchBestOf = async (matchId: string, bestOf: number) => {
    const res = await fetch(`/api/matches/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bestOf }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? 'Failed to change number of games');
      return;
    }
    await fetchData();
    if (tournament) {
      await checkBracketAdvancement(tournament.id);
    }
  };

  const startBracket = async () => {
    if (!tournament) return;
    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournament.id, action: 'startBracket' }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? 'Failed to start bracket');
      return;
    }
    await fetchData();
  };

  if (loading) {
    return <div className="page flex items-center justify-center text-muted font-mono text-sm">Loading bracket…</div>;
  }

  if (!tournament) {
    return (
      <div className="page flex items-center justify-center">
        <div className="panel p-8 text-center max-w-sm">
          <p className="font-semibold mb-4">Tournament not found.</p>
          <Link href="/tournaments/active" className="nav-back">← Back to Active Tournaments</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-inner-wide space-y-6">
        <div className="flex justify-between items-center gap-4">
          <div>
            <p className="eyebrow mb-2">bracket</p>
            <h1 className="display-lg">{tournament.name}</h1>
            <p className="text-muted mt-1 text-sm">
              {bracketStarted ? 'Bracket stage' : 'Bracket has not started yet'}
            </p>
          </div>
          <Link href="/tournaments/active" className="btn btn-secondary btn-sm">
            ← Back
          </Link>
        </div>

        {!bracketStarted && (
          <div className="panel-raised p-6">
            <p className="text-sm text-muted mb-4">
              Round-robin stays editable on the active page until you explicitly start the bracket.
            </p>
            <button onClick={startBracket} className="btn btn-primary">
              Start Bracket
            </button>
          </div>
        )}

        {bracketStarted && (
          <div className="panel p-6 space-y-4">
            <BracketView
              bracketMatches={bracketMatches}
              getPlayerName={getPlayerName}
              tournamentPlayers={tournament.players}
              onAddGame={addGameToMatch}
              onSaveGameEdit={saveGameEdit}
              onDeleteGame={deleteGame}
              onChangeBestOf={changeMatchBestOf}
              onSwapPlayers={swapPlayers}
            />
          </div>
        )}
      </div>
    </div>
  );
}
