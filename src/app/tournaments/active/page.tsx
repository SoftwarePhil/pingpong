'use client';

import { useState, useEffect } from 'react';
import { Tournament, Player, Match, Game, BracketConfig, MARKER_PLAYER_ID, PlayInMode } from '../../../types/pingpong';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RoundRobinView from './RoundRobinView';
import { BracketView } from '@/bracket';
import { validateScore } from '../../../lib/scoring';
import Leaderboard from './Leaderboard';
import { createBracketMatches, cascadeBracketPlayerSwap, getCompletedSemifinalMatches, hasBracketStarted, isPlayInWinnerPlaceholder } from '../../../lib/tournament';
import { useAuth } from '../../../components/AuthProvider';
import { useConfirm } from '../../../components/ConfirmDialog';
import { getRoundRobinFormat, isMatchComplete, isValidDoublesRoster } from '../../../lib/matchFormat';
import { TournamentHeader, TournamentMenuAction } from './TournamentHeader';
import { EditTournamentPanel, PairingStrategy } from './EditTournamentPanel';
import { BracketSetupPanel } from './BracketSetupPanel';
import { GameHistory } from './GameHistory';
import { PastRoundsSummary } from './PastRoundsSummary';

export default function ActiveTournamentsPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const [tournaments, setTournaments]           = useState<Tournament[]>([]);
  const [players, setPlayers]                   = useState<Player[]>([]);
  const [games, setGames]                       = useState<Game[]>([]);

  const [showEditForm, setShowEditForm]           = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [selectedPlayers, setSelectedPlayers]     = useState<string[]>([]);
  const [pairingStrategy, setPairingStrategy]     = useState<PairingStrategy>('top-vs-top');
  const [savingPairingStrategy, setSavingPairingStrategy] = useState(false);

  const [activeTabByTournament, setActiveTabByTournament] = useState<Record<string, 'roundRobin' | 'bracket'>>({});

  // Client-side editable preview of the bracket *before* it is started.
  // Allows users to reassign byes and R1 players via the same swap UI as the live bracket.
  // Keyed by tournament id. When present, the bracket tab uses these matches for the preview.
  const [bracketPreviewById, setBracketPreviewById] = useState<Record<string, Match[]>>({});
  // Third-place selection is a preview-only setting until the bracket is started.
  const [thirdPlacePreviewById, setThirdPlacePreviewById] = useState<Record<string, boolean>>({});


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
    if (id === MARKER_PLAYER_ID) return 'Marker';
    if (isPlayInWinnerPlaceholder(id)) return 'Play-in Winner';
    if (id === 'TBD') return 'TBD';
    return players.find(p => p.id === id)?.name ?? 'Unknown';
  };

  const addGameToMatch = async (match: Match, score1: number, score2: number) => {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score1, score2, matchId: match.id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? 'Failed to record game');
      return;
    }
    await Promise.all([fetchGames(), fetchTournaments()]);
    if (match.round === 'bracket') {
      await maybeAdvanceBracketRound(match.tournamentId);
    }
  };

  const deleteMatch = async (matchId: string) => {
    if (!await confirm({
      title: 'Delete this match?',
      message: 'The match and any games recorded in it are removed.',
      confirmLabel: 'Delete match',
      tone: 'danger',
    })) return;
    const res = await fetch(`/api/matches/${matchId}`, { method: 'DELETE' });
    if (res.ok) { fetchTournaments(); fetchGames(); }
    else alert('Failed to delete match');
  };

  const deleteGame = async (gameId: string) => {
    if (!await confirm({
      title: 'Delete this game?',
      message: 'The match result is recalculated from the remaining games.',
      confirmLabel: 'Delete game',
      tone: 'danger',
    })) return;
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
    if (!currentRoundMatches.length || !currentRoundMatches.every(isMatchComplete)) return;

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
    if (res.ok) {
      await fetchTournaments();
    }
    else { const err = await res.json(); alert(err.error ?? 'Failed to update players'); }
  };

  const addMarker = async (matchId: string) => {
    const res = await fetch(`/api/matches/${matchId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player2Id: MARKER_PLAYER_ID }),
    });
    if (res.ok) await fetchTournaments();
    else { const err = await res.json(); alert(err.error ?? 'Failed to add marker'); }
  };

  const changeMatchBestOf = async (matchId: string, bestOf: number) => {
    const res = await fetch(`/api/matches/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bestOf }),
    });
    if (res.ok) {
      const tournamentIdForMatch = tournaments.find(t => (t.matches ?? []).some(m => m.id === matchId))?.id;
      await fetchTournaments();
      if (tournamentIdForMatch) await maybeAdvanceBracketRound(tournamentIdForMatch);
    } else {
      const err = await res.json();
      alert(err.error ?? 'Failed to change number of games');
    }
  };

  const addThirdPlaceMatch = async (tournament: Tournament) => {
    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournament.id, action: 'addThirdPlaceMatch' }),
    });
    if (res.ok) {
      await fetchTournaments();
    } else {
      const err = await res.json();
      alert(err.error ?? 'Failed to add third-place game');
    }
  };

  const toggleActivePlayer = async (tournament: Tournament, playerId: string) => {
    const current = tournament.activePlayers ?? tournament.players;
    const isActive = current.includes(playerId);
    // Atomic diff-based roster update — the server resyncs round-robin
    // matches for the current round in the same request (no separate call
    // needed): the removed player's unplayed match is dropped and their
    // opponent (or the reactivated player) returns to the pairing pool.
    const res = await fetch(`/api/tournaments/${tournament.id}/players`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isActive ? { remove: [playerId] } : { add: [playerId] }),
    });
    if (res.ok) {
      const updatedTournament: Tournament = await res.json();
      regenerateBracketPreview(updatedTournament);
      await fetchTournaments();
    }
    else { const err = await res.json(); alert(err.error ?? 'Failed to update player'); }
  };

  const refreshMatches = async (tournament: Tournament) => {
    const res = await fetch(`/api/tournaments/${tournament.id}/refresh-matches`, { method: 'POST' });
    if (res.ok) { await fetchTournaments(); }
    else { const err = await res.json(); alert(err.error ?? 'Failed to refresh matches'); }
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

  const changeRoundRobinFormat = async (tournament: Tournament, format: 'singles' | 'doubles') => {
    const rrMatches = (tournament.matches ?? []).filter(match => match.round === 'roundRobin');
    const currentRound = rrMatches.length > 0
      ? Math.max(...rrMatches.map(match => match.bracketRound ?? 1))
      : 1;
    const currentFormat = getRoundRobinFormat(tournament, currentRound);
    const label = format === 'doubles' ? '2v2' : '1v1';
    if (currentFormat === format) return;
    if (!await confirm({
      title: `Play round ${currentRound} as ${label}?`,
      message: 'All unplayed matches in this round are replaced with new pairings.',
      confirmLabel: `Switch to ${label}`,
    })) return;

    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournament.id, action: 'setRoundRobinFormat', round: currentRound, format }),
    });
    if (res.ok) await fetchTournaments();
    else {
      const err = await res.json();
      alert(err.error ?? 'Failed to change round format');
    }
  };

  const startBracket = async (tournament: Tournament) => {
    // If the user configured the bracket in preview, send the exact matches we previewed
    // so the committed bracket matches what they set up (byes, play-in participants, etc.).
    const previewMatches = bracketPreviewById[tournament.id];
    const thirdPlaceMatch = thirdPlacePreviewById[tournament.id] ?? tournament.bracketConfig?.thirdPlaceMatch === true;
    const body: { id: string; action: string; initialBracketMatches?: Match[]; bracketConfig?: BracketConfig } = { id: tournament.id, action: 'startBracket' };
    if (previewMatches && previewMatches.length > 0) {
      body.initialBracketMatches = previewMatches;
      // Also send a derived config so the stored tournament remembers the high-level choice (play-in or not)
      const hasPlayIn = previewMatches.some((m: Match) => (m.bracketRound ?? 0) === 0);
      body.bracketConfig = {
        playInMode: hasPlayIn ? 'force' : 'none',
        thirdPlaceMatch,
      };
    } else if (thirdPlacePreviewById[tournament.id] !== undefined) {
      body.bracketConfig = { thirdPlaceMatch };
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
      setThirdPlacePreviewById(prev => {
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

        return { ...prev, [tournamentId]: cascadeBracketPlayerSwap(current, matchId, player1Id, player2Id) };
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

  const generateBracketPreview = (tournament: Tournament, mode: PlayInMode) => {
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

    return createBracketMatches(clone, true);
  };

  const regenerateBracketPreview = (tournament: Tournament) => {
    try {
      const mode = tournament.bracketConfig?.playInMode ?? 'auto';
      const generated = generateBracketPreview(tournament, mode);
      setBracketPreviewById(prev => {
        const next = { ...prev };
        if (generated.length > 0) next[tournament.id] = generated;
        else delete next[tournament.id];
        return next;
      });
    } catch (e) {
      console.error(e);
      setBracketPreviewById(prev => {
        const next = { ...prev };
        delete next[tournament.id];
        return next;
      });
    }
  };

  // Regenerate the preview bracket using a specific play-in mode (for "add or remove play-in round").
  const applyPlayInModeToPreview = (tournament: Tournament, mode: PlayInMode) => {
    try {
      const generated = generateBracketPreview(tournament, mode);
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
    const desired = [...new Set(selectedPlayers)];
    const currentActive = editingTournament.activePlayers ?? editingTournament.players;
    // Diff against the current active roster so this always goes through the
    // atomic { add, remove } endpoint — the server performs the roster change
    // and the round-robin match resync as a single request.
    const add = desired.filter(id => !currentActive.includes(id));
    const remove = currentActive.filter(id => !desired.includes(id));

    if (add.length === 0 && remove.length === 0) { closeEditForm(); return; }

    const res = await fetch(`/api/tournaments/${editingTournament.id}/players`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add, remove }),
    });
    if (res.ok) {
      const updatedTournament: Tournament = await res.json();
      regenerateBracketPreview(updatedTournament);
      closeEditForm();
      await fetchTournaments();
    }
    else { const err = await res.json(); alert(err.error ?? 'Failed to update tournament'); }
  };

  const openEditForm = (t: Tournament) => {
    setEditingTournament(t);
    setSelectedPlayers(t.activePlayers ?? t.players);
    setPairingStrategy(t.rrPairingStrategy ?? 'top-vs-top');
    setShowEditForm(true);
  };

  const closeEditForm = () => {
    setShowEditForm(false);
    setEditingTournament(null);
    setSelectedPlayers([]);
  };

  const updatePairingStrategy = async (strategy: PairingStrategy) => {
    if (!editingTournament || strategy === pairingStrategy) return;
    setPairingStrategy(strategy);
    setSavingPairingStrategy(true);
    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingTournament.id, rrPairingStrategy: strategy }),
    });
    setSavingPairingStrategy(false);
    if (res.ok) {
      const updated: Tournament = await res.json();
      setEditingTournament(updated);
      fetchTournaments();
    } else {
      const err = await res.json();
      alert(err.error ?? 'Failed to update pairing strategy');
      setPairingStrategy(editingTournament.rrPairingStrategy ?? 'top-vs-top');
    }
  };

  const createPlayer = async (name: string): Promise<string | null> => {
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return err.error ?? 'Failed to add player';
    }
    const created: Player = await res.json();
    await fetchPlayers();
    setSelectedPlayers(prev => [...prev, created.id]);
    return null;
  };

  const endTournament = async (t: Tournament) => {
    const unplayed = (t.matches ?? []).filter(m => !isMatchComplete(m)).length;
    const ended = await confirm({
      title: `End ${t.name}?`,
      message: (
        <>
          <p>The tournament moves to History with the results it has now, and no more games can be recorded. This can&apos;t be undone.</p>
          {unplayed > 0 && (
            <p className="mt-2 font-semibold text-loss">
              {unplayed} {unplayed === 1 ? 'match hasn\u2019t' : 'matches haven\u2019t'} been played yet.
            </p>
          )}
        </>
      ),
      confirmLabel: 'End tournament',
      tone: 'danger',
    });
    if (!ended) return;
    const res = await fetch('/api/tournaments', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, status: 'completed' }),
    });
    if (res.ok) fetchTournaments(); else alert('Failed to end tournament');
  };

  const deleteTournament = async (t: Tournament) => {
    if (!await confirm({
      title: `Delete ${t.name}?`,
      message: 'The tournament, its matches and its games are removed for good. Player stats will no longer include it. This can\u2019t be undone.',
      confirmLabel: 'Delete tournament',
      tone: 'danger',
    })) return;
    const res = await fetch(`/api/tournaments?id=${t.id}`, { method: 'DELETE' });
    if (res.ok) { fetchTournaments(); fetchGames(); } else alert('Failed to delete tournament');
  };

  const activeTournaments = tournaments.filter(t => t.status !== 'completed');

  const getProjectedBracketMatches = (tournament: Tournament): Match[] => {
    const rrMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
            const firstRoundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === 1);
            const firstRoundComplete = firstRoundMatches.length > 0 && firstRoundMatches.every(isMatchComplete);

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
    <main className="app-shell">
      <div className="page-container space-y-8">
        {showEditForm && editingTournament && (
          <EditTournamentPanel
            tournament={editingTournament}
            players={players}
            games={games}
            rosterLocked={hasBracketStarted(editingTournament)}
            selectedPlayers={selectedPlayers}
            onChangeSelectedPlayers={setSelectedPlayers}
            pairingStrategy={pairingStrategy}
            savingPairingStrategy={savingPairingStrategy}
            onChangePairingStrategy={updatePairingStrategy}
            onCreatePlayer={createPlayer}
            onSubmit={updateTournamentPlayers}
            onCancel={closeEditForm}
          />
        )}

        {activeTournaments.map(t => {
          const tm = t.matches ?? [];
          const bracketMatches = tm.filter(m => m.round === 'bracket');
          const bracketStarted = hasBracketStarted(t);
          const canAddThirdPlace = isAdmin &&
            bracketStarted &&
            !bracketMatches.some(m => m.isThirdPlace) &&
            getCompletedSemifinalMatches(t).length === 2;
          const activeTab = activeTabByTournament[t.id] ?? (bracketStarted ? 'bracket' : 'roundRobin');
          const rrMatches = tm.filter(m => m.round === 'roundRobin');
          const currentRoundNumber = rrMatches.length > 0
            ? Math.max(...rrMatches.map(m => m.bracketRound ?? 1))
            : 1;
          const currentRoundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === currentRoundNumber);
          const currentRoundFormat = getRoundRobinFormat(t, currentRoundNumber);
          const currentRoundHasGames = currentRoundMatches.some(m => m.games.length > 0);
          const firstRoundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === 1);
          const firstRoundComplete = firstRoundMatches.length > 0 && firstRoundMatches.every(isMatchComplete);
          const baseProjected = !bracketStarted ? getProjectedBracketMatches(t) : [];
          // Use the locally edited preview once the admin has changed the bracket setup.
          const previewMatches = bracketPreviewById[t.id];
          const effectivePreviewMatches = !bracketStarted && previewMatches && previewMatches.length > 0 ? previewMatches : baseProjected;
          const thirdPlaceEnabled = thirdPlacePreviewById[t.id] ?? t.bracketConfig?.thirdPlaceMatch === true;
          const allRoundRobinComplete = rrMatches.length > 0 && rrMatches.every(isMatchComplete);
          const mainBracketRounds = bracketMatches.filter(m => (m.bracketRound ?? 0) > 0).map(m => m.bracketRound ?? 0);
          const doublesBlocked = currentRoundFormat === 'singles' && !isValidDoublesRoster(t.activePlayers ?? t.players);

          const menuActions: TournamentMenuAction[] | undefined = isAdmin ? [
            { label: 'Edit players and pairing', onSelect: () => openEditForm(t) },
            ...(!bracketStarted ? [{
              label: currentRoundFormat === 'doubles' ? 'Use 1v1 for this round' : 'Play this round as 2v2',
              onSelect: () => changeRoundRobinFormat(t, currentRoundFormat === 'doubles' ? 'singles' : 'doubles'),
              disabled: currentRoundHasGames || doublesBlocked,
              hint: currentRoundHasGames
                ? 'The format cannot change after a game has been played'
                : doublesBlocked ? '2v2 needs active players in groups of four' : undefined,
            }] : []),
            { label: 'End tournament', onSelect: () => endTournament(t) },
            { label: 'Delete tournament', onSelect: () => deleteTournament(t), tone: 'danger' as const },
          ] : undefined;

          const tabClass = (tab: 'roundRobin' | 'bracket') =>
            `-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
              activeTab === tab ? 'border-ball text-ink' : 'border-transparent text-muted hover:text-ink'
            }`;

          return (
            <article key={t.id} className="space-y-8">
              <TournamentHeader
                tournament={t}
                stage={bracketStarted
                  ? `Bracket · round ${mainBracketRounds.length ? Math.max(...mainBracketRounds) : 1}`
                  : `Round robin · round ${currentRoundNumber} of ${t.roundRobinRounds}`}
                stats={[
                  { label: 'Round robin matches', value: `${rrMatches.filter(isMatchComplete).length}/${rrMatches.length}` },
                  { label: 'Games played', value: tm.reduce((total, m) => total + m.games.length, 0) },
                  { label: 'Active players', value: (t.activePlayers ?? t.players).length },
                ]}
                menuActions={menuActions}
              />

              <nav className="flex gap-6 border-b border-line" aria-label="Tournament stage">
                <button
                  type="button"
                  aria-current={activeTab === 'roundRobin' ? 'page' : undefined}
                  onClick={() => setActiveTabByTournament(prev => ({ ...prev, [t.id]: 'roundRobin' }))}
                  className={tabClass('roundRobin')}
                >
                  Round robin
                </button>
                <button
                  type="button"
                  aria-current={activeTab === 'bracket' ? 'page' : undefined}
                  onClick={() => {
                    if (!bracketStarted && (!bracketPreviewById[t.id] || bracketPreviewById[t.id].length === 0) && effectivePreviewMatches.length > 0) {
                      setBracketPreviewById(prev => ({ ...prev, [t.id]: [...effectivePreviewMatches] }));
                    }
                    setActiveTabByTournament(prev => ({ ...prev, [t.id]: 'bracket' }));
                  }}
                  className={tabClass('bracket')}
                >
                  Bracket{!bracketStarted && ' preview'}
                </button>
              </nav>

              {activeTab === 'roundRobin' && (
                <div className="space-y-8">
                  {isAdmin && !bracketStarted && (
                    <section>
                      <div className="flex items-baseline gap-3">
                        <h3 className="label-caps text-muted">Playing today</h3>
                        <span className="text-xs text-muted">Tap a name to sit someone out</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {t.players.map(pid => {
                          const activeList = t.activePlayers ?? t.players;
                          const isActive = activeList.includes(pid);
                          const nextActivePlayers = isActive
                            ? activeList.filter(activeId => activeId !== pid)
                            : [...activeList, pid];
                          const blockedByDoubles = currentRoundFormat === 'doubles' &&
                            (currentRoundHasGames || !isValidDoublesRoster(nextActivePlayers));
                          return (
                            <button
                              key={pid}
                              type="button"
                              onClick={() => toggleActivePlayer(t, pid)}
                              disabled={blockedByDoubles}
                              aria-pressed={isActive}
                              title={blockedByDoubles
                                ? currentRoundHasGames
                                  ? 'Roster changes are locked after a 2v2 game has been played'
                                  : 'A 2v2 round must keep active players in groups of four'
                                : undefined}
                              className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                isActive
                                  ? 'border-table bg-table-soft text-table hover:bg-table hover:text-table-ink'
                                  : 'border-line bg-surface text-muted line-through hover:border-line-strong'
                              }`}
                            >
                              {getPlayerName(pid)}
                            </button>
                          );
                        })}
                      </div>
                      {currentRoundFormat === 'doubles' && (
                        <p className="mt-2 text-xs text-ink-soft">
                          Round {currentRoundNumber} is 2v2. Before play, roster changes must keep the active count in groups of four.
                        </p>
                      )}
                    </section>
                  )}

                  {!bracketStarted ? (
                    <RoundRobinView
                      tournament={t}
                      players={players}
                      getPlayerName={getPlayerName}
                      onAddGame={addGameToMatch}
                      onDeleteMatch={deleteMatch}
                      onDeleteGame={deleteGame}
                      onSaveGameEdit={saveGameEdit}
                      onSwapPlayers={swapPlayers}
                      onAddMarker={addMarker}
                      onAdvanceRound={advanceRound}
                      onAddRound={addRoundRobinRound}
                      onRefreshMatches={refreshMatches}
                      readOnly={!isAdmin}
                    />
                  ) : (
                    <>
                      <Leaderboard tournament={t} players={players} getPlayerName={getPlayerName} bracketMatches={bracketMatches} />
                      <PastRoundsSummary roundRobinMatches={rrMatches} getPlayerName={getPlayerName} />
                    </>
                  )}
                </div>
              )}

              {activeTab === 'bracket' && (
                <div className="space-y-6">
                  {isAdmin && !bracketStarted && (
                    <BracketSetupPanel
                      firstRoundComplete={firstRoundComplete}
                      allRoundRobinComplete={allRoundRobinComplete}
                      thirdPlaceEnabled={thirdPlaceEnabled}
                      onChangeThirdPlace={enabled => setThirdPlacePreviewById(prev => ({ ...prev, [t.id]: enabled }))}
                      onApplyPlayInMode={mode => applyPlayInModeToPreview(t, mode)}
                      onResetPreview={() => resetBracketPreview(t.id)}
                      onStartBracket={() => startBracket(t)}
                    />
                  )}

                  {canAddThirdPlace && (
                    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gold/40 bg-gold-soft px-5 py-4">
                      <div>
                        <p className="font-semibold text-ink">The semifinals are done</p>
                        <p className="text-sm text-ink-soft">Add a game between the two semifinal losers for third place.</p>
                      </div>
                      <button type="button" onClick={() => addThirdPlaceMatch(t)} className="button button-primary">
                        Add third-place game
                      </button>
                    </section>
                  )}

                  {bracketStarted || effectivePreviewMatches.length > 0 ? (
                    <section className="surface-card p-6">
                      <BracketView
                        bracketMatches={bracketStarted ? bracketMatches : effectivePreviewMatches}
                        getPlayerName={getPlayerName}
                        players={players}
                        onAddGame={addGameToMatch}
                        onSaveGameEdit={saveGameEdit}
                        onDeleteGame={isAdmin && bracketStarted ? deleteGame : undefined}
                        onChangeBestOf={isAdmin && bracketStarted ? changeMatchBestOf : undefined}
                        onSwapPlayers={isAdmin ? (bracketStarted ? swapPlayers : async (mid, p1, p2) => { handlePreviewBracketSwap(t.id, mid, p1, p2, effectivePreviewMatches); }) : undefined}
                        validateGameScore={validateScore}
                        readOnly={!isAdmin}
                        previewMode={isAdmin && !bracketStarted}
                        showThirdPlace={thirdPlaceEnabled || bracketMatches.some(m => m.isThirdPlace)}
                      />
                    </section>
                  ) : (
                    <section className="surface-card p-6">
                      <p className="font-semibold text-ink">The bracket preview appears once round 1 is complete.</p>
                      <p className="mt-1 text-sm text-ink-soft">Seeding comes from the round robin standings.</p>
                    </section>
                  )}

                  <div className="grid gap-6 lg:grid-cols-2">
                    <Leaderboard
                      tournament={t}
                      players={players}
                      getPlayerName={getPlayerName}
                      bracketMatches={bracketStarted ? bracketMatches : effectivePreviewMatches}
                    />
                    <GameHistory matches={tm} getPlayerName={getPlayerName} />
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {activeTournaments.length === 0 && (
          <section className="scoreboard flex flex-wrap items-center justify-between gap-6 p-8">
            <div>
              <p className="label-caps text-board-muted">Between tournaments</p>
              <h1 className="font-display mt-2 text-3xl">No tournament running</h1>
              <p className="mt-2 text-board-muted">
                {isAdmin ? 'Set up the next one: players, rounds and bracket format.' : 'Check back when the next tournament starts.'}
              </p>
            </div>
            {isAdmin && (
              <Link href="/tournaments/new" className="button button-accent px-5 py-3 text-base">
                Start a tournament →
              </Link>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
