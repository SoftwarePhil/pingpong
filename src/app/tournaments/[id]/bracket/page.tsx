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
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading bracket…</div>;
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 text-center">
          <p className="text-gray-700 font-semibold mb-4">Tournament not found.</p>
          <Link href="/tournaments/active" className="text-blue-600 font-semibold hover:text-blue-800">← Back to Active Tournaments</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
        <div className="flex justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900">{tournament.name} · Bracket</h1>
            <p className="text-gray-500 mt-1">
              {bracketStarted ? 'Bracket stage management' : 'Bracket has not started yet'}
            </p>
          </div>
          <Link href="/tournaments/active" className="bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-xl shadow-sm border-2 border-gray-200 transition-colors font-semibold text-sm">
            ← Back
          </Link>
        </div>

        {!bracketStarted && (
          <div className="bg-white rounded-2xl shadow-sm border-2 border-gray-200 p-6">
            <p className="text-sm text-gray-600 mb-4">
              Round-robin stays editable on the active page until you explicitly start the bracket.
            </p>
            <button
              onClick={startBracket}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors border-2 border-purple-700"
            >
              🏆 Start Bracket
            </button>
          </div>
        )}

        {bracketStarted && (
          <div className="bg-white rounded-2xl shadow-sm border-2 border-gray-200 p-6 space-y-4">
            <BracketView
              bracketMatches={bracketMatches}
              getPlayerName={getPlayerName}
              tournamentPlayers={tournament.players}
              onAddGame={addGameToMatch}
              onSaveGameEdit={saveGameEdit}
              onSwapPlayers={swapPlayers}
            />
          </div>
        )}
      </div>
    </div>
  );
}
