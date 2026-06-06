'use client';

import { useState, useEffect, useRef } from 'react';
import { Tournament, Player, Match, Game, BracketConfig } from '../../../types/pingpong';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RoundRobinView from './RoundRobinView';
import BracketView from './BracketView';
import { createBracketMatches, cascadeBracketR1PlayerSwap, cascadeBracketPlayerSwap } from '../../../lib/tournament';

export default function ActiveTournamentsPage() {
  const router = useRouter();
  const [tournaments, setTournaments]           = useState<Tournament[]>([]);
  const [players, setPlayers]                   = useState<Player[]>([]);
  const [games, setGames]                       = useState<Game[]>([]);

  const [showEditForm, setShowEditForm]           = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [selectedPlayers, setSelectedPlayers]     = useState<string[]>([]);

  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);
  const [newPlayerName, setNewPlayerName]         = useState('');
  const [newPlayerError, setNewPlayerError]       = useState<string | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeTabByTournament, setActiveTabByTournament] = useState<Record<string, 'roundRobin' | 'bracket'>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  // Client-side editable preview of the bracket *before* it is started.
  // Allows users to reassign byes and R1 players via the same swap UI as the live bracket.
  // Keyed by tournament id. When present, the bracket tab uses these matches for the preview.
  const [bracketPreviewById, setBracketPreviewById] = useState<Record<string, Match[]>>({});


  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchTournaments = async () => {
    const res  = await fetch('/api/tournaments');
    const data: Tournament[] = await res.json();
    setTournaments(data);
    return data;
  };

  const fetchPlayers = async () => { const res = await fetch('/api/players'); setPlayers(await res.json()); };
  const fetchGames   = async () => { const res = await fetch('/api/games');   setGames(await res.json()); };

  useEffect(() => {
    fetchTournaments();
    fetchPlayers();
    fetchGames();
  }, []);

  const getPlayerName = (id: string) => {
    if (id === 'BYE') return 'BYE';
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
    if (match.round === 'bracket') {
      await maybeAdvanceBracketRound(match.tournamentId);
    }
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
    const tournamentIdForGame = tournaments.find(t =>
      (t.matches ?? []).some(m => m.games.some(g => g.id === gameId))
    )?.id;

    const res = await fetch(`/api/games/${gameId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score1, score2 }),
    });
    if (res.ok) {
      await Promise.all([fetchGames(), fetchTournaments()]);
      if (tournamentIdForGame) {
        await maybeAdvanceBracketRound(tournamentIdForGame);
      }
    }
    else { const err = await res.json(); alert(err.error ?? 'Failed to update game'); }
  };

  const maybeAdvanceBracketRound = async (tournamentId: string) => {
    const refreshed = await fetchTournaments();
    const tournament = refreshed.find(t => t.id === tournamentId);
    if (!tournament) return;

    const bracketMatches = (tournament.matches ?? []).filter(
      m => m.round === 'bracket' && (m.bracketRound ?? 0) > 0
    );
    if (bracketMatches.length === 0) return;

    const currentRound = Math.max(...bracketMatches.map(m => m.bracketRound ?? 1));
    const currentRoundMatches = bracketMatches.filter(m => (m.bracketRound ?? 1) === currentRound);
    if (!currentRoundMatches.length || !currentRoundMatches.every(m => m.winnerId)) return;

    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournamentId, action: 'advanceRound' }),
    });

    if (res.ok) {
      await fetchGames();
      const afterAdvance = await fetchTournaments();
      const updated = afterAdvance.find(t => t.id === tournamentId);
      if (updated?.status === 'completed') {
        router.push(`/tournaments/history?id=${tournamentId}`);
      }
    }
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

  const toggleActivePlayer = async (tournament: Tournament, playerId: string) => {
    const current = tournament.activePlayers ?? tournament.players;
    const updated = current.includes(playerId)
      ? current.filter(id => id !== playerId)
      : [...current, playerId];
    await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournament.id, activePlayers: updated }),
    });
    await fetchTournaments();
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

  const addRoundRobinRound = async (tournament: Tournament) => {
    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournament.id, action: 'addRoundRobinRound' }),
    });
    if (res.ok) { await fetchTournaments(); }
    else { const err = await res.json(); alert(err.error ?? 'Failed to add round'); }
  };

  const startBracket = async (tournament: Tournament) => {
    // If the user configured the bracket in preview, send the exact matches we previewed
    // so the committed bracket matches what they set up (byes, play-in participants, etc.).
    const previewMatches = bracketPreviewById[tournament.id];
    const body: { id: string; action: string; initialBracketMatches?: Match[]; bracketConfig?: BracketConfig } = { id: tournament.id, action: 'startBracket' };
    if (previewMatches && previewMatches.length > 0) {
      body.initialBracketMatches = previewMatches;
      // Also send a derived config so the stored tournament remembers the high-level choice (play-in or not)
      const hasPlayIn = previewMatches.some((m: Match) => (m.bracketRound ?? 0) === 0);
      body.bracketConfig = { playInMode: hasPlayIn ? 'force' : 'none' };
    }

    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      // Clear the preview override once it has been committed
      setBracketPreviewById(prev => {
        const next = { ...prev };
        delete next[tournament.id];
        return next;
      });
      await Promise.all([fetchTournaments(), fetchGames()]);
      setActiveTabByTournament(prev => ({ ...prev, [tournament.id]: 'bracket' }));
    } else {
      const err = await res.json();
      alert(err.error ?? 'Failed to start bracket');
    }
  };

  // Apply a player/bye swap *locally* in the editable preview (before the bracket is started).
  // Uses the same pure cascade logic as the live bracket so the result is consistent.
  const handlePreviewBracketSwap = (tournamentId: string, matchId: string, player1Id: string, player2Id: string, seedMatches?: Match[]) => {
    setBracketPreviewById(prev => {
      let current = prev[tournamentId];
      if (!current || current.length === 0) {
        current = seedMatches && seedMatches.length > 0 ? seedMatches : [];
      }
      if (!current || current.length === 0) return prev;

      try {
        const target = current.find(m => m.id === matchId);
        if (!target) return prev;

        let updated: Match[];
        if (target.bracketRound === 0) {
          // Play-in round (round 0) — use the general cascade (it handles R0 too via the any-bracket-round version)
          updated = cascadeBracketPlayerSwap(current, matchId, player1Id, player2Id);
        } else if (target.bracketRound === 1) {
          updated = cascadeBracketR1PlayerSwap(current, matchId, player1Id, player2Id);
        } else {
          updated = cascadeBracketPlayerSwap(current, matchId, player1Id, player2Id);
        }

        return { ...prev, [tournamentId]: updated };
      } catch (e: unknown) {
        const msg = (e as Error)?.message || 'Invalid swap in preview';
        alert(msg);
        return prev;
      }
    });
  };

  const resetBracketPreview = (tournamentId: string) => {
    setBracketPreviewById(prev => {
      const next = { ...prev };
      delete next[tournamentId];
      return next;
    });
  };

  // Regenerate the preview bracket using a specific play-in mode (for "add or remove play-in round").
  // We clone the tournament, set bracketConfig, and run the real creation logic.
  const applyPlayInModeToPreview = (tournament: Tournament, mode: 'auto' | 'force' | 'none') => {
    try {
      const rrMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
      const clone: Tournament = {
        ...tournament,
        players: [...tournament.players],
        activePlayers: tournament.activePlayers ? [...tournament.activePlayers] : undefined,
        bracketRounds: tournament.bracketRounds.map(r => ({ ...r })),
        matches: rrMatches.map(m => ({
          ...m,
          games: m.games.map(g => ({ ...g })),
        })),
        playerRanking: undefined,
        bracketConfig: {
          ...(tournament.bracketConfig || {}),
          playInMode: mode,
        },
      };

      const generated = createBracketMatches(clone, true);
      if (generated.length > 0) {
        setBracketPreviewById(prev => ({ ...prev, [tournament.id]: generated }));
      } else {
        alert('Could not generate bracket with that setting.');
      }
    } catch (e) {
      console.error(e);
      alert('Error applying play-in setting to preview.');
    }
  };

  const updateTournamentPlayers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTournament || [...new Set(selectedPlayers)].length < 2) return;
    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingTournament.id, players: [...new Set(selectedPlayers)], activePlayers: [...new Set(selectedPlayers)] }),
    });
    if (res.ok) {
      setShowEditForm(false); setEditingTournament(null); setSelectedPlayers([]);
      setShowNewPlayerForm(false); setNewPlayerName(''); setNewPlayerError(null);
      fetchTournaments();
    } else { const err = await res.json(); alert(err.error ?? 'Failed to update tournament'); }
  };

  const createPlayerAndSelect = async () => {
    if (!newPlayerName.trim()) return;
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPlayerName.trim() }),
    });
    if (res.ok) {
      const created: Player = await res.json();
      await fetchPlayers();
      setSelectedPlayers(prev => [...prev, created.id]);
      setNewPlayerName('');
      setNewPlayerError(null);
      setShowNewPlayerForm(false);
    } else {
      const err = await res.json();
      setNewPlayerError(err.error ?? 'Failed to add player');
    }
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
    const bracketStarted = Boolean(tournament.bracketStartedAt || (tournament.matches ?? []).some(m => m.round === 'bracket') || tournament.status === 'bracket');
    const label = tournament.status === 'completed' ? 'Completed'
      : !bracketStarted ? 'Round Robin'
      : tournament.status === 'bracket'
        ? `Bracket · R${bm.length ? Math.max(...bm.map(m => m.bracketRound ?? 0)) : 1}`
        : 'Bracket';
    const cls = tournament.status === 'completed'
      ? 'bg-green-100 text-green-800 border-green-200'
      : !bracketStarted
      ? 'bg-blue-100 text-blue-800 border-blue-200'
      : 'bg-purple-100 text-purple-800 border-purple-200';
    return <span className={`text-xs font-bold px-3 py-1 rounded-full border ${cls}`}>{label}</span>;
  };

  const activeTournaments = tournaments.filter(t => t.status !== 'completed');
  const totalGamesCount = (t: Tournament) =>
    games.filter(g => g.matchId && (t.matches ?? []).some(m => m.id === g.matchId)).length;

  const getProjectedBracketMatches = (tournament: Tournament): Match[] => {
    const rrMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
    const firstRoundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === 1);
    const firstRoundComplete = firstRoundMatches.length > 0 && firstRoundMatches.every(m => Boolean(m.winnerId));

    if (!firstRoundComplete) {
      return [];
    }

    const projectionTournament: Tournament = {
      ...tournament,
      players: [...tournament.players],
      activePlayers: tournament.activePlayers ? [...tournament.activePlayers] : undefined,
      bracketRounds: tournament.bracketRounds.map(round => ({ ...round })),
      playerRanking: undefined,
      matches: rrMatches.map(match => ({
        ...match,
        games: match.games.map(game => ({ ...game })),
      })),
    };

    return createBracketMatches(projectionTournament, true);
  };

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
          </div>
        </div>

        {showEditForm && editingTournament && (
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 border-2 border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Edit Players — {editingTournament.name}</h2>
            {Boolean(editingTournament.bracketStartedAt || (editingTournament.matches ?? []).some(m => m.round === 'bracket') || editingTournament.status === 'bracket') && (
              <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
                <p className="text-sm font-semibold text-amber-800">⚠️ Bracket started — round robin roster is locked.</p>
                <p className="text-xs text-amber-700 mt-1">Player changes are only allowed before starting the bracket.</p>
              </div>
            )}
            {!Boolean(editingTournament.bracketStartedAt || (editingTournament.matches ?? []).some(m => m.round === 'bracket') || editingTournament.status === 'bracket') && <div className="mb-6" />}
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

              <div className="pt-2">
                {!showNewPlayerForm ? (
                  <button type="button" onClick={() => setShowNewPlayerForm(true)}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-semibold transition-colors">
                    <span className="text-lg leading-none">+</span> Create New Player
                  </button>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-3">New Player</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPlayerName}
                        onChange={e => { setNewPlayerName(e.target.value); setNewPlayerError(null); }}
                        onKeyDown={e => { if (e.key === 'Enter' && newPlayerName.trim()) { e.preventDefault(); createPlayerAndSelect(); } }}
                        placeholder="Player name"
                        autoFocus
                        className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      />
                      <button type="button" onClick={createPlayerAndSelect}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors">
                        Add
                      </button>
                      <button type="button" onClick={() => { setShowNewPlayerForm(false); setNewPlayerName(''); setNewPlayerError(null); }}
                        className="px-4 py-2 border-2 border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-100 font-semibold transition-colors">
                        Cancel
                      </button>
                    </div>
                    {newPlayerError && <p className="mt-2 text-sm text-red-600">{newPlayerError}</p>}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => { setShowEditForm(false); setEditingTournament(null); setSelectedPlayers([]); setShowNewPlayerForm(false); setNewPlayerName(''); setNewPlayerError(null); }}
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
            const bracketStarted = Boolean(t.bracketStartedAt || bracketMatches.length > 0 || t.status === 'bracket');
            const activeTab = activeTabByTournament[t.id] ?? (bracketStarted ? 'bracket' : 'roundRobin');
            const rrMatches = tm.filter(m => m.round === 'roundRobin');
            const currentRound = rrMatches.length > 0 ? Math.max(...rrMatches.map(m => m.bracketRound ?? 1)) : 1;
            const pastRounds = Array.from(new Set(
              rrMatches.filter(m => (m.bracketRound ?? 1) < currentRound).map(m => m.bracketRound ?? 1)
            )).sort((a, b) => a - b);
            const firstRoundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === 1);
            const firstRoundComplete = firstRoundMatches.length > 0 && firstRoundMatches.every(m => Boolean(m.winnerId));
            const baseProjected = !bracketStarted ? getProjectedBracketMatches(t) : [];
            // Use locally edited preview if the user has made configuration changes in the bracket tab preview.
            const previewMatches = bracketPreviewById[t.id];
            const effectivePreviewMatches = !bracketStarted && previewMatches && previewMatches.length > 0 ? previewMatches : baseProjected;
            const tournamentGames = games
              .filter(g => g.matchId && tm.some(m => m.id === g.matchId))
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const allRoundRobinComplete = rrMatches.length > 0 && rrMatches.every(m => Boolean(m.winnerId));

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
                    <div className="flex items-center gap-3">
                      {statusBadge(t)}
                      <div className="relative" ref={openMenuId === t.id ? menuRef : null}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                          className="text-gray-400 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors text-lg leading-none"
                          title="More actions"
                        >
                          ⋯
                        </button>
                        {openMenuId === t.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-50">
                            <button
                              onClick={() => { setOpenMenuId(null); setEditingTournament(t); setSelectedPlayers(t.activePlayers ?? t.players); setShowEditForm(true); }}
                              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              ✏️ Edit Players
                            </button>
                            <button
                              onClick={() => { setOpenMenuId(null); endTournament(t); }}
                              className="w-full text-left px-4 py-2.5 text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2"
                            >
                              🏁 End Tournament
                            </button>
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              onClick={() => { setOpenMenuId(null); deleteTournament(t); }}
                              className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              🗑️ Delete Tournament
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-8 py-6 space-y-8">

                  <div className="border-b border-gray-200">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setActiveTabByTournament(prev => ({ ...prev, [t.id]: 'roundRobin' }))}
                        className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                          activeTab === 'roundRobin'
                            ? 'text-blue-700 border-blue-600 bg-blue-50'
                            : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Round Robin
                      </button>
                      <button
                        onClick={() => {
                          if (!bracketStarted && (!bracketPreviewById[t.id] || bracketPreviewById[t.id].length === 0) && effectivePreviewMatches.length > 0) {
                            setBracketPreviewById(prev => ({ ...prev, [t.id]: [...effectivePreviewMatches] }));
                          }
                          setActiveTabByTournament(prev => ({ ...prev, [t.id]: 'bracket' }));
                        }}
                        className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                          activeTab === 'bracket'
                            ? 'text-blue-700 border-blue-600 bg-blue-50'
                            : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Bracket
                      </button>
                    </div>
                  </div>

                  {activeTab === 'roundRobin' && (
                    <>
                      {!bracketStarted && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Players</span>
                            <span className="text-xs text-gray-400">(toggle to mark who is playing today)</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {t.players.map(pid => {
                              const activeList = t.activePlayers ?? t.players;
                              const isActive = activeList.includes(pid);
                              return (
                                <button
                                  key={pid}
                                  onClick={() => toggleActivePlayer(t, pid)}
                                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                                    isActive
                                      ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200'
                                      : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200 line-through'
                                  }`}
                                >
                                  {getPlayerName(pid)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {bracketStarted && (
                        <div className="flex flex-wrap gap-2">
                          {t.players.map(pid => (
                            <span key={pid} className="bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200">
                              {getPlayerName(pid)}
                            </span>
                          ))}
                        </div>
                      )}

                      {!bracketStarted && (
                        <RoundRobinView
                          tournament={t}
                          getPlayerName={getPlayerName}
                          onAddGame={addGameToMatch}
                          onDeleteMatch={deleteMatch}
                          onDeleteGame={deleteGame}
                          onSaveGameEdit={saveGameEdit}
                          onSwapPlayers={swapPlayers}
                          onAdvanceRound={advanceRound}
                          onAddRound={addRoundRobinRound}
                        />
                      )}

                      {(pastRounds.length > 0 || bracketStarted) && (
                        <div className="mt-2 border-t border-gray-200 pt-6 space-y-5">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Previous Round Robin Rounds</p>
                          {(bracketStarted
                            ? Array.from(new Set(rrMatches.map(m => m.bracketRound ?? 1))).sort((a, b) => a - b)
                            : pastRounds
                          ).map(round => {
                            const roundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === round && m.player2Id !== 'BYE');
                            return (
                              <div key={round}>
                                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Round {round}</div>
                                <div className="space-y-1.5">
                                  {roundMatches.map(match => {
                                    const p1Won = match.winnerId === match.player1Id;
                                    const p2Won = match.winnerId === match.player2Id;
                                    return (
                                      <div key={match.id} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                        <div className="flex items-center px-4 py-2 text-sm gap-3">
                                          <span className={`font-semibold flex-1 ${p1Won ? 'text-green-700' : 'text-gray-500'}`}>
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
                                          <span className={`font-semibold flex-1 text-right ${p2Won ? 'text-green-700' : 'text-gray-500'}`}>
                                            {getPlayerName(match.player2Id)}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {roundMatches.length === 0 && (
                                    <p className="text-xs text-gray-400 italic">No completed head-to-head matches in this round.</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === 'bracket' && (
                    <div className="space-y-6">
                      {!bracketStarted && (
                        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 space-y-4">
                          <div>
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Bracket preview — editable</p>
                            <p className="text-sm text-blue-900">Click matches in the bracket below (especially byes or the play-in) to reassign players or choose who gets byes. Use the controls to add or remove the play-in round.</p>
                          </div>

                          {/* Play-in round controls for add/remove */}
                          <div className="bg-white/70 border border-blue-200 rounded-lg p-3">
                            <div className="text-xs font-semibold text-blue-800 mb-2">Play-in / preliminary round</div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => applyPlayInModeToPreview(t, 'force')}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-white hover:bg-blue-50 border-blue-300 text-blue-700"
                              >
                                + Add / Force play-in round
                              </button>
                              <button
                                onClick={() => applyPlayInModeToPreview(t, 'none')}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-white hover:bg-blue-50 border-blue-300 text-blue-700"
                              >
                                − Remove play-in (use bye instead)
                              </button>
                              <button
                                onClick={() => applyPlayInModeToPreview(t, 'auto')}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-white hover:bg-blue-50 border-blue-300 text-blue-700"
                              >
                                Auto (based on player count)
                              </button>
                              <button
                                onClick={() => resetBracketPreview(t.id)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-white hover:bg-gray-50 border-gray-300 text-gray-600 ml-auto"
                              >
                                Reset to auto-generated
                              </button>
                            </div>
                            <p className="text-[10px] text-blue-600 mt-1.5">Changing this will regenerate the bracket structure for the preview using the current RR standings.</p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              onClick={() => startBracket(t)}
                              disabled={!firstRoundComplete}
                              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors border ${
                                firstRoundComplete
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700'
                                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              }`}
                            >
                              🏆 Start Bracket with Current Preview
                            </button>
                            {!firstRoundComplete && (
                              <span className="text-xs text-blue-800">Available after Round Robin Round 1 is complete.</span>
                            )}
                            {firstRoundComplete && !allRoundRobinComplete && (
                              <span className="text-xs text-blue-800">You can start now or keep playing round robin rounds.</span>
                            )}
                          </div>
                        </div>
                      )}

                      {!bracketStarted && allRoundRobinComplete && firstRoundComplete && (
                        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3">
                          <p className="text-sm text-emerald-900 font-semibold">All round robin games are complete. Bracket is ready to start.</p>
                          <button
                            onClick={() => startBracket(t)}
                            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold border border-emerald-700 transition-colors"
                          >
                            Start Bracket with Current Preview
                          </button>
                        </div>
                      )}

                      {(bracketStarted || effectivePreviewMatches.length > 0) ? (
                        <div className="bg-white rounded-2xl shadow-sm border-2 border-gray-200 p-6">
                          <BracketView
                            bracketMatches={bracketStarted ? bracketMatches : effectivePreviewMatches}
                            getPlayerName={getPlayerName}
                            tournamentPlayers={t.players}
                            onAddGame={addGameToMatch}
                            onSaveGameEdit={saveGameEdit}
                            onSwapPlayers={bracketStarted ? swapPlayers : async (mid, p1, p2) => { handlePreviewBracketSwap(t.id, mid, p1, p2, effectivePreviewMatches); }}
                            readOnly={false}
                            previewMode={!bracketStarted}
                          />
                          {!bracketStarted && (
                            <div className="mt-3 flex justify-end">
                              <button
                                onClick={() => resetBracketPreview(t.id)}
                                className="text-xs text-gray-500 hover:text-gray-700 underline"
                              >
                                Reset preview to auto-generated
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-5">
                          <p className="text-sm text-gray-700 font-semibold">Bracket preview is unavailable until Round Robin Round 1 is complete.</p>
                          {!firstRoundComplete && <p className="text-xs text-gray-500 mt-1">Finish all Round 1 matches to see projected bracket pairings.</p>}
                        </div>
                      )}

                      <div className="bg-white rounded-2xl shadow-sm border-2 border-gray-200 p-5">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Game History</p>
                        {tournamentGames.length === 0 ? (
                          <p className="text-sm text-gray-500">No games recorded yet.</p>
                        ) : (
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {tournamentGames.map(game => {
                              const match = tm.find(m => m.id === game.matchId);
                              const roundLabel = match?.round === 'bracket'
                                ? match.bracketRound === 0
                                  ? 'Bracket Play-in'
                                  : `Bracket R${match?.bracketRound ?? 1}`
                                : `RR R${match?.bracketRound ?? 1}`;
                              const p1Won = game.score1 > game.score2;
                              return (
                                <div key={game.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                      <span className={p1Won ? 'text-green-700' : 'text-gray-600'}>{getPlayerName(game.player1Id)}</span>
                                      <span className="text-gray-300 mx-1.5">vs</span>
                                      <span className={!p1Won ? 'text-green-700' : 'text-gray-600'}>{getPlayerName(game.player2Id)}</span>
                                    </p>
                                    <p className="text-xs text-gray-500">{roundLabel} · {new Date(game.date).toLocaleString()}</p>
                                  </div>
                                  <span className="font-black text-gray-900 tabular-nums text-sm whitespace-nowrap">
                                    {game.score1}–{game.score2}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                    <div className="text-center">
                      <div className="text-2xl font-black text-gray-900">
                        {!bracketStarted
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
