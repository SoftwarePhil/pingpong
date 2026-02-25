'use client';

import { useState, useEffect } from 'react';
import { Player, Game, Match, Tournament } from '../../types/pingpong';
import Link from 'next/link';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell,
} from 'recharts';

type PlayerTab = 'overview' | 'matches' | 'games' | 'h2h';

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addPlayerError, setAddPlayerError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showPlayerReport, setShowPlayerReport] = useState(false);
  const [activePlayerTab, setActivePlayerTab] = useState<PlayerTab>('overview');

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
      setAddPlayerError(null);
      setShowAddForm(false);
      fetchPlayers();
    } else {
      const data = await res.json();
      setAddPlayerError(data.error || 'Failed to add player');
    }
  };

  const selectPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setShowPlayerReport(true);
    setActivePlayerTab('overview');
  };

  const closePlayerReport = () => {
    setSelectedPlayer(null);
    setShowPlayerReport(false);
  };

  const getAdvancedStats = (playerId: string) => {
    // All matches for this player (exclude BYE)
    const playerMatches = matches.filter(
      m => (m.player1Id === playerId || m.player2Id === playerId) && m.player2Id !== 'BYE'
    );

    // All games embedded in those matches, sorted by date
    const playerGames: (Game & { match: Match })[] = playerMatches
      .flatMap(m => m.games.map(g => ({ ...g, match: m })))
      .filter(g => g.player1Id === playerId || g.player2Id === playerId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Core game stats
    let gameWins = 0, gameLosses = 0, totalScore = 0, totalOppScore = 0;
    let tempWinStreak = 0, tempLossStreak = 0, longestWinStreak = 0, longestLossStreak = 0;
    const h2h: Record<string, { wins: number; losses: number }> = {};
    const winRateOverTime: { game: number; winRate: number; label: string }[] = [];

    playerGames.forEach((game, i) => {
      const isP1 = game.player1Id === playerId;
      const myScore = isP1 ? game.score1 : game.score2;
      const oppScore = isP1 ? game.score2 : game.score1;
      const oppId = isP1 ? game.player2Id : game.player1Id;
      const won = myScore > oppScore;

      totalScore += myScore;
      totalOppScore += oppScore;

      if (won) {
        gameWins++;
        tempWinStreak++;
        tempLossStreak = 0;
        longestWinStreak = Math.max(longestWinStreak, tempWinStreak);
      } else {
        gameLosses++;
        tempLossStreak++;
        tempWinStreak = 0;
        longestLossStreak = Math.max(longestLossStreak, tempLossStreak);
      }

      winRateOverTime.push({
        game: i + 1,
        winRate: Math.round((gameWins / (i + 1)) * 100),
        label: new Date(game.date).toLocaleDateString(),
      });

      if (!h2h[oppId]) h2h[oppId] = { wins: 0, losses: 0 };
      if (won) h2h[oppId].wins++;
      else h2h[oppId].losses++;
    });

    // Current streak
    let currentStreak = 0;
    let currentStreakType: 'W' | 'L' | null = null;
    for (let i = playerGames.length - 1; i >= 0; i--) {
      const g = playerGames[i];
      const isP1 = g.player1Id === playerId;
      const won = (isP1 ? g.score1 : g.score2) > (isP1 ? g.score2 : g.score1);
      if (i === playerGames.length - 1) {
        currentStreakType = won ? 'W' : 'L';
        currentStreak = 1;
      } else if ((won && currentStreakType === 'W') || (!won && currentStreakType === 'L')) {
        currentStreak++;
      } else break;
    }

    // Match wins/losses
    const matchWins = playerMatches.filter(m => m.winnerId === playerId).length;
    const matchLosses = playerMatches.filter(m => m.winnerId && m.winnerId !== playerId).length;

    // Tournament performance
    const tournamentStats = tournaments
      .filter(t => t.players.includes(playerId))
      .map(t => {
        const tMatches = (t.matches || []).filter(
          m => (m.player1Id === playerId || m.player2Id === playerId) && m.player2Id !== 'BYE'
        );
        const tMatchWins = tMatches.filter(m => m.winnerId === playerId).length;
        const tMatchLosses = tMatches.filter(m => m.winnerId && m.winnerId !== playerId).length;
        const tGames = tMatches.flatMap(m => m.games).filter(
          g => g.player1Id === playerId || g.player2Id === playerId
        );
        const tGameWins = tGames.filter(g =>
          g.player1Id === playerId ? g.score1 > g.score2 : g.score2 > g.score1
        ).length;
        const rank = t.playerRanking ? t.playerRanking.indexOf(playerId) + 1 : null;
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          matchWins: tMatchWins,
          matchLosses: tMatchLosses,
          gameWins: tGameWins,
          totalGames: tGames.length,
          rank: rank && rank > 0 ? rank : null,
        };
      })
      .sort((a, b) => {
        // completed first
        if (a.status === 'completed' && b.status !== 'completed') return -1;
        if (b.status === 'completed' && a.status !== 'completed') return 1;
        return 0;
      });

    // H2H records
    const h2hRecords = Object.entries(h2h)
      .map(([oppId, rec]) => ({
        opponentId: oppId,
        opponentName: getPlayerName(oppId),
        wins: rec.wins,
        losses: rec.losses,
        total: rec.wins + rec.losses,
        winPct: Math.round((rec.wins / (rec.wins + rec.losses)) * 100),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      totalGames: playerGames.length,
      gameWins,
      gameLosses,
      gameWinRate: playerGames.length > 0 ? Math.round((gameWins / playerGames.length) * 100) : 0,
      totalMatches: playerMatches.length,
      matchWins,
      matchLosses,
      matchWinRate: (matchWins + matchLosses) > 0 ? Math.round((matchWins / (matchWins + matchLosses)) * 100) : 0,
      avgScore: playerGames.length > 0 ? (totalScore / playerGames.length).toFixed(1) : '0.0',
      avgOppScore: playerGames.length > 0 ? (totalOppScore / playerGames.length).toFixed(1) : '0.0',
      pointDiff: playerGames.length > 0 ? ((totalScore - totalOppScore) / playerGames.length).toFixed(1) : '0.0',
      longestWinStreak,
      longestLossStreak,
      currentStreak,
      currentStreakType,
      winRateOverTime,
      h2hRecords,
      tournamentStats,
      playerMatches,
      playerGames,
    };
  };

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player ? player.name : 'Unknown';
  };

  return (
    <div className="min-h-screen bg-page">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-ink mb-2">👥 Players</h1>
            <p className="text-ink-muted">Manage your ping pong players</p>
          </div>
          <div className="flex space-x-4">
            <Link href="/" className="bg-surface hover:bg-overlay text-ink-dim px-4 py-2 rounded-lg shadow-sm border border-edge transition-colors">
              ← Back to Home
            </Link>
          </div>
        </div>

        {/* Players Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {players.map((player) => (
            <div 
              key={player.id} 
              className="bg-surface rounded-xl shadow-lg p-6 border border-edge hover:shadow-xl transition-all cursor-pointer hover:border-edge-hi"
              onClick={() => selectPlayer(player)}
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-overlay border border-edge-hi rounded-full flex items-center justify-center text-ink text-xl font-bold">
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-ink">{player.name}</h3>
                  <p className="text-ink-muted text-sm">Player since {new Date(parseInt(player.id)).toLocaleDateString()}</p>
                  <p className="text-brand text-sm font-medium mt-1 cursor-pointer hover:text-brand-hi">
                    📊 View Details →
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Add Player card */}
          {!showAddForm ? (
            <div
              onClick={() => { setShowAddForm(true); }}
              className="bg-surface rounded-xl shadow-lg p-6 border-2 border-dashed border-edge hover:border-edge-hi hover:shadow-xl transition-all cursor-pointer flex items-center justify-center"
            >
              <div className="text-center">
                <div className="w-12 h-12 bg-overlay rounded-full flex items-center justify-center text-ink-faint text-2xl mx-auto mb-3 transition-colors">+</div>
                <p className="text-ink-muted font-medium">Add Player</p>
              </div>
            </div>
          ) : (
            <div className="bg-surface rounded-xl shadow-lg p-6 border-2 border-brand">
              <p className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-3">New Player</p>
              <form onSubmit={addPlayer} className="space-y-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setAddPlayerError(null); }}
                  placeholder="Player name"
                  className={`w-full border rounded-lg px-3 py-2 text-sm text-ink placeholder-ink-faint bg-overlay focus:ring-2 focus:ring-brand focus:border-brand ${addPlayerError ? 'border-loss' : 'border-edge'}`}
                  autoFocus
                  required
                />
                {addPlayerError && (
                  <p className="text-loss text-xs mt-1">{addPlayerError}</p>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 px-3 py-2 bg-brand hover:bg-brand-hi text-ink rounded-lg text-sm font-medium transition-colors">
                    Add
                  </button>
                  <button type="button" onClick={() => { setShowAddForm(false); setName(''); setAddPlayerError(null); }} className="px-3 py-2 border border-edge rounded-lg text-sm text-ink-dim hover:bg-overlay transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {players.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-ink mb-2">No players yet</h3>
            <p className="text-ink-muted mb-6">Add your first player to get started!</p>
            <button 
              onClick={() => setShowAddForm(true)}
              className="bg-brand hover:bg-brand-hi text-ink px-8 py-3 rounded-lg shadow-sm transition-colors text-lg"
            >
              Add Player
            </button>
          </div>
        )}

        {/* Leaderboard */}
        {players.length > 0 && (() => {
          const leaderboard = players.map(player => {
            const pm = matches.filter(
              m => (m.player1Id === player.id || m.player2Id === player.id) && m.player2Id !== 'BYE'
            );
            let matchWins = 0, matchLosses = 0, gameWins = 0, gameLosses = 0;
            pm.forEach(m => {
              if (m.winnerId === player.id) matchWins++;
              else if (m.winnerId) matchLosses++;
              m.games.forEach(g => {
                const won = g.player1Id === player.id ? g.score1 > g.score2 : g.score2 > g.score1;
                if (won) gameWins++; else gameLosses++;
              });
            });
            const totalMatches = matchWins + matchLosses;
            const totalGames = gameWins + gameLosses;
            return {
              player,
              matchWins,
              matchLosses,
              gameWins,
              gameLosses,
              matchWinRate: totalMatches > 0 ? Math.round((matchWins / totalMatches) * 100) : 0,
              gameWinRate: totalGames > 0 ? Math.round((gameWins / totalGames) * 100) : 0,
              totalMatches,
              totalGames,
            };
          }).sort((a, b) => {
            if (b.matchWinRate !== a.matchWinRate) return b.matchWinRate - a.matchWinRate;
            if (b.gameWinRate !== a.gameWinRate) return b.gameWinRate - a.gameWinRate;
            return b.totalMatches - a.totalMatches;
          });

          return (
            <div className="mt-8 bg-surface rounded-xl shadow-lg overflow-hidden border border-edge">
              <div className="bg-surface border-b border-edge text-ink px-6 py-5">
                <h2 className="text-xl font-bold">🏆 Leaderboard</h2>
                <p className="text-ink-dim text-sm mt-0.5">Ranked by match win rate</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-overlay border-b border-edge">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wider w-12">Rank</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wider">Player</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-ink-muted uppercase tracking-wider">Matches</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-ink-muted uppercase tracking-wider">Match W–L</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-ink-muted uppercase tracking-wider">Game W–L</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold text-ink-muted uppercase tracking-wider w-36">Game Win %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge-dim">
                    {leaderboard.map((row, i) => (
                      <tr
                        key={row.player.id}
                        className={`hover:bg-overlay cursor-pointer transition-colors ${
                          i === 0 ? 'bg-gold-dim' : i === 1 ? 'bg-overlay' : ''
                        }`}
                        onClick={() => selectPlayer(row.player)}
                      >
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="text-xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-overlay border border-edge-hi rounded-full flex items-center justify-center text-ink text-sm font-bold shrink-0">
                              {row.player.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-ink">{row.player.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-center tabular-nums font-medium text-ink-dim">{row.totalMatches}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums">
                          <span className="text-win font-semibold">{row.matchWins}</span>
                          <span className="text-ink-faint mx-1">–</span>
                          <span className="text-loss font-semibold">{row.matchLosses}</span>
                        </td>
                        <td className="px-5 py-3.5 text-center tabular-nums">
                          <span className="text-win font-semibold">{row.gameWins}</span>
                          <span className="text-ink-faint mx-1">–</span>
                          <span className="text-loss font-semibold">{row.gameLosses}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-overlay rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand rounded-full transition-all"
                                style={{ width: `${row.gameWinRate}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-ink-dim w-9 text-right tabular-nums">
                              {row.totalGames > 0 ? `${row.gameWinRate}%` : '—'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {leaderboard.every(r => r.totalMatches === 0) && (
                <div className="text-center py-10 text-ink-faint text-sm">No games played yet — play some matches to see rankings.</div>
              )}
            </div>
          );
        })()}

        {/* Player Report Modal */}
        {showPlayerReport && selectedPlayer && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={closePlayerReport}
          >
            <div
              className="bg-surface rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col text-ink"
              onClick={e => e.stopPropagation()}
            >
              {/* Sticky header + tabs */}
              <div className="border-b border-edge px-6 pt-5 pb-0 shrink-0">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-overlay border border-edge-hi rounded-full flex items-center justify-center text-ink text-2xl font-bold shrink-0">
                      {selectedPlayer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-ink">{selectedPlayer.name}</h2>
                      <p className="text-sm text-ink-muted">
                        Player since {new Date(parseInt(selectedPlayer.id)).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button onClick={closePlayerReport} className="text-ink-faint hover:text-ink-dim text-2xl leading-none mt-1">✕</button>
                </div>
                <div className="flex gap-1">
                  {(['overview', 'matches', 'games', 'h2h'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActivePlayerTab(tab)}
                      className={`px-4 py-2 text-sm font-medium rounded-t-lg capitalize transition-colors ${
                        activePlayerTab === tab
                          ? 'bg-brand text-ink'
                          : 'text-ink-muted hover:text-ink hover:bg-overlay'
                      }`}
                    >
                      {tab === 'h2h' ? 'Head-to-Head' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto p-6 grow">
                {(() => {
                  const stats = getAdvancedStats(selectedPlayer.id);

                  // ── Overview Tab ──────────────────────────────────────────
                  if (activePlayerTab === 'overview') return (
                    <div className="space-y-6">
                      {/* Hero stat tiles */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-overlay border border-edge rounded-xl p-4 text-center">
                          <div className="text-3xl font-bold text-ink mb-1">{stats.totalGames}</div>
                          <div className="text-xs font-medium text-ink-muted">Games</div>
                        </div>
                        <div className={`rounded-xl p-4 text-center ${stats.gameWinRate >= 50 ? 'bg-brand-dim border border-brand-bd' : 'bg-loss-dim border border-loss-bd'}`}>
                          <div className={`text-3xl font-bold mb-1 ${stats.gameWinRate >= 50 ? 'text-win' : 'text-loss'}`}>{stats.gameWinRate}%</div>
                          <div className={`text-xs font-medium ${stats.gameWinRate >= 50 ? 'text-win' : 'text-loss'}`}>Game Win %</div>
                        </div>
                        <div className={`rounded-xl p-4 text-center ${stats.matchWinRate >= 50 ? 'bg-brand-dim border border-brand-bd' : 'bg-loss-dim border border-loss-bd'}`}>
                          <div className={`text-3xl font-bold mb-1 ${stats.matchWinRate >= 50 ? 'text-win' : 'text-loss'}`}>{stats.matchWinRate}%</div>
                          <div className={`text-xs font-medium ${stats.matchWinRate >= 50 ? 'text-win' : 'text-loss'}`}>Match Win %</div>
                        </div>
                        <div className="bg-overlay border border-edge rounded-xl p-4 text-center">
                          <div className="text-3xl font-bold text-ink mb-1">{stats.tournamentStats.length}</div>
                          <div className="text-xs font-medium text-ink-muted">Tournaments</div>
                        </div>
                      </div>

                      {/* Win / Loss breakdown */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-overlay rounded-xl p-4">
                          <h3 className="text-sm font-semibold text-ink-dim uppercase tracking-wider mb-3">Game Record</h3>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-win font-bold text-lg w-10">{stats.gameWins}W</span>
                            <div className="flex-1 h-4 bg-overlay rounded-full overflow-hidden">
                              <div
                                className="h-full bg-win rounded-full transition-all"
                                style={{ width: `${stats.totalGames > 0 ? stats.gameWinRate : 0}%` }}
                              />
                            </div>
                            <span className="text-loss font-bold text-lg w-10 text-right">{stats.gameLosses}L</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-win font-bold text-lg w-10">{stats.matchWins}W</span>
                            <div className="flex-1 h-4 bg-overlay rounded-full overflow-hidden">
                              <div
                                className="h-full bg-win rounded-full transition-all"
                                style={{ width: `${(stats.matchWins + stats.matchLosses) > 0 ? stats.matchWinRate : 0}%` }}
                              />
                            </div>
                            <span className="text-loss font-bold text-lg w-10 text-right">{stats.matchLosses}L</span>
                          </div>
                          <div className="flex text-xs text-ink-faint mt-1 px-13 gap-3">
                            <span className="w-10" />
                            <span className="flex-1 text-center">← Games above, Matches below →</span>
                          </div>
                        </div>

                        <div className="bg-overlay rounded-xl p-4">
                          <h3 className="text-sm font-semibold text-ink-dim uppercase tracking-wider mb-3">Scoring</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-ink-muted">Avg points scored</span>
                              <span className="font-semibold tabular-nums">{stats.avgScore}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-ink-muted">Avg points conceded</span>
                              <span className="font-semibold tabular-nums">{stats.avgOppScore}</span>
                            </div>
                            <div className="flex justify-between border-t border-edge pt-2">
                              <span className="text-ink-muted">Avg point diff</span>
                              <span className={`font-semibold tabular-nums ${parseFloat(stats.pointDiff) >= 0 ? 'text-win' : 'text-loss'}`}>
                                {parseFloat(stats.pointDiff) >= 0 ? '+' : ''}{stats.pointDiff}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Streaks */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-overlay rounded-xl p-4 text-center">
                          <div className={`text-2xl font-bold ${stats.currentStreakType === 'W' ? 'text-win' : stats.currentStreakType === 'L' ? 'text-loss' : 'text-ink-faint'}`}>
                            {stats.currentStreak > 0 ? `${stats.currentStreak}${stats.currentStreakType}` : '—'}
                          </div>
                          <div className="text-xs text-ink-muted mt-1">Current Streak</div>
                        </div>
                        <div className="bg-overlay rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-win">{stats.longestWinStreak}</div>
                          <div className="text-xs text-ink-muted mt-1">Best Win Streak</div>
                        </div>
                        <div className="bg-overlay rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-loss">{stats.longestLossStreak}</div>
                          <div className="text-xs text-ink-muted mt-1">Worst Loss Streak</div>
                        </div>
                      </div>

                      {/* Win rate trend chart */}
                      {stats.winRateOverTime.length >= 3 && (
                        <div className="bg-overlay rounded-xl p-4">
                          <h3 className="text-sm font-semibold text-ink-dim uppercase tracking-wider mb-3">Win Rate Trend</h3>
                          <ResponsiveContainer width="100%" height={160}>
                            <LineChart data={stats.winRateOverTime} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                              <XAxis dataKey="game" tick={{ fontSize: 11 }} label={{ value: 'Game #', position: 'insideBottomRight', offset: -5, fontSize: 11 }} />
                              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                              <Tooltip formatter={(v) => [`${v ?? 0}%`, 'Win Rate']} labelFormatter={l => `Game ${l}`} />
                              <Line
                                type="monotone"
                                dataKey="winRate"
                                stroke="#10b981"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                              />
                              {/* 50% reference */}
                              <Line type="monotone" dataKey={() => 50} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" dot={false} legendType="none" />
                            </LineChart>
                          </ResponsiveContainer>
                          <div className="flex items-center gap-4 text-xs text-ink-faint mt-1">
                            <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-brand-hi" /> Win rate</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-gold" style={{ borderTop: '1px dashed' }} /> 50% line</span>
                          </div>
                        </div>
                      )}

                      {/* Tournament summary table */}
                      {stats.tournamentStats.length > 0 && (
                        <div className="bg-overlay rounded-xl p-4">
                          <h3 className="text-sm font-semibold text-ink-dim uppercase tracking-wider mb-3">Tournament History</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-ink-faint border-b border-edge">
                                  <th className="pb-2 font-medium">Tournament</th>
                                  <th className="pb-2 font-medium text-center">Matches</th>
                                  <th className="pb-2 font-medium text-center">Games</th>
                                  <th className="pb-2 font-medium text-center">Rank</th>
                                  <th className="pb-2 font-medium text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-edge-dim">
                                {stats.tournamentStats.map(t => (
                                  <tr key={t.id}>
                                    <td className="py-2 font-medium text-ink">{t.name}</td>
                                    <td className="py-2 text-center">
                                      <span className="text-win font-semibold">{t.matchWins}</span>
                                      <span className="text-ink-faint">–</span>
                                      <span className="text-loss font-semibold">{t.matchLosses}</span>
                                    </td>
                                    <td className="py-2 text-center">
                                      <span className="text-win font-semibold">{t.gameWins}</span>
                                      <span className="text-ink-faint">–</span>
                                      <span className="text-loss font-semibold">{t.totalGames - t.gameWins}</span>
                                    </td>
                                    <td className="py-2 text-center font-semibold">
                                      {t.rank ? `#${t.rank}` : <span className="text-ink-faint">—</span>}
                                    </td>
                                    <td className="py-2 text-center">
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.status === 'completed' ? 'bg-brand-dim text-win' : 'bg-warn-dim text-gold'}`}>
                                        {t.status === 'completed' ? 'Done' : 'Active'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {stats.totalGames === 0 && (
                        <p className="text-ink-muted text-center py-8">No games recorded yet.</p>
                      )}
                    </div>
                  );

                  // ── Matches Tab ───────────────────────────────────────────
                  if (activePlayerTab === 'matches') {
                    if (stats.playerMatches.length === 0)
                      return <p className="text-ink-muted text-center py-8">No matches recorded yet.</p>;

                    // Group by tournament
                    const byTournament = stats.playerMatches.reduce<Record<string, Match[]>>((acc, m) => {
                      if (!acc[m.tournamentId]) acc[m.tournamentId] = [];
                      acc[m.tournamentId].push(m);
                      return acc;
                    }, {});

                    return (
                      <div className="space-y-6">
                        {Object.entries(byTournament).map(([tid, tMatches]) => {
                          const t = tournaments.find(t => t.id === tid);
                          return (
                            <div key={tid}>
                              <div className="flex items-center gap-2 mb-3">
                                <h4 className="text-sm font-semibold text-ink-dim">{t?.name ?? 'Tournament'}</h4>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t?.status === 'completed' ? 'bg-brand-dim text-win' : 'bg-warn-dim text-gold'}`}>
                                  {t?.status === 'completed' ? 'Completed' : 'Active'}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {tMatches
                                  .sort((a, b) => {
                                    if (a.round !== b.round) return a.round === 'roundRobin' ? -1 : 1;
                                    return (a.bracketRound || 0) - (b.bracketRound || 0);
                                  })
                                  .map(match => {
                                    const isP1 = match.player1Id === selectedPlayer.id;
                                    const oppId = isP1 ? match.player2Id : match.player1Id;
                                    const won = match.winnerId === selectedPlayer.id;
                                    const lost = match.winnerId && match.winnerId !== selectedPlayer.id;
                                    const roundLabel = match.round === 'roundRobin'
                                      ? `Round Robin${match.bracketRound ? ` R${match.bracketRound}` : ''}`
                                      : `Bracket R${match.bracketRound ?? 1}`;

                                    return (
                                      <div key={match.id} className="border border-edge rounded-lg overflow-hidden">
                                        {/* Match header */}
                                        <div className="flex items-center justify-between bg-overlay px-4 py-2.5">
                                          <div className="flex items-center gap-2">
                                            {match.winnerId && (
                                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${won ? 'bg-brand-dim text-win' : 'bg-loss-dim text-loss'}`}>
                                                {won ? 'WIN' : 'LOSS'}
                                              </span>
                                            )}
                                            <span className="font-medium text-ink text-sm">
                                              vs {getPlayerName(oppId)}
                                            </span>
                                          </div>
                                          <span className="text-xs text-ink-faint">{roundLabel}</span>
                                        </div>
                                        {/* Inline game scores */}
                                        {match.games.length > 0 && (
                                          <div className="divide-y divide-edge-dim">
                                            {match.games.map((g, gi) => {
                                              const myG = isP1 ? g.score1 : g.score2;
                                              const oppG = isP1 ? g.score2 : g.score1;
                                              const gWon = myG > oppG;
                                              return (
                                                <div key={g.id} className="flex items-center justify-between px-4 py-1.5 text-sm">
                                                  <span className="text-ink-faint text-xs w-14">Game {gi + 1}</span>
                                                  <span className={`font-bold tabular-nums ${gWon ? 'text-win' : 'text-loss'}`}>
                                                    {myG} – {oppG}
                                                  </span>
                                                  <span className="text-ink-faint text-xs w-20 text-right">{new Date(g.date).toLocaleDateString()}</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {match.games.length === 0 && (
                                          <div className="px-4 py-1.5 text-xs text-ink-faint italic">No games recorded</div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  // ── Games Tab ─────────────────────────────────────────────
                  if (activePlayerTab === 'games') {
                    if (stats.playerGames.length === 0)
                      return <p className="text-ink-muted text-center py-8">No games recorded yet.</p>;

                    return (
                      <div>
                        <div className="text-xs text-ink-faint mb-3">{stats.playerGames.length} games, newest first</div>
                        <div className="space-y-2">
                          {[...stats.playerGames].reverse().map((game, idx) => {
                            const isP1 = game.player1Id === selectedPlayer.id;
                            const myScore = isP1 ? game.score1 : game.score2;
                            const oppScore = isP1 ? game.score2 : game.score1;
                            const oppId = isP1 ? game.player2Id : game.player1Id;
                            const won = myScore > oppScore;
                            const roundLabel = game.match.round === 'roundRobin'
                              ? 'Round Robin'
                              : `Bracket R${game.match.bracketRound ?? 1}`;
                            const t = tournaments.find(t => t.id === game.match.tournamentId);

                            return (
                              <div key={game.id} className="flex items-center justify-between bg-overlay border border-edge rounded-lg px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <span className={`text-xs font-bold w-8 ${won ? 'text-win' : 'text-loss'}`}>{won ? 'WIN' : 'LOSS'}</span>
                                  <div>
                                    <div className="text-sm font-medium text-ink">
                                      vs {getPlayerName(oppId)}
                                    </div>
                                    <div className="text-xs text-ink-faint">
                                      {t?.name ?? ''} · {roundLabel} · {new Date(game.date).toLocaleDateString()}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`font-bold tabular-nums ${won ? 'text-win' : 'text-loss'}`}>
                                    {myScore} – {oppScore}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // ── Head-to-Head Tab ──────────────────────────────────────
                  if (activePlayerTab === 'h2h') {
                    if (stats.h2hRecords.length === 0)
                      return <p className="text-ink-muted text-center py-8">No head-to-head data yet.</p>;

                    return (
                      <div className="space-y-4">
                        <div className="text-xs text-ink-faint mb-1">Opponents sorted by most games played</div>

                        {/* Chart */}
                        <div className="bg-overlay rounded-xl p-4">
                          <h3 className="text-sm font-semibold text-ink-dim uppercase tracking-wider mb-3">Wins vs Losses by Opponent</h3>
                          <ResponsiveContainer width="100%" height={Math.max(120, stats.h2hRecords.length * 44)}>
                            <BarChart
                              layout="vertical"
                              data={stats.h2hRecords}
                              margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                              barCategoryGap="25%"
                            >
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#3f3f46" />
                              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                              <YAxis type="category" dataKey="opponentName" tick={{ fontSize: 12 }} width={80} />
                              <Tooltip formatter={(v, name) => [v, name === 'wins' ? 'Wins' : 'Losses']} />
                              <Bar dataKey="wins" name="wins" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                              <Bar dataKey="losses" name="losses" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Detail rows */}
                        <div className="space-y-3">
                          {stats.h2hRecords.map(rec => (
                            <div key={rec.opponentId} className="bg-overlay rounded-xl p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-overlay border border-edge-hi rounded-full flex items-center justify-center text-ink text-sm font-bold">
                                    {rec.opponentName.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-semibold text-ink">{rec.opponentName}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-win font-bold">{rec.wins}W</span>
                                  <span className="text-ink-faint mx-1">–</span>
                                  <span className="text-loss font-bold">{rec.losses}L</span>
                                  <span className="ml-2 text-ink-muted text-sm">({rec.winPct}%)</span>
                                </div>
                              </div>
                              <div className="h-3 bg-overlay rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-win rounded-full transition-all"
                                  style={{ width: `${rec.winPct}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
