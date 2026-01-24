'use client';

import { useState, useEffect } from 'react';
import { Tournament, Player, Match, Game } from '../../types/pingpong';
import Link from 'next/link';

export default function TournamentsPage() {
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
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editScore1, setEditScore1] = useState('');
  const [editScore2, setEditScore2] = useState('');
  const [showTournamentDetail, setShowTournamentDetail] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    fetchTournaments();
    fetchPlayers();
    fetchMatches();
    fetchGames();
  }, []);

  const fetchTournaments = async () => {
    const res = await fetch('/api/tournaments');
    const data = await res.json();
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

  const createTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || selectedPlayers.length < 2) return;
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        roundRobinRounds,
        bracketRounds,
        players: [...new Set(selectedPlayers)],
      }),
    });
    if (res.ok) {
      setName('');
      setSelectedPlayers([]);
      setShowForm(false);
      setFormMode(null);
      setEditingTournament(null);
      fetchTournaments();
      fetchMatches();
    }
  };

  const updateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTournament || selectedPlayers.length < 2) return;
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
    const tournamentMatches = getTournamentMatches(tournament.id);
    const roundRobinMatches = tournamentMatches.filter(m => m.round === 'roundRobin');
    if (!roundRobinMatches.every(m => m.winnerId)) return;

    // Compute standings
    const wins: { [key: string]: number } = {};
    tournament.players.forEach(p => wins[p] = 0);
    roundRobinMatches.forEach(m => {
      if (m.winnerId) wins[m.winnerId]++;
    });
    const sortedPlayers = tournament.players.sort((a, b) => wins[b] - wins[a]);

    // Generate bracket matches
    const bracketMatches = [];
    for (let i = 0; i < sortedPlayers.length; i += 2) {
      if (i + 1 < sortedPlayers.length) {
        // Create match between two players
        const newMatch: Partial<Match> = {
          tournamentId: tournament.id,
          player1Id: sortedPlayers[i],
          player2Id: sortedPlayers[i + 1],
          round: 'bracket',
          bracketRound: 1,
          bestOf: tournament.bracketRounds[0]?.bestOf || 3,
          games: [],
        };
        const res = await fetch('/api/matches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newMatch),
        });
        if (res.ok) {
          bracketMatches.push(await res.json());
        }
      } else {
        // Odd number of players - this player gets a bye to the next round
        const byePlayer = sortedPlayers[i];
        console.log(`Player ${byePlayer} gets a bye to round 2`);
        
        // Create a bye match that the player automatically wins
        const byeMatch: Partial<Match> = {
          tournamentId: tournament.id,
          player1Id: byePlayer,
          player2Id: byePlayer, // Same player for bye
          round: 'bracket',
          bracketRound: 1,
          bestOf: 1, // Bye matches are best of 1
          games: [],
          winnerId: byePlayer, // Automatically set winner
        };
        
        const byeRes = await fetch('/api/matches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(byeMatch),
        });
        
        if (byeRes.ok) {
          bracketMatches.push(await byeRes.json());
        }
      }
    }

    // Update tournament status
    await fetch('/api/tournaments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournament.id, status: 'bracket' }),
    });

    fetchTournaments();
    fetchMatches();
  };

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player ? player.name : 'Unknown';
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
      // Fetch updated match data to check for winner
      const matchRes = await fetch(`/api/matches/${match.id}`);
      if (matchRes.ok) {
        const updatedMatch = await matchRes.json();
        
        // Determine winner based on games won
        const player1Wins = updatedMatch.games.filter((g: Game) => g.score1 > g.score2).length;
        const player2Wins = updatedMatch.games.filter((g: Game) => g.score2 > g.score1).length;
        const gamesNeededToWin = Math.ceil(updatedMatch.bestOf / 2);
        
        let winnerId = null;
        if (updatedMatch.player1Id === updatedMatch.player2Id) {
          // This is a bye match - the player automatically wins
          winnerId = updatedMatch.player1Id;
        } else if (player1Wins >= gamesNeededToWin) {
          winnerId = updatedMatch.player1Id;
        } else if (player2Wins >= gamesNeededToWin) {
          winnerId = updatedMatch.player2Id;
        }
        
        // Update match with winner if determined
        if (winnerId && !updatedMatch.winnerId) {
          await fetch(`/api/matches/${updatedMatch.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              winnerId: winnerId 
            }),
          });
        }
      }
      
      fetchMatches();
      fetchGames();

      // Check if we need to advance bracket rounds
      checkBracketAdvancement(match.tournamentId);
    }
  };

  const checkBracketAdvancement = async (tournamentId: string) => {
    // Fetch fresh data instead of relying on state
    const [tournamentsRes, matchesRes] = await Promise.all([
      fetch('/api/tournaments'),
      fetch('/api/matches')
    ]);
    const freshTournaments = await tournamentsRes.json();
    const freshMatches = await matchesRes.json();

    const tournament = freshTournaments.find((t: Tournament) => t.id === tournamentId);
    if (!tournament || tournament.status !== 'bracket') return;

    const tournamentMatches = freshMatches.filter((m: Match) => m.tournamentId === tournamentId && m.round === 'bracket');
    const currentRound = Math.max(...tournamentMatches.map((m: Match) => m.bracketRound || 0));
    const currentRoundMatches = tournamentMatches.filter((m: Match) => m.bracketRound === currentRound);

    // Check if all matches in current round are complete
    const allComplete = currentRoundMatches.every((m: Match) => m.winnerId);

    if (allComplete) {
      const winners = currentRoundMatches.map((m: Match) => m.winnerId).filter((id: string | undefined) => id) as string[];

      if (winners.length <= 1) {
        // Tournament complete - only one player left or no players
        await fetch('/api/tournaments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: tournamentId, status: 'completed' }),
        });
        fetchTournaments();
        return;
      }

      // Create next round matches by pairing winners
      const nextRound = currentRound + 1;
      const nextRoundBestOf = tournament.bracketRounds.find((br: { round: number; bestOf: number }) => br.round === nextRound)?.bestOf ||
                              tournament.bracketRounds[tournament.bracketRounds.length - 1]?.bestOf || 3;

      // Handle byes: if odd number of winners, the last one gets a bye
      const playersForNextRound = winners.length % 2 === 1
        ? winners.slice(0, -1)  // Remove last player for bye
        : [...winners];

      if (winners.length % 2 === 1) {
        // Last player gets a bye and automatically advances to the final
        const byePlayer = winners[winners.length - 1];
        console.log(`Player ${byePlayer} gets a bye to the final round`);

        if (nextRound === Math.max(...tournament.bracketRounds.map((br: { round: number; bestOf: number }) => br.round))) {
          // If this is already the final round, the bye player wins the tournament
          await fetch('/api/tournaments', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: tournamentId, status: 'completed' }),
          });
          fetchTournaments();
          return;
        } else {
          // Create a bye match for the next round
          const byeMatch: Partial<Match> = {
            tournamentId: tournamentId,
            player1Id: byePlayer,
            player2Id: byePlayer, // Same player for bye
            round: 'bracket',
            bracketRound: nextRound,
            bestOf: 1, // Bye matches are best of 1
            games: [],
            winnerId: byePlayer, // Automatically set winner
          };
          
          await fetch('/api/matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(byeMatch),
          });
        }
      }

      // Create next round matches by pairing remaining players
      for (let i = 0; i < playersForNextRound.length; i += 2) {
        if (i + 1 < playersForNextRound.length) {
          const newMatch: Partial<Match> = {
            tournamentId: tournamentId,
            player1Id: playersForNextRound[i],
            player2Id: playersForNextRound[i + 1],
            round: 'bracket',
            bracketRound: nextRound,
            bestOf: nextRoundBestOf,
            games: [],
          };

          await fetch('/api/matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMatch),
          });
        }
      }

      fetchTournaments();
      fetchMatches();
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
          {match.round === 'bracket' ? `Round ${match.bracketRound}` : `Round Robin - Round ${match.bracketRound || 1}`}
        </span>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded whitespace-nowrap">
            Best of {match.bestOf}
          </span>
          <button
            onClick={() => deleteMatch(match.id)}
            className="text-red-600 hover:text-red-800 text-sm font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
            title="Delete match"
          >
            🗑️
          </button>
        </div>
      </div>

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

      {match.games.length < match.bestOf && !match.winnerId && match.player1Id !== match.player2Id && (
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

  const getCurrentRound = (tournamentId: string): number => {
    const tournamentMatches = matches.filter(m => m.tournamentId === tournamentId && m.round === 'roundRobin');
    if (tournamentMatches.length === 0) return 1;
    
    // Find the highest bracketRound number among round robin matches
    const maxRound = Math.max(...tournamentMatches.map(m => m.bracketRound || 1));
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
        fetchTournaments();
        fetchMatches();
        // Check if tournament is now completed
        if (updatedTournament.status === 'completed') {
          setActiveTab('history');
          setSelectedTournament(updatedTournament);
          setShowTournamentDetail(true);
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

  const getPlayerStandings = (tournamentId: string, players: string[]) => {
    const playerStats: { [playerId: string]: { wins: number; losses: number; totalGames: number } } = {};
    players.forEach(playerId => {
      playerStats[playerId] = { wins: 0, losses: 0, totalGames: 0 };
    });
    
    // Get all round robin matches for this tournament
    const tournamentMatches = matches.filter(m => m.tournamentId === tournamentId && m.round === 'roundRobin');
    
    tournamentMatches.forEach(match => {
      if (match.winnerId) {
        playerStats[match.winnerId].wins++;
        playerStats[match.winnerId].totalGames++;
        
        const loserId = match.player1Id === match.winnerId ? match.player2Id : match.player1Id;
        playerStats[loserId].losses++;
        playerStats[loserId].totalGames++;
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">🏓 Ping Pong Tournaments</h1>
            <p className="text-gray-600 text-lg">Track your weekly ping pong battles</p>
          </div>
          <div className="flex space-x-4">
            <Link href="/" className="bg-white hover:bg-gray-100 text-gray-800 px-6 py-3 rounded-lg shadow border-2 border-gray-300 transition-colors font-medium">
              ← Back to Home
            </Link>
            <button
              onClick={() => {
                setFormMode('create');
                setShowForm(!showForm);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow font-medium transition-colors border-2 border-blue-700"
            >
              + New Tournament
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <div className="flex space-x-2 bg-white p-2 rounded-lg shadow border-2 border-gray-200">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 px-6 py-3 rounded-md font-medium transition-all ${
                activeTab === 'active'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Active Tournaments
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 px-6 py-3 rounded-md font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Tournament History
            </button>
          </div>
        </div>

        {/* Create Tournament Form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border-2 border-gray-200">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">{formMode === 'create' ? 'Create New Tournament' : 'Edit Tournament Players'}</h2>
            <form onSubmit={formMode === 'create' ? createTournament : updateTournament} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-lg font-semibold text-gray-800 mb-3">Tournament Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Week 1 Championship"
                    className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none text-lg"
                    required
                    disabled={formMode === 'edit'}
                  />
                </div>
                <div>
                  <label className="block text-lg font-semibold text-gray-800 mb-3">Round Robin Rounds</label>
                  <select
                    value={roundRobinRounds}
                    onChange={(e) => setRoundRobinRounds(parseInt(e.target.value))}
                    className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none text-lg"
                    disabled={formMode === 'edit'}
                  >
                    <option value={3}>3 Rounds</option>
                    <option value={4}>4 Rounds</option>
                  </select>
                </div>
              </div>

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
                            setSelectedPlayers([...selectedPlayers, p.id]);
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
                  {formMode === 'create' ? 'Create Tournament' : 'Update Players'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tournaments List */}
        <div className="space-y-8">
          {tournaments
            .filter(tournament =>
              activeTab === 'active'
                ? tournament.status !== 'completed'
                : tournament.status === 'completed'
            )
            .map((tournament) => {
              const tournamentMatches = getTournamentMatches(tournament.id);
              const currentRound = getCurrentRound(tournament.id);
              const roundRobinMatches = tournamentMatches.filter(m => 
                m.round === 'roundRobin' && (m.bracketRound || 1) === currentRound
              );
              const bracketMatches = tournamentMatches.filter(m => m.round === 'bracket');
              
              return (
                <div 
                  key={tournament.id} 
                  className={`bg-white rounded-xl shadow-lg overflow-hidden border-2 border-gray-200 ${activeTab === 'history' ? 'cursor-pointer hover:shadow-xl transition-shadow' : ''}`}
                  onClick={activeTab === 'history' ? () => {
                    setSelectedTournament(tournament);
                    setShowTournamentDetail(true);
                  } : undefined}
                >
                  {/* Tournament Header */}
                  <div className="bg-gray-800 text-white p-8">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h2 className="text-3xl font-bold mb-3">{tournament.name}</h2>
                        <p className="text-gray-300 text-lg">
                          {tournament.players.length} players • Started {new Date(tournament.startDate).toLocaleDateString()}
                        </p>
                        {activeTab === 'history' && (
                          <p className="text-gray-400 text-sm mt-2">Click to view all games played</p>
                        )}
                      </div>
                      <span className={`px-4 py-2 rounded-full text-sm font-bold border-2 ${getStatusColor(tournament.status)}`}>
                        {tournament.status === 'roundRobin' ? 'Round Robin' :
                         tournament.status === 'bracket' ? (() => {
                           const currentRound = Math.max(...bracketMatches.map(m => m.bracketRound || 0));
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
                                {getPlayerStandings(tournament.id, tournament.players).map((standing, index) => (
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

                        {roundRobinMatches.every(m => m.winnerId) && (
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
                              const uniqueRounds = [...new Set(bracketMatches.map(m => m.bracketRound).filter(r => r !== undefined))].sort((a, b) => a - b);
                              
                              return uniqueRounds.map((roundNum) => {
                                const roundMatches = bracketMatches.filter(m => m.bracketRound === roundNum);
                                const isFinalRound = roundNum === Math.max(...bracketMatches.map(m => m.bracketRound || 0));
                                const isCompleted = roundMatches.every(m => m.winnerId);

                                return (
                                  <div key={roundNum} className="flex flex-col items-center mx-6">
                                    <h4 className={`text-center font-bold mb-6 text-xl ${isFinalRound ? 'text-yellow-600' : 'text-gray-800'}`}>
                                      {isFinalRound ? '🏆 Final' : `Round ${roundNum}`}
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

                    {/* Tournament Completed */}
                    {tournament.status === 'completed' && (
                      <div className="text-center py-12">
                        <div className="text-7xl mb-6">🏆</div>
                        <h3 className="text-3xl font-bold text-gray-900 mb-4">Tournament Completed!</h3>
                        <p className="text-gray-600 mb-8 text-lg">Congratulations to all participants</p>
                        {(() => {
                          const finalMatch = bracketMatches.find(m => m.bracketRound === Math.max(...bracketMatches.map(m => m.bracketRound || 0)));
                          if (finalMatch?.winnerId) {
                            return (
                              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6 inline-block">
                                <div className="text-2xl font-bold text-yellow-800">
                                  🥇 Champion: {getPlayerName(finalMatch.winnerId)}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
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

                    {/* Action Buttons for Active Tournaments */}
                    {activeTab === 'active' && (
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
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {tournaments.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl shadow-lg border-2 border-gray-200">
            <div className="text-8xl mb-6">🏓</div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">No tournaments yet</h3>
            <p className="text-gray-600 mb-8 text-lg">Create your first tournament to get started!</p>
            <button
              onClick={() => {
                setFormMode('create');
                setShowForm(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-lg shadow-lg font-bold text-xl transition-colors border-2 border-blue-700"
            >
              Create Tournament
            </button>
          </div>
        )}

        {/* Tournament Detail Modal */}
        {showTournamentDetail && selectedTournament && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{selectedTournament.name}</h3>
                    <p className="text-gray-700 text-sm mb-4">
                      {selectedTournament.players.length} players • Started {new Date(selectedTournament.startDate).toLocaleDateString()}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {selectedTournament.players.map(playerId => (
                        <span key={playerId} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-full text-sm font-medium border border-gray-300">
                          {getPlayerName(playerId)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowTournamentDetail(false)}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6">
                {/* Tournament Games */}
                <div className="mb-8">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">All Games Played</h4>
                  {(() => {
                    const tournamentGames = games.filter(g => 
                      getTournamentMatches(selectedTournament.id).some(m => m.id === g.matchId)
                    );
                    
                    if (tournamentGames.length === 0) {
                      return <p className="text-gray-600 text-center py-4">No games played yet</p>;
                    }

                    return (
                      <div className="space-y-3">
                        {tournamentGames
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map((game) => {
                            const match = matches.find(m => m.id === game.matchId);
                            const player1Score = game.score1;
                            const player2Score = game.score2;
                            const player1Won = player1Score > player2Score;
                            
                            return (
                              <div key={game.id} className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center space-x-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                                    player1Won ? 'bg-green-500' : 'bg-red-500'
                                  }`}>
                                    {player1Won ? 'W' : 'L'}
                                  </div>
                                  <div>
                                    <div className="font-medium text-gray-900">
                                      {getPlayerName(game.player1Id)} vs {getPlayerName(game.player2Id)}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      {match?.round === 'roundRobin' ? 'Round Robin' : `Bracket Round ${match?.bracketRound || 1}`} • 
                                      {new Date(game.date).toLocaleDateString()}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold text-lg text-gray-900">
                                    {player1Score} - {player2Score}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    Winner: {getPlayerName(player1Won ? game.player1Id : game.player2Id)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })()}
                </div>

                {/* Tournament Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gray-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {getTournamentMatches(selectedTournament.id).filter(m => m.winnerId).length}
                    </div>
                    <div className="text-gray-600 font-medium">Matches Completed</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {games.filter(g => getTournamentMatches(selectedTournament.id).some(m => m.id === g.matchId)).length}
                    </div>
                    <div className="text-gray-600 font-medium">Games Played</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {selectedTournament.status === 'completed' ? '🏆' : '⏳'}
                    </div>
                    <div className="text-gray-600 font-medium">
                      {selectedTournament.status === 'completed' ? 'Completed' : 'In Progress'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
