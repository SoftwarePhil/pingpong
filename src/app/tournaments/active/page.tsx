'use client';

import { useState, useEffect } from 'react';
import { Tournament, Player, Match, Game } from '../../../types/pingpong';
import Link from 'next/link';
import CelebrationModal from './CelebrationModal';

export default function ActiveTournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [name, setName] = useState('');
  const [roundRobinRounds, setRoundRobinRounds] = useState(3);
  const [bracketRounds] = useState([{ round: 1, bestOf: 3 }, { round: 2, bestOf: 5 }]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editScore1, setEditScore1] = useState('');
  const [editScore2, setEditScore2] = useState('');
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [celebrationTournament, setCelebrationTournament] = useState<Tournament | null>(null);
  const [previousTournaments, setPreviousTournaments] = useState<Tournament[]>([]);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [swapPlayer1Id, setSwapPlayer1Id] = useState('');
  const [swapPlayer2Id, setSwapPlayer2Id] = useState('');

  useEffect(() => {
    fetchTournaments();
    fetchPlayers();
    fetchMatches();
    fetchGames();
  }, []);

  const fetchTournaments = async () => {
    const res = await fetch('/api/tournaments');
    const data = await res.json();

    // Check if any tournament just completed
    const justCompleted = data.find((t: Tournament) =>
      t.status === 'completed' &&
      previousTournaments.find(pt => pt.id === t.id && pt.status !== 'completed')
    );

    if (justCompleted) {
      setCelebrationTournament(justCompleted);
    }

    setPreviousTournaments(data);
    setTournaments(data);
  };

  const fetchPlayers = async () => {
    const res = await fetch('/api/players');
    const data = await res.json();
    setPlayers(data);
  };

  const fetchMatches = async () => {
    const res = await fetch('/api/matches');
    const data = await res.json();
    setMatches(data);
  };

  const fetchGames = async () => {
    const res = await fetch('/api/games');
    const data = await res.json();
    setGames(data);
  };

  const updateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTournament || [...new Set(selectedPlayers)].length < 2) return;
    const res = await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingTournament.id,
        players: [...new Set(selectedPlayers)],
      }),
    });
    if (res.ok) {
      setEditingTournament(null);
      setSelectedPlayers([]);
      setShowForm(false);
      setFormMode(null);
      fetchTournaments();
      fetchMatches();
      alert('Tournament updated successfully');
    } else {
      const error = await res.json();
      alert(error.error || 'Failed to update tournament');
    }
  };

  const startBracket = async (tournament: Tournament) => {
    try {
      const res = await fetch('/api/tournaments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tournament.id, status: 'bracket' }),
      });

      if (res.ok) {
        await fetchTournaments();
        await fetchMatches();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to start bracket');
      }
    } catch (error) {
      console.error('Error starting bracket:', error);
      alert('Error starting bracket');
    }
  };

  const getPlayerName = (id: string) => {
    if (id === 'PLAY_IN_WINNER') {
      return 'Play-in Winner';
    }
    const player = players.find(p => p.id === id);
    return player ? player.name : 'Unknown';
  };

  const getWinnerName = (tournament: Tournament) => {
    const tournamentMatches = (tournament.matches || []).filter(m => m.round === 'bracket');
    const finalMatch = tournamentMatches.find(m => m.bracketRound === Math.max(...tournamentMatches.map(tm => tm.bracketRound || 0)));
    return finalMatch?.winnerId ? getPlayerName(finalMatch.winnerId) : 'Unknown Champion';
  };

  const getTournamentMatches = (tournamentId: string) => {
    return matches.filter(m => m.tournamentId === tournamentId);
  };

  const addGameToMatch = async (match: Match, score1: number, score2: number) => {
    if (match.games.length >= match.bestOf || match.winnerId) return;
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        score1,
        score2,
        matchId: match.id,
      }),
    });
    if (res.ok) {
      // Refresh all data to update UI - backend handles winner detection now
      await Promise.all([
        fetchMatches(),
        fetchGames(),
        fetchTournaments()
      ]);

      // Check if we need to advance bracket rounds
      await checkBracketAdvancement(match.tournamentId);
    }
  };

  const checkBracketAdvancement = async (tournamentId: string) => {
    // Only advance bracket rounds automatically, keep round-robin manual
    try {
      // Fetch latest tournament data and matches
      const [tournamentRes, matchesRes] = await Promise.all([
        fetch(`/api/tournaments`),
        fetch('/api/matches')
      ]);
      const allTournaments = await tournamentRes.json();
      const allMatches = await matchesRes.json();
      const tournament = allTournaments.find((t: Tournament) => t.id === tournamentId);

      if (!tournament || tournament.status !== 'bracket') return;

      const bracketMatches = allMatches.filter((m: Match) => m.tournamentId === tournamentId && m.round === 'bracket');
      if (bracketMatches.length === 0) return;

      // Find the highest round number (excluding play-in round 0)
      const bracketRounds = bracketMatches
        .map((m: Match) => m.bracketRound ?? 0)
        .filter((r: number) => r > 0); // Exclude play-in round

      if (bracketRounds.length === 0) return; // No main bracket rounds yet

      const currentRound = Math.max(...bracketRounds);
      const currentRoundMatches = bracketMatches.filter((m: Match) => m.bracketRound === currentRound);

      // Check if all matches in the current highest round are complete
      const allComplete = currentRoundMatches.length > 0 && currentRoundMatches.every((m: Match) => m.winnerId);

      if (allComplete) {
        await fetch('/api/tournaments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: tournamentId, action: 'advanceRound' }),
        });
        await fetchTournaments();
        await fetchMatches();
      }
    } catch (error) {
      console.error('Error in checkBracketAdvancement:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'roundRobin': return 'bg-blue-100 text-blue-800';
      case 'bracket': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const BracketMatch = ({ match }: { match: Match }) => (
    <div className="bg-white border-2 border-gray-300 rounded-lg p-4 shadow-sm min-w-[250px] max-w-[300px] w-full">
      <div className="flex justify-between items-center mb-3">
        <span className="font-semibold text-gray-800 text-sm truncate">
          {match.round === 'bracket' ? (match.bracketRound === 0 ? 'Play-in Round' : `Round ${match.bracketRound}`) : `Round Robin - Round ${match.bracketRound || 1}`}
        </span>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded whitespace-nowrap">
            Best of {match.bestOf}
          </span>
          {match.round === 'roundRobin' && match.games.length === 0 && !match.winnerId && (
            <button
              onClick={() => {
                setEditingMatchId(match.id);
                setSwapPlayer1Id(match.player1Id);
                setSwapPlayer2Id(match.player2Id);
              }}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              title="Change players"
            >
              ↔️
            </button>
          )}
          <button
            onClick={() => deleteMatch(match.id)}
            className="text-red-600 hover:text-red-800 text-sm font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
            title="Delete match"
          >
            🗑️
          </button>
        </div>
      </div>

      {editingMatchId === match.id && (
        <div className="mb-3 p-3 bg-blue-50 rounded-lg border-2 border-blue-200">
          <p className="text-xs font-semibold text-blue-800 mb-2">Change Players</p>
          <div className="space-y-2">
            <select
              value={swapPlayer1Id}
              onChange={(e) => setSwapPlayer1Id(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white"
            >
              {(tournaments.find(t => t.id === match.tournamentId)?.players ?? []).map(pid => (
                <option key={pid} value={pid}>{getPlayerName(pid)}</option>
              ))}
            </select>
            <div className="text-center text-xs text-gray-500 font-bold">VS</div>
            <select
              value={swapPlayer2Id}
              onChange={(e) => setSwapPlayer2Id(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white"
            >
              {(tournaments.find(t => t.id === match.tournamentId)?.players ?? []).map(pid => (
                <option key={pid} value={pid}>{getPlayerName(pid)}</option>
              ))}
            </select>
            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => swapMatchPlayers(match.id)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded font-medium transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditingMatchId(null)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-3 py-1 rounded font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className={`flex justify-between items-center p-3 rounded border ${match.winnerId === match.player1Id ? 'bg-green-100 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
          <span className="font-medium text-gray-900 truncate mr-2" title={getPlayerName(match.player1Id)}>{getPlayerName(match.player1Id)}</span>
          <span className="text-sm text-gray-600 flex-shrink-0">
            {match.games.filter(g => g.score1 > g.score2).length}W
          </span>
        </div>

        <div className="text-center text-gray-500 font-bold text-sm">
          {match.player2Id === 'BYE' ? 'BYE' : 'VS'}
        </div>

        {match.player2Id !== 'BYE' && (
          <div className={`flex justify-between items-center p-3 rounded border ${match.winnerId === match.player2Id ? 'bg-green-100 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
            <span className="font-medium text-gray-900 truncate mr-2" title={match.player2Id === 'BYE' ? 'BYE' : getPlayerName(match.player2Id)}>{match.player2Id === 'BYE' ? 'BYE' : getPlayerName(match.player2Id)}</span>
            <span className="text-sm text-gray-600 flex-shrink-0">
              {match.games.filter(g => g.score2 > g.score1).length}W
            </span>
          </div>
        )}
      </div>

      {match.winnerId && (
        <div className="mt-4 text-center">
          <span className="inline-block bg-yellow-400 text-yellow-900 px-3 py-2 rounded-full text-sm font-bold border-2 border-yellow-500">
            🏆 {getPlayerName(match.winnerId)}
          </span>
        </div>
      )}

      {match.games.length < match.bestOf && !match.winnerId && match.player1Id !== match.player2Id && match.player2Id !== 'BYE' && (
        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.target as HTMLFormElement);
          const score1 = parseInt(formData.get('score1') as string);
          const score2 = parseInt(formData.get('score2') as string);

          // Client-side validation for ping pong rules (deuce logic)
           //DO NOT CHANGE THIS BLOCK OF CODE
          const maxScore = Math.max(score1, score2);
          const minScore = Math.min(score1, score2);
          const scoreDifference = maxScore - minScore;
           //DO NOT CHANGE THIS BLOCK OF CODE
          if (maxScore < 11) {
            alert('Game must reach 11 points to be complete');
            return;
          }
          if (maxScore > 11 && scoreDifference !== 2) {
            alert('Game must be won by 2 points');
            return;
          }
          addGameToMatch(match, score1, score2);
        }} className="mt-4 space-y-3">
          <div className="flex space-x-2">
            <input
              name="score1"
              type="number"
              placeholder={`${getPlayerName(match.player1Id).length > 15 ? getPlayerName(match.player1Id).substring(0, 12) + '...' : getPlayerName(match.player1Id)}`}
              className="flex-1 border-2 border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              required
              min="0"
              max="50"
            />
            <input
              name="score2"
              type="number"
              placeholder={`${getPlayerName(match.player2Id).length > 15 ? getPlayerName(match.player2Id).substring(0, 12) + '...' : getPlayerName(match.player2Id)}`}
              className="flex-1 border-2 border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              required
              min="0"
              max="50"
            />
          </div>
          <div className="text-xs text-gray-600 text-center">
            Games go to 11, win by 2 points
          </div>
          <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium transition-colors border-2 border-green-700">
            Add Game
          </button>
        </form>
      )}

      {match.games.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Games:</h4>
          <div className="space-y-2">
            {match.games.map((game) => (
              <div key={game.id} className="flex items-center justify-between bg-gray-50 p-2 rounded border min-w-0">
                {editingGame?.id === game.id ? (
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <span className="text-sm text-gray-600 truncate" title={`${getPlayerName(game.player1Id)} vs ${getPlayerName(game.player2Id)}`}>
                      {getPlayerName(game.player1Id)} vs {getPlayerName(game.player2Id)}:
                    </span>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <input
                        type="number"
                        value={editScore1}
                        onChange={(e) => setEditScore1(e.target.value)}
                        className="w-16 px-2 py-1 border rounded text-sm"
                        min="0"
                      />
                      <span className="text-sm">-</span>
                      <input
                        type="number"
                        value={editScore2}
                        onChange={(e) => setEditScore2(e.target.value)}
                        className="w-16 px-2 py-1 border rounded text-sm"
                      />
                      <button
                        onClick={saveGameEdit}
                        className="text-green-600 hover:text-green-800 text-sm font-medium px-2 py-1 rounded hover:bg-green-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditingGame}
                        className="text-gray-600 hover:text-gray-800 text-sm font-medium px-2 py-1 rounded hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <span className="text-sm text-gray-600 truncate" title={`${getPlayerName(game.player1Id)} vs ${getPlayerName(game.player2Id)}`}>
                        {getPlayerName(game.player1Id)} vs {getPlayerName(game.player2Id)}:
                      </span>
                      <span className={`font-medium text-sm px-2 py-1 rounded flex-shrink-0 ${
                        game.score1 > game.score2 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {game.score1}-{game.score2}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => startEditingGame(game)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50"
                        title="Edit game"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteGame(game.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium px-2 py-1 rounded hover:bg-red-50"
                        title="Delete game"
                      >
                        🗑️
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const deleteMatch = async (matchId: string) => {
    if (!confirm('Are you sure you want to delete this match? This will also delete all games in this match.')) {
      return;
    }

    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Refresh data
        fetchMatches();
        fetchGames();
        fetchTournaments();
      } else {
        alert('Failed to delete match');
      }
    } catch (error) {
      console.error('Error deleting match:', error);
      alert('Error deleting match');
    }
  };

  const startEditingGame = (game: Game) => {
    setEditingGame(game);
    setEditScore1(game.score1.toString());
    setEditScore2(game.score2.toString());
  };

  const cancelEditingGame = () => {
    setEditingGame(null);
    setEditScore1('');
    setEditScore2('');
  };

  const saveGameEdit = async () => {
    if (!editingGame) return;

    const score1 = parseInt(editScore1);
    const score2 = parseInt(editScore2);

    if (isNaN(score1) || isNaN(score2)) {
      alert('Please enter valid scores');
      return;
    }

    try {
      const res = await fetch(`/api/games/${editingGame.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score1,
          score2,
        }),
      });

      if (res.ok) {
        fetchGames();
        fetchMatches();
        cancelEditingGame();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to update game');
      }
    } catch (error) {
      console.error('Error updating game:', error);
      alert('Error updating game');
    }
  };

  const deleteGame = async (gameId: string) => {
    if (!confirm('Are you sure you want to delete this game?')) {
      return;
    }

    try {
      const res = await fetch(`/api/games/${gameId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchGames();
        fetchMatches();
      } else {
        alert('Failed to delete game');
      }
    } catch (error) {
      console.error('Error deleting game:', error);
      alert('Error deleting game');
    }
  };

  const swapMatchPlayers = async (matchId: string) => {
    if (!swapPlayer1Id || !swapPlayer2Id) {
      alert('Please select both players');
      return;
    }
    if (swapPlayer1Id === swapPlayer2Id) {
      alert('Player 1 and Player 2 must be different');
      return;
    }
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1Id: swapPlayer1Id, player2Id: swapPlayer2Id }),
      });
      if (res.ok) {
        setEditingMatchId(null);
        await fetchMatches();
        await fetchTournaments();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to update match players');
      }
    } catch (error) {
      console.error('Error updating match players:', error);
      alert('Error updating match players');
    }
  };

  const getCurrentRound = (tournamentId: string): number => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return 1;

    const tournamentMatches = tournament.matches || [];
    const roundRobinMatches = tournamentMatches.filter(m => m.round === 'roundRobin');
    if (roundRobinMatches.length === 0) return 1;

    // Find the highest bracketRound number among round robin matches
    const maxRound = Math.max(...roundRobinMatches.map(m => m.bracketRound || 1));
    return maxRound;
  };

  const advanceRound = async (tournament: Tournament) => {
    try {
      const res = await fetch('/api/tournaments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tournament.id,
          action: 'advanceRound',
        }),
      });

      if (res.ok) {
        const updatedTournament = await res.json();
        await fetchTournaments();
        await fetchMatches();
        // Check if tournament is now completed
        if (updatedTournament.status === 'completed') {
          alert('Tournament completed!');
        }
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to advance round');
      }
    } catch (error) {
      console.error('Error advancing round:', error);
      alert('Error advancing round');
    }
  };

  const endTournament = async (tournament: Tournament) => {
    if (!confirm('Are you sure you want to end this tournament?')) return;
    try {
      const res = await fetch('/api/tournaments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tournament.id,
          status: 'completed',
        }),
      });
      if (res.ok) {
        fetchTournaments();
        fetchMatches();
        alert('Tournament ended successfully');
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to end tournament');
      }
    } catch (error) {
      console.error(error);
      alert('Failed to end tournament');
    }
  };

  const deleteTournament = async (tournament: Tournament) => {
    if (!confirm('Are you sure you want to delete this tournament? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/tournaments?id=${tournament.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchTournaments();
        fetchMatches();
        fetchGames();
        alert('Tournament deleted successfully');
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to delete tournament');
      }
    } catch (error) {
      console.error(error);
      alert('Failed to delete tournament');
    }
  };

  const getPlayerStandings = (tournament: Tournament, players: string[]) => {
    const playerStats: { [playerId: string]: { wins: number; losses: number; totalGames: number } } = {};
    players.forEach(playerId => {
      playerStats[playerId] = { wins: 0, losses: 0, totalGames: 0 };
    });

    // Get all round robin matches for this tournament from embedded matches
    const tournamentMatches = (tournament.matches || []).filter(m => m.round === 'roundRobin');
    
    tournamentMatches.forEach(match => {
      if (match.winnerId && match.player2Id !== 'BYE') {
        playerStats[match.winnerId].wins++;
        playerStats[match.winnerId].totalGames++;

        const loserId = match.player1Id === match.winnerId ? match.player2Id : match.player1Id;
        if (loserId && playerStats[loserId]) {
          playerStats[loserId].losses++;
          playerStats[loserId].totalGames++;
        }
      }
    });
    
    // Convert to array and sort
    return players
      .map(playerId => ({
        playerId,
        ...playerStats[playerId]
      }))
      .sort((a, b) => {
        // First by wins (descending)
        if (a.wins !== b.wins) {
          return b.wins - a.wins;
        }
        // Then by total games played (ascending)
        return a.totalGames - b.totalGames;
      });
  };

  const activeTournaments = tournaments.filter(tournament => tournament.status !== 'completed');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">⚡ Active Tournaments</h1>
            <p className="text-gray-600 text-lg">Manage ongoing ping pong tournaments</p>
          </div>
          <div className="flex space-x-4">
            <Link href="/tournaments" className="bg-white hover:bg-gray-100 text-gray-800 px-6 py-3 rounded-lg shadow border-2 border-gray-300 transition-colors font-medium">
              ← Back to Tournaments
            </Link>
            <Link href="/tournaments/new" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow font-medium transition-colors border-2 border-blue-700">
              + New Tournament
            </Link>
          </div>
        </div>

        {/* Edit Tournament Form */}
        {showForm && formMode === 'edit' && editingTournament && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border-2 border-gray-200">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Edit Tournament Players</h2>
            <form onSubmit={updateTournament} className="space-y-8">
              <div>
                <label className="block text-lg font-semibold text-gray-800 mb-4">Select Players</label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {players.map(p => (
                    <label key={p.id} className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors border-2 border-gray-200">
                      <input
                        type="checkbox"
                        checked={selectedPlayers.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            if (!selectedPlayers.includes(p.id)) {
                              setSelectedPlayers([...selectedPlayers, p.id]);
                            }
                          } else {
                            setSelectedPlayers(selectedPlayers.filter(id => id !== p.id));
                          }
                        }}
                        className="w-5 h-5 text-blue-600 rounded border-2 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="font-medium text-gray-900 text-lg">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t-2 border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormMode(null);
                    setEditingTournament(null);
                    setSelectedPlayers([]);
                  }}
                  className="px-8 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors font-medium text-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-lg border-2 border-blue-700"
                >
                  Update Players
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tournaments List */}
        <div className="space-y-8">
          {activeTournaments.map((tournament) => {
            const tournamentMatches = tournament.matches || [];
            const currentRound = getCurrentRound(tournament.id);
            const roundRobinMatches = tournamentMatches.filter(m =>
              m.round === 'roundRobin' && (m.bracketRound || 1) === currentRound
            );
            const bracketMatches = tournamentMatches.filter(m => m.round === 'bracket');
            
            return (
              <div 
                key={tournament.id} 
                className="bg-white rounded-xl shadow-lg overflow-hidden border-2 border-gray-200"
              >
                {/* Tournament Header */}
                <div className="bg-gray-800 text-white p-8">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h2 className="text-3xl font-bold mb-3">{tournament.name}</h2>
                      <p className="text-gray-300 text-lg">
                        {tournament.players.length} players • Started {new Date(tournament.startDate).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-4 py-2 rounded-full text-sm font-bold border-2 ${getStatusColor(tournament.status)}`}>
                      {tournament.status === 'roundRobin' ? 'Round Robin' :
                       tournament.status === 'bracket' ? (() => {
                         const rounds = bracketMatches.map(m => m.bracketRound || 0).filter(r => r > 0);
                         const currentRound = rounds.length > 0 ? Math.max(...rounds) : 1;
                         return `Bracket - Round ${currentRound}`;
                       })() :
                       tournament.status === 'completed' ? 'Completed' : tournament.status}
                    </span>
                  </div>
                </div>

                <div className="p-8">
                  {/* Players */}
                  <div className="mb-8">
                    <h3 className="text-2xl font-semibold text-gray-900 mb-4">Players</h3>
                    <div className="flex flex-wrap gap-3">
                      {tournament.players.map(playerId => (
                        <span key={playerId} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-full text-sm font-medium border border-gray-300">
                          {getPlayerName(playerId)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Round Robin Stage */}
                  {tournament.status === 'roundRobin' && (
                    <div className="mb-8">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-semibold text-gray-900">Round Robin Matches</h3>
                        <div className="text-lg font-medium text-gray-700">
                          Round {getCurrentRound(tournament.id)} of {tournament.roundRobinRounds}
                        </div>
                      </div>
                      
                      {/* Player Standings */}
                      <div className="mb-6 bg-gray-50 rounded-lg p-4">
                        <h4 className="text-lg font-semibold text-gray-900 mb-3">Current Standings</h4>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-300">
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Player</th>
                                <th className="text-center py-2 px-3 font-medium text-gray-700">Wins</th>
                                <th className="text-center py-2 px-3 font-medium text-gray-700">Losses</th>
                                <th className="text-center py-2 px-3 font-medium text-gray-700">Win %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {getPlayerStandings(tournament, tournament.players).map((standing, index) => (
                                <tr key={standing.playerId} className={`border-b border-gray-200 ${index < 2 ? 'bg-yellow-50' : ''}`}>
                                  <td className="py-2 px-3 font-medium text-gray-900">
                                    {index + 1}. {getPlayerName(standing.playerId)}
                                  </td>
                                  <td className="text-center py-2 px-3">{standing.wins}</td>
                                  <td className="text-center py-2 px-3">{standing.losses}</td>
                                  <td className="text-center py-2 px-3">
                                    {standing.totalGames > 0 ? Math.round((standing.wins / standing.totalGames) * 100) : 0}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {roundRobinMatches.map((match) => (
                          <BracketMatch key={match.id} match={match} />
                        ))}
                      </div>

                      {roundRobinMatches.length > 0 && roundRobinMatches.every(m => m.winnerId) && (
                        <div className="mt-8 text-center">
                          {getCurrentRound(tournament.id) < tournament.roundRobinRounds ? (
                            <button
                              onClick={() => advanceRound(tournament)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-lg shadow-lg font-bold text-xl transition-colors border-2 border-blue-700"
                            >
                              ⏭️ Advance to Next Round
                            </button>
                          ) : (
                            <button
                              onClick={() => startBracket(tournament)}
                              className="bg-purple-600 hover:bg-purple-700 text-white px-10 py-4 rounded-lg shadow-lg font-bold text-xl transition-colors border-2 border-purple-700"
                            >
                              🏆 Start Bracket Stage
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bracket Stage */}
                  {tournament.status === 'bracket' && (
                    <div>
                      <h3 className="text-2xl font-semibold text-gray-900 mb-6">Bracket</h3>
                      <div className="bg-gray-50 rounded-lg p-8 border-2 border-gray-200">
                        <div className="flex items-start justify-center min-w-max">
                          {/* Get all bracket rounds */}
                          {(() => {
                            const uniqueRounds = [...new Set(bracketMatches.map(m => m.bracketRound).filter(r => r !== undefined && r !== null))].sort((a, b) => a - b);
                            
                            return uniqueRounds.map((roundNum) => {
                              const roundMatches = bracketMatches.filter(m => m.bracketRound === roundNum);
                              const isFinalRound = tournament.status === 'completed' && roundNum === Math.max(...bracketMatches.map(m => m.bracketRound || 0));
                              const isCompleted = roundMatches.every(m => m.winnerId);

                              return (
                                <div key={roundNum} className="flex flex-col items-center mx-6">
                                  <h4 className={`text-center font-bold mb-6 text-xl ${isFinalRound ? 'text-yellow-600' : 'text-gray-800'}`}>
                                    {isFinalRound ? '🏆 Final' : roundNum === 0 ? 'Play-in' : `Round ${roundNum}`}
                                    {isCompleted && <span className="ml-3 text-green-600 text-lg">✓</span>}
                                  </h4>

                                  <div className="space-y-8">
                                    {roundMatches.map((match) => (
                                      <div key={match.id}>
                                        <BracketMatch
                                          match={match}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tournament Stats */}
                  <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gray-50 rounded-lg p-6 text-center border-2 border-gray-200">
                      <div className="text-3xl font-bold text-gray-900">{getCurrentRound(tournament.id)}</div>
                      <div className="text-gray-600 font-medium">Current Round</div>
                      <div className="text-sm text-gray-500 mt-1">of {tournament.roundRobinRounds}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-6 text-center border-2 border-gray-200">
                      <div className="text-3xl font-bold text-gray-900">{tournamentMatches.filter(m => m.round === 'roundRobin' && m.winnerId).length}</div>
                      <div className="text-gray-600 font-medium">Matches Completed</div>
                      <div className="text-sm text-gray-500 mt-1">Round Robin</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-6 text-center border-2 border-gray-200">
                      <div className="text-3xl font-bold text-gray-900">{games.filter(g => g.matchId && tournamentMatches.some(m => m.id === g.matchId)).length}</div>
                      <div className="text-gray-600 font-medium">Games Played</div>
                      <div className="text-sm text-gray-500 mt-1">Total</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-8 flex justify-center space-x-4">
                    <button
                      onClick={() => {
                        setFormMode('edit');
                        setEditingTournament(tournament);
                        setName(tournament.name);
                        setRoundRobinRounds(tournament.roundRobinRounds);
                        setSelectedPlayers(tournament.players);
                        setShowForm(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg font-bold text-lg transition-colors border-2 border-blue-700"
                    >
                      ✏️ Edit Players
                    </button>
                    <button
                      onClick={() => endTournament(tournament)}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg shadow-lg font-bold text-lg transition-colors border-2 border-orange-700"
                    >
                      🏁 End Tournament
                    </button>
                    <button
                      onClick={() => deleteTournament(tournament)}
                      className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg shadow-lg font-bold text-lg transition-colors border-2 border-red-700"
                    >
                      🗑️ Delete Tournament
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {activeTournaments.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl shadow-lg border-2 border-gray-200">
            <div className="text-8xl mb-6">⚡</div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">No active tournaments</h3>
            <p className="text-gray-600 mb-8 text-lg">Create a new tournament to get started!</p>
            <Link href="/tournaments/new" className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-lg shadow-lg font-bold text-xl transition-colors border-2 border-blue-700 inline-block">
              Create Tournament
            </Link>
          </div>
        )}

        {celebrationTournament && (
          <CelebrationModal
            winner={getWinnerName(celebrationTournament)}
            tournamentName={celebrationTournament.name}
            onClose={() => setCelebrationTournament(null)}
          />
        )}
      </div>
    </div>
  );
}