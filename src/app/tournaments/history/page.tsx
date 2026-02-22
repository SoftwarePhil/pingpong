'use client';

import { useState, useEffect } from 'react';
import { Tournament, Player, Match, Game } from '../../../types/pingpong';
import Link from 'next/link';
import BracketView from '../active/BracketView';

type DetailTab = 'overview' | 'matches';

export default function TournamentHistoryPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  useEffect(() => {
    fetchTournaments();
    fetchPlayers();
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

  const fetchGames = async () => {
    const res = await fetch('/api/games');
    const data = await res.json();
    setGames(data);
  };

  const getPlayerName = (id: string) => {
    if (id === 'BYE') return 'BYE';
    const player = players.find(p => p.id === id);
    return player ? player.name : 'Unknown';
  };

  const getPlayerStandings = (tournament: Tournament) => {
    const playerStats: { [playerId: string]: { wins: number; losses: number; totalGames: number } } = {};
    tournament.players.forEach(playerId => {
      playerStats[playerId] = { wins: 0, losses: 0, totalGames: 0 };
    });

    (tournament.matches || []).forEach(match => {
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

    return tournament.players
      .map(playerId => ({ playerId, ...playerStats[playerId] }))
      .sort((a, b) => {
        if (a.wins !== b.wins) return b.wins - a.wins;
        return a.totalGames - b.totalGames;
      });
  };

  const getChampion = (tournament: Tournament): string | null => {
    const bracketMatches = (tournament.matches || []).filter(m => m.round === 'bracket');
    if (bracketMatches.length === 0) return null;
    const maxRound = Math.max(...bracketMatches.map(m => m.bracketRound || 0));
    const finalMatch = bracketMatches.find(m => m.bracketRound === maxRound);
    return finalMatch?.winnerId ?? null;
  };

  const getTournamentGames = (tournament: Tournament) => {
    const matchIds = new Set((tournament.matches || []).map(m => m.id));
    return games.filter(g => g.matchId && matchIds.has(g.matchId));
  };

  const completedTournaments = [...tournaments]
    .filter(t => t.status === 'completed')
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const openDetail = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setActiveTab('overview');
  };

  const closeDetail = () => setSelectedTournament(null);

  // ── Full-screen detail view ──────────────────────────────────────────────
  if (selectedTournament) {
    const champ = getChampion(selectedTournament);
    const bracketMatches = (selectedTournament.matches || []).filter(m => m.round === 'bracket');
    const allMatches = selectedTournament.matches || [];
    const rrMatches = allMatches.filter(m => m.round === 'roundRobin').sort((a, b) => (a.bracketRound || 0) - (b.bracketRound || 0));
    const brMatches = allMatches.filter(m => m.round === 'bracket').sort((a, b) => (a.bracketRound || 0) - (b.bracketRound || 0));

    const renderMatch = (match: Match) => {
      const p1Won = match.winnerId === match.player1Id;
      const p2Won = match.winnerId === match.player2Id;
      return (
        <div key={match.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-4 py-2 text-sm">
            <span className={`font-semibold ${p1Won ? 'text-green-700' : 'text-gray-700'}`}>
              {getPlayerName(match.player1Id)}{p1Won && ' 🏆'}
            </span>
            <span className="text-gray-400 font-medium">vs</span>
            <span className={`font-semibold ${p2Won ? 'text-green-700' : 'text-gray-700'}`}>
              {match.player2Id === 'BYE' ? 'BYE' : getPlayerName(match.player2Id)}{p2Won && ' 🏆'}
            </span>
          </div>
          {match.games.length > 0 && (
            <div className="divide-y divide-gray-100">
              {match.games.map((game, gi) => {
                const g1Won = game.score1 > game.score2;
                return (
                  <div key={game.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-gray-500 w-14">Game {gi + 1}</span>
                    <div className="flex items-center gap-3">
                      <span className={`font-medium w-16 text-right ${g1Won ? 'text-green-600' : 'text-gray-600'}`}>{getPlayerName(game.player1Id)}</span>
                      <span className="font-bold text-gray-900 tabular-nums">{game.score1} – {game.score2}</span>
                      <span className={`font-medium w-16 ${!g1Won ? 'text-green-600' : 'text-gray-600'}`}>{getPlayerName(game.player2Id)}</span>
                    </div>
                    <span className="text-gray-400 text-xs w-20 text-right">{new Date(game.date).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          )}
          {match.games.length === 0 && match.player2Id === 'BYE' && <div className="px-4 py-2 text-sm text-gray-400 italic">Bye round</div>}
          {match.games.length === 0 && match.player2Id !== 'BYE' && <div className="px-4 py-2 text-sm text-gray-400 italic">No games recorded</div>}
        </div>
      );
    };

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-5xl">

          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <button
                onClick={closeDetail}
                className="text-sm text-gray-500 hover:text-gray-700 mb-3 flex items-center gap-1 transition-colors"
              >
                ← Back to History
              </button>
              <h1 className="text-3xl font-bold text-gray-900">{selectedTournament.name}</h1>
              <p className="text-gray-500 mt-1">
                {selectedTournament.players.length} players •{' '}
                {new Date(selectedTournament.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              {champ && (
                <div className="mt-3 inline-flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-yellow-800">
                  🥇 Champion: {getPlayerName(champ)}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-1 w-fit">
            {(['overview', 'matches'] as DetailTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab === 'overview' ? '🏆 Bracket & Standings' : 'Matches'}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {bracketMatches.length > 0 ? (
                <BracketView
                  bracketMatches={bracketMatches}
                  getPlayerName={getPlayerName}
                  onAddGame={async () => {}}
                  onSaveGameEdit={async () => {}}
                  readOnly
                />
              ) : (
                <p className="text-gray-400 text-sm text-center py-4">No bracket matches recorded.</p>
              )}

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Standings</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200 text-gray-600">
                      <th className="text-left py-2 pr-4 font-semibold w-10">Rank</th>
                      <th className="text-left py-2 pr-4 font-semibold">Player</th>
                      <th className="text-center py-2 px-3 font-semibold">Wins</th>
                      <th className="text-center py-2 px-3 font-semibold">Losses</th>
                      <th className="text-center py-2 px-3 font-semibold">Win %</th>
                      <th className="text-center py-2 px-3 font-semibold">Matches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPlayerStandings(selectedTournament).map((s, i) => (
                      <tr key={s.playerId} className={`border-b border-gray-100 ${i === 0 ? 'bg-yellow-50 font-semibold' : i === 1 ? 'bg-gray-50' : ''}`}>
                        <td className="py-3 pr-4 text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</td>
                        <td className="py-3 pr-4 font-medium text-gray-900">{getPlayerName(s.playerId)}</td>
                        <td className="text-center py-3 px-3 text-green-600 font-medium">{s.wins}</td>
                        <td className="text-center py-3 px-3 text-red-500 font-medium">{s.losses}</td>
                        <td className="text-center py-3 px-3 text-gray-700">{s.totalGames > 0 ? Math.round((s.wins / s.totalGames) * 100) : 0}%</td>
                        <td className="text-center py-3 px-3 text-gray-500">{s.totalGames}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="grid grid-cols-3 gap-4 mt-6">
                  {[
                    { label: 'Matches', value: allMatches.filter(m => m.winnerId).length },
                    { label: 'Games', value: getTournamentGames(selectedTournament).length },
                    { label: 'Players', value: selectedTournament.players.length },
                  ].map(stat => (
                    <div key={stat.label} className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
                      <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                      <div className="text-sm text-gray-500">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Matches Tab */}
          {activeTab === 'matches' && (
            <div className="space-y-6">
              {rrMatches.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Round Robin</h4>
                  <div className="space-y-2">{rrMatches.map(renderMatch)}</div>
                </div>
              )}
              {brMatches.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Bracket</h4>
                  <div className="space-y-4">
                    {Array.from(new Set(brMatches.map(m => m.bracketRound || 0))).sort((a, b) => a - b).map(round => (
                      <div key={round}>
                        <div className="text-xs text-gray-400 font-medium mb-2 ml-1">Round {round}</div>
                        <div className="space-y-2">{brMatches.filter(m => (m.bracketRound || 0) === round).map(renderMatch)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {allMatches.length === 0 && <p className="text-gray-500 text-center py-8">No matches recorded.</p>}
            </div>
          )}

        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">🏆 Tournament History</h1>
            <p className="text-gray-500 mt-1">{completedTournaments.length} completed tournament{completedTournaments.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-3">
            <Link href="/tournaments" className="bg-white hover:bg-gray-100 text-gray-700 px-4 py-2 rounded-lg shadow-sm border border-gray-300 transition-colors text-sm font-medium">
              ← Back
            </Link>
            <Link href="/tournaments/new" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm text-sm font-medium transition-colors">
              + New Tournament
            </Link>
          </div>
        </div>

        {/* Tournament Cards */}
        {completedTournaments.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl shadow border border-gray-200">
            <div className="text-6xl mb-4">🏆</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No completed tournaments yet</h3>
            <p className="text-gray-500 mb-6">Complete some tournaments to see them here.</p>
            <Link href="/tournaments/active" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">
              View Active Tournaments
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {completedTournaments.map((tournament, idx) => {
              const standings = getPlayerStandings(tournament);
              const champion = getChampion(tournament);
              const tournamentGames = getTournamentGames(tournament);
              const completedMatches = (tournament.matches || []).filter(m => m.winnerId);
              const isLatest = idx === 0;

              return (
                <div
                  key={tournament.id}
                  className={`bg-white rounded-xl shadow-sm border-2 transition-shadow hover:shadow-md ${isLatest ? 'border-yellow-300' : 'border-gray-200'}`}
                >
                  {/* Card Header */}
                  <div className={`px-6 py-4 rounded-t-xl flex justify-between items-center ${isLatest ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      {isLatest && <span className="text-xs font-bold bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full uppercase tracking-wide">Latest</span>}
                      <h2 className="text-lg font-bold text-gray-900">{tournament.name}</h2>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{tournament.players.length} players</span>
                      <span>{new Date(tournament.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="px-6 py-5 flex flex-col md:flex-row gap-6">

                    {/* Champion */}
                    <div className="flex-shrink-0 flex flex-col items-center justify-center bg-gradient-to-br from-yellow-50 to-amber-100 border border-yellow-200 rounded-xl px-8 py-5 min-w-[160px]">
                      <div className="text-4xl mb-1">🥇</div>
                      <div className="text-xs font-semibold text-yellow-700 uppercase tracking-wider mb-1">Champion</div>
                      <div className="text-base font-bold text-gray-900 text-center">
                        {champion ? getPlayerName(champion) : '—'}
                      </div>
                    </div>

                    {/* Standings */}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Final Standings</div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 border-b border-gray-100">
                            <th className="text-left py-1 pr-3 font-medium w-8">#</th>
                            <th className="text-left py-1 pr-3 font-medium">Player</th>
                            <th className="text-center py-1 px-2 font-medium w-12">W</th>
                            <th className="text-center py-1 px-2 font-medium w-12">L</th>
                            <th className="text-center py-1 px-2 font-medium w-16">Win%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standings.map((s, i) => (
                            <tr key={s.playerId} className={`border-b border-gray-50 ${i === 0 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                              <td className="py-1 pr-3 text-gray-400">
                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                              </td>
                              <td className="py-1 pr-3">{getPlayerName(s.playerId)}</td>
                              <td className="text-center py-1 px-2 text-green-600">{s.wins}</td>
                              <td className="text-center py-1 px-2 text-red-500">{s.losses}</td>
                              <td className="text-center py-1 px-2 text-gray-500">
                                {s.totalGames > 0 ? Math.round((s.wins / s.totalGames) * 100) : 0}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Quick Stats + Details Button */}
                    <div className="flex-shrink-0 flex flex-col justify-between gap-4 min-w-[130px]">
                      <div className="space-y-2">
                        <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                          <div className="text-2xl font-bold text-gray-900">{completedMatches.length}</div>
                          <div className="text-xs text-gray-500">Matches</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                          <div className="text-2xl font-bold text-gray-900">{tournamentGames.length}</div>
                          <div className="text-xs text-gray-500">Games</div>
                        </div>
                      </div>
                      <button
                        onClick={() => openDetail(tournament)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

