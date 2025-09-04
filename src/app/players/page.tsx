'use client';

import { useState, useEffect } from 'react';
import { Player, Game, Match, Tournament } from '../../types/pingpong';
import Link from 'next/link';

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showPlayerReport, setShowPlayerReport] = useState(false);

  useEffect(() => {
    fetchPlayers();
    fetchGames();
    fetchMatches();
    fetchTournaments();
  }, []);

  const fetchPlayers = async () => {
    const res = await fetch('/api/players');
    const data = await res.json();
    setPlayers(data);
  };

  const fetchGames = async () => {
    const res = await fetch('/api/games');
    const data = await res.json();
    setGames(data);
  };

  const fetchMatches = async () => {
    const res = await fetch('/api/matches');
    const data = await res.json();
    setMatches(data);
  };

  const fetchTournaments = async () => {
    const res = await fetch('/api/tournaments');
    const data = await res.json();
    setTournaments(data);
  };

  const addPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setName('');
      setShowAddForm(false);
      fetchPlayers();
    }
  };

  const viewPlayerReport = (player: Player) => {
    setSelectedPlayer(player);
    setShowPlayerReport(true);
  };

  const selectPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setShowPlayerReport(true);
  };

  const closePlayerReport = () => {
    setSelectedPlayer(null);
    setShowPlayerReport(false);
  };

  const getPlayerStats = (playerId: string) => {
    const playerGames = games.filter(game => game.player1Id === playerId || game.player2Id === playerId);
    const playerMatches = matches.filter(match => match.player1Id === playerId || match.player2Id === playerId);
    
    let wins = 0;
    let losses = 0;
    let totalScore = 0;
    let totalOpponentScore = 0;
    
    playerGames.forEach(game => {
      if (game.player1Id === playerId) {
        totalScore += game.score1;
        totalOpponentScore += game.score2;
        if (game.score1 > game.score2) wins++;
        else losses++;
      } else {
        totalScore += game.score2;
        totalOpponentScore += game.score1;
        if (game.score2 > game.score1) wins++;
        else losses++;
      }
    });
    
    const winRate = playerGames.length > 0 ? Math.round((wins / playerGames.length) * 100) : 0;
    const avgScore = playerGames.length > 0 ? Math.round(totalScore / playerGames.length) : 0;
    const avgOpponentScore = playerGames.length > 0 ? Math.round(totalOpponentScore / playerGames.length) : 0;
    
    return {
      totalGames: playerGames.length,
      totalMatches: playerMatches.length,
      wins,
      losses,
      winRate,
      avgScore,
      avgOpponentScore,
      recentGames: playerGames.slice(-5).reverse() // Last 5 games
    };
  };

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player ? player.name : 'Unknown';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">👥 Players</h1>
            <p className="text-gray-600">Manage your ping pong players</p>
          </div>
          <div className="flex space-x-4">
            <Link href="/" className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg shadow-sm border border-gray-200 transition-colors">
              ← Back to Home
            </Link>
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg shadow-sm transition-colors flex items-center space-x-2"
            >
              <span>+</span>
              <span>Add Player</span>
            </button>
          </div>
        </div>

        {/* Add Player Form */}
        {showAddForm && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Player</h2>
            <form onSubmit={addPlayer} className="flex space-x-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter player name"
                className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
              <button 
                type="submit" 
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                Add Player
              </button>
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)}
                className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {/* Players Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {players.map((player) => (
            <div 
              key={player.id} 
              className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all cursor-pointer hover:border-indigo-300"
              onClick={() => selectPlayer(player)}
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">{player.name}</h3>
                  <p className="text-gray-600 text-sm">Player since {new Date(parseInt(player.id)).toLocaleDateString()}</p>
                  <p className="text-indigo-600 text-sm font-medium mt-1 cursor-pointer hover:text-indigo-800">
                    📊 View Details →
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {players.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No players yet</h3>
            <p className="text-gray-600 mb-6">Add your first player to get started!</p>
            <button 
              onClick={() => setShowAddForm(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg shadow-sm transition-colors text-lg"
            >
              Add Player
            </button>
          </div>
        )}

        {/* Stats Card */}
        {players.length > 0 && (
          <div className="mt-8 bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Team Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-600 mb-2">{players.length}</div>
                <div className="text-gray-600">Total Players</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-2">
                  {Math.round(players.reduce((sum, player) => {
                    const stats = getPlayerStats(player.id);
                    return sum + stats.winRate;
                  }, 0) / players.length) || 0}%
                </div>
                <div className="text-gray-600">Avg Win Rate</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600 mb-2">
                  {players.reduce((sum, player) => sum + getPlayerStats(player.id).totalGames, 0)}
                </div>
                <div className="text-gray-600">Total Games Played</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">
                  {tournaments.filter(t => t.status !== 'completed').length}
                </div>
                <div className="text-gray-600">Active Tournaments</div>
              </div>
            </div>
          </div>
        )}

        {/* Player Report Modal */}
        {showPlayerReport && selectedPlayer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                      {selectedPlayer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900">{selectedPlayer.name}</h2>
                      <p className="text-gray-600">Player since {new Date(parseInt(selectedPlayer.id)).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button 
                    onClick={closePlayerReport}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6">
                {(() => {
                  const stats = getPlayerStats(selectedPlayer.id);
                  return (
                    <>
                      {/* Statistics Overview */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg text-center">
                          <div className="text-2xl font-bold text-blue-600">{stats.totalGames}</div>
                          <div className="text-sm text-blue-800">Total Games</div>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg text-center">
                          <div className="text-2xl font-bold text-green-600">{stats.wins}</div>
                          <div className="text-sm text-green-800">Wins</div>
                        </div>
                        <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg text-center">
                          <div className="text-2xl font-bold text-red-600">{stats.losses}</div>
                          <div className="text-sm text-red-800">Losses</div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg text-center">
                          <div className="text-2xl font-bold text-purple-600">{stats.winRate}%</div>
                          <div className="text-sm text-purple-800">Win Rate</div>
                        </div>
                      </div>

                      {/* Performance Metrics */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h3 className="text-lg font-semibold text-gray-900 mb-3">Scoring Performance</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Average Score:</span>
                              <span className="font-semibold">{stats.avgScore}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Avg Opponent Score:</span>
                              <span className="font-semibold">{stats.avgOpponentScore}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Score Differential:</span>
                              <span className={`font-semibold ${stats.avgScore - stats.avgOpponentScore >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {stats.avgScore - stats.avgOpponentScore >= 0 ? '+' : ''}{stats.avgScore - stats.avgOpponentScore}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h3 className="text-lg font-semibold text-gray-900 mb-3">Tournament Activity</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Total Matches:</span>
                              <span className="font-semibold">{stats.totalMatches}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Tournaments Played:</span>
                              <span className="font-semibold">
                                {tournaments.filter(t => t.players.includes(selectedPlayer.id)).length}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Active Tournaments:</span>
                              <span className="font-semibold">
                                {tournaments.filter(t => t.players.includes(selectedPlayer.id) && t.status !== 'completed').length}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Recent Games */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Games</h3>
                        {stats.recentGames.length > 0 ? (
                          <div className="space-y-3">
                            {stats.recentGames.map((game) => {
                              const isPlayer1 = game.player1Id === selectedPlayer.id;
                              const playerScore = isPlayer1 ? game.score1 : game.score2;
                              const opponentScore = isPlayer1 ? game.score2 : game.score1;
                              const opponentId = isPlayer1 ? game.player2Id : game.player1Id;
                              const won = playerScore > opponentScore;
                              
                              return (
                                <div key={game.id} className="flex items-center justify-between bg-white p-3 rounded border">
                                  <div className="flex items-center space-x-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                                      won ? 'bg-green-500' : 'bg-red-500'
                                    }`}>
                                      {won ? 'W' : 'L'}
                                    </div>
                                    <div>
                                      <div className="font-medium text-gray-900">
                                        vs {getPlayerName(opponentId)}
                                      </div>
                                      <div className="text-sm text-gray-600">
                                        {new Date(game.date).toLocaleDateString()}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-lg">
                                      {playerScore} - {opponentScore}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-gray-600 text-center py-4">No games played yet</p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
