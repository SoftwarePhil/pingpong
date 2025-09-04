'use client';

import { useState, useEffect } from 'react';
import { Player, Game } from '../../types/pingpong';
import Link from 'next/link';

interface PlayerStats {
  id: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPoints: number;
  avgPointsPerGame: number;
}

export default function StatsPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<PlayerStats[]>([]);

  useEffect(() => {
    fetchPlayers();
    fetchGames();
  }, []);

  useEffect(() => {
    if (players.length && games.length) {
      const playerStats: { [key: string]: PlayerStats } = {};
      players.forEach(p => {
        playerStats[p.id] = { 
          id: p.id, 
          name: p.name, 
          gamesPlayed: 0, 
          wins: 0, 
          losses: 0,
          winRate: 0,
          totalPoints: 0,
          avgPointsPerGame: 0
        };
      });

      // Calculate stats from all games (both standalone and tournament)
      games.forEach(game => {
        const p1 = playerStats[game.player1Id];
        const p2 = playerStats[game.player2Id];
        
        if (p1 && p2) {
          p1.gamesPlayed++;
          p2.gamesPlayed++;
          p1.totalPoints += game.score1;
          p2.totalPoints += game.score2;

          if (game.score1 > game.score2) {
            p1.wins++;
            p2.losses++;
          } else if (game.score2 > game.score1) {
            p2.wins++;
            p1.losses++;
          }
        }
      });

      // Calculate derived stats
      Object.values(playerStats).forEach(stat => {
        stat.winRate = stat.gamesPlayed > 0 ? Math.round((stat.wins / stat.gamesPlayed) * 100) : 0;
        stat.avgPointsPerGame = stat.gamesPlayed > 0 ? Math.round(stat.totalPoints / stat.gamesPlayed) : 0;
      });

      setStats(Object.values(playerStats).sort((a, b) => b.winRate - a.winRate));
    }
  }, [players, games]);

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

  const getRankEmoji = (index: number) => {
    switch (index) {
      case 0: return '🥇';
      case 1: return '🥈';
      case 2: return '🥉';
      default: return '🏅';
    }
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
            <h1 className="text-4xl font-bold text-gray-900 mb-2">📊 Statistics</h1>
            <p className="text-gray-600">Player performance and leaderboard</p>
          </div>
          <Link href="/" className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg shadow-sm border border-gray-200 transition-colors">
            ← Back to Home
          </Link>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="text-3xl">👥</div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{players.length}</div>
                <div className="text-sm text-gray-600">Total Players</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="text-3xl">🎯</div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{games.length}</div>
                <div className="text-sm text-gray-600">Games Played</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="text-3xl">🏆</div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.length > 0 ? Math.max(...stats.map(s => s.wins)) : 0}
                </div>
                <div className="text-sm text-gray-600">Most Wins</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="text-3xl">📈</div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.length > 0 ? Math.round(stats.reduce((sum, s) => sum + s.winRate, 0) / stats.length) : 0}%
                </div>
                <div className="text-sm text-gray-600">Avg Win Rate</div>
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
            <h2 className="text-2xl font-bold">🏆 Player Leaderboard</h2>
            <p className="text-indigo-100">Ranked by win rate</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Games</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wins</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Losses</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Win Rate</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Points</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.map((stat, index) => (
                  <tr key={stat.id} className={`hover:bg-gray-50 ${index < 3 ? 'bg-gradient-to-r from-yellow-50 to-transparent' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">{getRankEmoji(index)}</span>
                        <span className="text-lg font-bold text-gray-900">#{index + 1}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-3">
                          {stat.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="font-bold text-gray-900">{stat.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {stat.gamesPlayed}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                      {stat.wins}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                      {stat.losses}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-full bg-gray-200 rounded-full h-2 mr-3">
                          <div 
                            className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full" 
                            style={{ width: `${stat.winRate}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{stat.winRate}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {stat.avgPointsPerGame}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stats.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No statistics available</h3>
              <p className="text-gray-600">Play some games to see player statistics!</p>
            </div>
          )}
        </div>

        {/* Recent Games */}
        {games.length > 0 && (
          <div className="mt-8 bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Recent Games</h3>
            <div className="space-y-3">
              {games.slice(-5).reverse().map((game) => (
                <div key={game.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="font-medium text-gray-900">
                      {getPlayerName(game.player1Id)} vs {getPlayerName(game.player2Id)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {new Date(game.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-lg font-bold">
                      <span className={game.score1 > game.score2 ? 'text-green-600' : 'text-gray-700'}>
                        {game.score1}
                      </span>
                      <span className="mx-2 text-gray-400">-</span>
                      <span className={game.score2 > game.score1 ? 'text-green-600' : 'text-gray-700'}>
                        {game.score2}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Winner: <span className="font-medium text-green-600">
                        {game.score1 > game.score2 ? getPlayerName(game.player1Id) : 
                         game.score2 > game.score1 ? getPlayerName(game.player2Id) : 'Draw'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
