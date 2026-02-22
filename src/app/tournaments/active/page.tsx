'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Tournament, Player, Match, Game } from '../../../types/pingpong';
import Link from 'next/link';
import RoundRobinView from './RoundRobinView';
import BracketView from './BracketView';

export default function ActiveTournamentsPage() {
  const router = useRouter();
  const [tournaments, setTournaments]           = useState<Tournament[]>([]);
  const [players, setPlayers]                   = useState<Player[]>([]);
  const [games, setGames]                       = useState<Game[]>([]);

  const [showEditForm, setShowEditForm]           = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [selectedPlayers, setSelectedPlayers]     = useState<string[]>([]);

  const [showRRHistory, setShowRRHistory] = useState(false);

  const fetchTournaments = async () => {
    const res  = await fetch('/api/tournaments');
    const data: Tournament[] = await res.json();
    setTournaments(data);
  };

  const fetchPlayers = async () => { const res = await fetch('/api/players'); setPlayers(await res.json()); };
  const fetchGames   = async () => { const res = await fetch('/api/games');   setGames(await res.json()); };

  useEffect(() => {
    fetchTournaments();
    fetchPlayers();
    fetchGames();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getPlayerName = (id: string) => {
    if (id === 'PLAY_IN_WINNER') return 'Play-in Winner';
    return players.find(p => p.id === id)?.name ?? 'Unknown';
  };

  const addGameToMatch = async (match: Match, score1: number, score2: number) => {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Id: match.player1Id, player2Id: match.player2Id, score1, score2, matchId: match.id }),
    });
    if (!res.ok) return;
    await Promise.all([fetchGames(), fetchTournaments()]);
    await checkBracketAdvancement(match.tournamentId);
  };

  const checkBracketAdvancement = async (tournamentId: string) => {
    try {
      const [tRes, mRes] = await Promise.all([fetch('/api/tournaments'), fetch('/api/matches')]);
      const allT: Tournament[] = await tRes.json();
      const allM: Match[]      = await mRes.json();
      const t = allT.find(x => x.id === tournamentId);
      if (!t || t.status !== 'bracket') return;
      const bm = allM.filter(m => m.tournamentId === tournamentId && m.round === 'bracket');
      const rounds = bm.map(m => m.bracketRound ?? 0).filter(r => r > 0);
      if (!rounds.length) return;
      const currentRound = Math.max(...rounds);
      const current = bm.filter(m => m.bracketRound === currentRound);
      if (current.length > 0 && current.every(m => m.winnerId)) {
        await fetch('/api/tournaments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: tournamentId, action: 'advanceRound' }),
        });
        // Check if the tournament is now completed
        const checkRes = await fetch('/api/tournaments');
        const updated: Tournament[] = await checkRes.json();
        const updatedT = updated.find(x => x.id === tournamentId);
        setTournaments(updated);
        if (updatedT?.status === 'completed') {
          router.push('/tournaments/history');
          return;
        }
        await fetchTournaments();
      }
    } catch (err) { console.error(err); }
  };

  const deleteMatch = async (matchId: string) => {
    if (!confirm('Delete this match and all its games?')) return;
    const res = await fetch(`/api/matches/${matchId}`, { method: 'DELETE' });
    if (res.ok) { fetchTournaments(); fetchGames(); }
    else alert('Failed to delete match');
  };

  const deleteGame = async (gameId: string) => {
    if (!confirm('Delete this game?')) return;
    const res = await fetch(`/api/games/${gameId}`, { method: 'DELETE' });
    if (res.ok) { fetchGames(); fetchTournaments(); }
    else alert('Failed to delete game');
  };

  const saveGameEdit = async (gameId: string, score1: number, score2: number) => {
    const res = await fetch(`/api/games/${gameId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score1, score2 }),
    });
    if (res.ok) { fetchGames(); fetchTournaments(); }
    else { const err = await res.json(); alert(err.error ?? 'Failed to update game'); }
  };

  const swapPlayers = async (matchId: string, player1Id: string, player2Id: string) => {
    const res = await fetch(`/api/matches/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Id, player2Id }),
    });
    if (res.ok) { await fetchTournaments(); }
    else { const err = await res.json(); alert(err.error ?? 'Failed to update players'); }
  };

  const advanceRound = async (tournament: Tournament) => {
    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournament.id, action: 'advanceRound' }),
    });
    if (res.ok) { await fetchTournaments(); }
    else { const err = await res.json(); alert(err.error ?? 'Failed to advance round'); }
  };

  const startBracket = async (tournament: Tournament) => {
    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournament.id, status: 'bracket' }),
    });
    if (res.ok) { await fetchTournaments(); }
    else alert('Failed to start bracket');
  };

  const updateTournamentPlayers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTournament || [...new Set(selectedPlayers)].length < 2) return;
    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingTournament.id, players: [...new Set(selectedPlayers)] }),
    });
    if (res.ok) {
      setShowEditForm(false); setEditingTournament(null); setSelectedPlayers([]);
      fetchTournaments();
    } else { const err = await res.json(); alert(err.error ?? 'Failed to update tournament'); }
  };

  const endTournament = async (t: Tournament) => {
    if (!confirm('End this tournament?')) return;
    const res = await fetch('/api/tournaments', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, status: 'completed' }),
    });
    if (res.ok) fetchTournaments(); else alert('Failed to end tournament');
  };

  const deleteTournament = async (t: Tournament) => {
    if (!confirm('Delete this tournament? This cannot be undone.')) return;
    const res = await fetch(`/api/tournaments?id=${t.id}`, { method: 'DELETE' });
    if (res.ok) { fetchTournaments(); fetchGames(); } else alert('Failed to delete tournament');
  };

  const statusBadge = (tournament: Tournament) => {
    const bm = (tournament.matches ?? []).filter(m => m.round === 'bracket' && (m.bracketRound ?? 0) > 0);
    const label = tournament.status === 'roundRobin' ? 'Round Robin'
      : tournament.status === 'bracket'
        ? `Bracket · R${bm.length ? Math.max(...bm.map(m => m.bracketRound ?? 0)) : 1}`
        : 'Completed';
    const cls = tournament.status === 'roundRobin'
      ? 'bg-blue-100 text-blue-800 border-blue-200'
      : tournament.status === 'bracket'
        ? 'bg-purple-100 text-purple-800 border-purple-200'
        : 'bg-green-100 text-green-800 border-green-200';
    return <span className={`text-xs font-bold px-3 py-1 rounded-full border ${cls}`}>{label}</span>;
  };

  const activeTournaments = tournaments.filter(t => t.status !== 'completed');
  const totalGamesCount = (t: Tournament) =>
    games.filter(g => g.matchId && (t.matches ?? []).some(m => m.id === g.matchId)).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">⚡ Active Tournaments</h1>
            <p className="text-gray-500 mt-1">Manage ongoing ping pong tournaments</p>
          </div>
          <div className="flex gap-3">
            <Link href="/tournaments" className="bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-xl shadow-sm border-2 border-gray-200 transition-colors font-semibold text-sm">
              ← Back
            </Link>
            <Link href="/tournaments/new" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-sm font-semibold text-sm transition-colors border-2 border-blue-700">
              + New Tournament
            </Link>
          </div>
        </div>

        {showEditForm && editingTournament && (
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 border-2 border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Edit Players — {editingTournament.name}</h2>
            <form onSubmit={updateTournamentPlayers} className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {players.map(p => (
                  <label key={p.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer border-2 border-gray-200 transition-colors">
                    <input type="checkbox" checked={selectedPlayers.includes(p.id)}
                      onChange={e => setSelectedPlayers(prev =>
                        e.target.checked
                          ? prev.includes(p.id) ? prev : [...prev, p.id]
                          : prev.filter(id => id !== p.id)
                      )}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="font-medium text-gray-900">{p.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => { setShowEditForm(false); setEditingTournament(null); setSelectedPlayers([]); }}
                  className="px-6 py-2.5 border-2 border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 font-semibold transition-colors">
                  Cancel
                </button>
                <button type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors border-2 border-blue-700">
                  Save Players
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-8">
          {activeTournaments.map(t => {
            const tm = t.matches ?? [];
            const bracketMatches = tm.filter(m => m.round === 'bracket');
            return (
              <div key={t.id} className="bg-white rounded-2xl shadow-sm border-2 border-gray-200 overflow-hidden">

                <div className="bg-gray-900 text-white px-8 py-6">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h2 className="text-2xl font-black mb-1">{t.name}</h2>
                      <p className="text-gray-400 text-sm">
                        {t.players.length} players · Started {new Date(t.startDate).toLocaleDateString()}
                      </p>
                    </div>
                    {statusBadge(t)}
                  </div>
                </div>

                <div className="px-8 py-6 space-y-8">

                  <div className="flex flex-wrap gap-2">
                    {t.players.map(pid => (
                      <span key={pid} className="bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200">
                        {getPlayerName(pid)}
                      </span>
                    ))}
                  </div>

                  {t.status === 'roundRobin' && (
                    <RoundRobinView
                      tournament={t}
                      getPlayerName={getPlayerName}
                      onAddGame={addGameToMatch}
                      onDeleteMatch={deleteMatch}
                      onDeleteGame={deleteGame}
                      onSaveGameEdit={saveGameEdit}
                      onSwapPlayers={swapPlayers}
                      onAdvanceRound={advanceRound}
                      onStartBracket={startBracket}
                    />
                  )}

                  {t.status === 'bracket' && (() => {
                    const rrMatches = tm.filter(m => m.round === 'roundRobin')
                      .sort((a, b) => (a.bracketRound || 0) - (b.bracketRound || 0));
                    const rrRounds = Array.from(new Set(rrMatches.map(m => m.bracketRound || 1))).sort((a, b) => a - b);

                    return (
                      <div>
                        <h3 className="text-lg font-bold text-gray-800 mb-6">Bracket</h3>
                        <BracketView
                          bracketMatches={bracketMatches}
                          getPlayerName={getPlayerName}
                          onAddGame={addGameToMatch}
                          onSaveGameEdit={saveGameEdit}
                        />

                        {rrMatches.length > 0 && (
                          <div className="mt-8 border-t border-gray-200 pt-6">
                            <button
                              onClick={() => setShowRRHistory(v => !v)}
                              className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors mb-4"
                            >
                              <span className={`transition-transform ${showRRHistory ? 'rotate-90' : ''}`}>▶</span>
                              Round Robin History ({rrMatches.filter(m => m.winnerId && m.player2Id !== 'BYE').length} matches)
                            </button>

                            {showRRHistory && (
                              <div className="space-y-5">
                                {rrRounds.map(round => {
                                  const roundMatches = rrMatches.filter(m => (m.bracketRound || 1) === round);
                                  return (
                                    <div key={round}>
                                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Round {round}</div>
                                      <div className="space-y-1.5">
                                        {roundMatches.filter(m => m.player2Id !== 'BYE').map(match => {
                                          const p1Won = match.winnerId === match.player1Id;
                                          const p2Won = match.winnerId === match.player2Id;
                                          return (
                                            <div key={match.id} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                              <div className="flex items-center px-4 py-2 text-sm gap-3">
                                                <span className={`font-semibold flex-1 ${p1Won ? 'text-green-700' : 'text-gray-600'}`}>
                                                  {getPlayerName(match.player1Id)}
                                                </span>
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                  {match.games.map((g, gi) => {
                                                    const g1w = g.score1 > g.score2;
                                                    return (
                                                      <span key={g.id} className="text-xs tabular-nums text-gray-500">
                                                        {gi > 0 && <span className="mx-1 text-gray-300">·</span>}
                                                        <span className={g1w ? 'font-bold text-gray-800' : ''}>{g.score1}</span>
                                                        <span className="text-gray-400">–</span>
                                                        <span className={!g1w ? 'font-bold text-gray-800' : ''}>{g.score2}</span>
                                                      </span>
                                                    );
                                                  })}
                                                  {match.games.length === 0 && <span className="text-xs text-gray-400 italic">no games</span>}
                                                </div>
                                                <span className={`font-semibold flex-1 text-right ${p2Won ? 'text-green-700' : 'text-gray-600'}`}>
                                                  {getPlayerName(match.player2Id)}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                    <div className="text-center">
                      <div className="text-2xl font-black text-gray-900">
                        {t.status === 'roundRobin'
                          ? Math.max(...(tm.filter(m => m.round === 'roundRobin').map(m => m.bracketRound ?? 1)), 1)
                          : bracketMatches.filter(m => (m.bracketRound ?? 0) > 0).length > 0
                            ? Math.max(...bracketMatches.filter(m => (m.bracketRound ?? 0) > 0).map(m => m.bracketRound ?? 0))
                            : '—'
                        }
                      </div>
                      <div className="text-xs text-gray-500 font-semibold mt-0.5">Current Round</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-gray-900">
                        {tm.filter(m => m.round === 'roundRobin' && m.winnerId).length}
                      </div>
                      <div className="text-xs text-gray-500 font-semibold mt-0.5">RR Matches Done</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-gray-900">{totalGamesCount(t)}</div>
                      <div className="text-xs text-gray-500 font-semibold mt-0.5">Games Played</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-center gap-3 pt-2">
                    <button
                      onClick={() => { setEditingTournament(t); setSelectedPlayers(t.players); setShowEditForm(true); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors border-2 border-blue-700"
                    >
                      ✏️ Edit Players
                    </button>
                    <button onClick={() => endTournament(t)}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors border-2 border-orange-600">
                      🏁 End Tournament
                    </button>
                    <button onClick={() => deleteTournament(t)}
                      className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors border-2 border-red-700">
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {activeTournaments.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border-2 border-gray-200">
            <div className="text-7xl mb-5">⚡</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No active tournaments</h3>
            <p className="text-gray-500 mb-6">Create a new tournament to get started</p>
            <Link href="/tournaments/new"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold text-base transition-colors border-2 border-blue-700">
              Create Tournament
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
