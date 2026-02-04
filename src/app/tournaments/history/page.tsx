'use client';

import { useState, useEffect } from 'react';
import { Tournament, Player, Match, Game } from '../../../types/pingpong';
import Link from 'next/link';

export default function TournamentHistoryPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [showTournamentDetail, setShowTournamentDetail] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

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

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player ? player.name : 'Unknown';
  };

  const getTournamentMatches = (tournamentId: string) => {
    return matches.filter(m => m.tournamentId === tournamentId);
  };

  const completedTournaments = tournaments.filter(tournament => tournament.status === 'completed');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">🏆 Tournament History</h1>
            <p className="text-gray-600 text-lg">Browse completed ping pong tournaments</p>
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

        {/* Tournaments List */}
        <div className="space-y-8">
          {completedTournaments.map((tournament) => {
            const tournamentMatches = getTournamentMatches(tournament.id);
            const bracketMatches = tournamentMatches.filter(m => m.round === 'bracket');
            
            return (
              <div 
                key={tournament.id} 
                className="bg-white rounded-xl shadow-lg overflow-hidden border-2 border-gray-200 cursor-pointer hover:shadow-xl transition-shadow"
                onClick={() => {
                  setSelectedTournament(tournament);
                  setShowTournamentDetail(true);
                }}
              >
                {/* Tournament Header */}
                <div className="bg-gray-800 text-white p-8">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h2 className="text-3xl font-bold mb-3">{tournament.name}</h2>
                      <p className="text-gray-300 text-lg">
                        {tournament.players.length} players • Completed {new Date(tournament.startDate).toLocaleDateString()}
                      </p>
                      <p className="text-gray-400 text-sm mt-2">Click to view all games played</p>
                    </div>
                    <span className="px-4 py-2 rounded-full text-sm font-bold border-2 bg-green-100 text-green-800">
                      Completed
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

                  {/* Tournament Completed */}
                  <div className="text-center py-12 relative overflow-hidden">
                    {/* Fireworks Background */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-4 left-1/4 text-4xl animate-ping text-red-500">✨</div>
                      <div className="absolute top-8 right-1/3 text-3xl animate-ping text-blue-500" style={{animationDelay: '0.5s'}}>🎆</div>
                      <div className="absolute top-12 left-2/3 text-4xl animate-ping text-yellow-500" style={{animationDelay: '1s'}}>🎇</div>
                      <div className="absolute top-16 right-1/4 text-3xl animate-ping text-purple-500" style={{animationDelay: '1.5s'}}>✨</div>
                      <div className="absolute top-20 left-1/2 text-4xl animate-ping text-green-500" style={{animationDelay: '2s'}}>🎆</div>
                    </div>

                    <div className="text-7xl mb-6 relative z-10">🏆</div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-4 relative z-10">Tournament Completed!</h3>
                    <p className="text-gray-600 mb-8 text-lg relative z-10">Congratulations to all participants</p>
                    {(() => {
                      const finalMatch = bracketMatches.find(m => m.bracketRound === Math.max(...bracketMatches.map(m => m.bracketRound || 0)));
                      if (finalMatch?.winnerId) {
                        return (
                          <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 border-2 border-yellow-300 rounded-lg p-6 inline-block shadow-lg relative z-10">
                            <div className="text-2xl font-bold text-white">
                              🥇 Champion: {getPlayerName(finalMatch.winnerId)}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Tournament Stats */}
                  <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gray-50 rounded-lg p-6 text-center border-2 border-gray-200">
                      <div className="text-3xl font-bold text-gray-900">{tournamentMatches.filter(m => m.winnerId).length}</div>
                      <div className="text-gray-600 font-medium">Matches Completed</div>
                      <div className="text-sm text-gray-500 mt-1">Total</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-6 text-center border-2 border-gray-200">
                      <div className="text-3xl font-bold text-gray-900">{games.filter(g => g.matchId && tournamentMatches.some(m => m.id === g.matchId)).length}</div>
                      <div className="text-gray-600 font-medium">Games Played</div>
                      <div className="text-sm text-gray-500 mt-1">Total</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-6 text-center border-2 border-gray-200">
                      <div className="text-3xl font-bold text-gray-900">🏆</div>
                      <div className="text-gray-600 font-medium">Status</div>
                      <div className="text-sm text-gray-500 mt-1">Completed</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {completedTournaments.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl shadow-lg border-2 border-gray-200">
            <div className="text-8xl mb-6">🏆</div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">No completed tournaments yet</h3>
            <p className="text-gray-600 mb-8 text-lg">Complete some tournaments to see them here!</p>
            <Link href="/tournaments/active" className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-lg shadow-lg font-bold text-xl transition-colors border-2 border-blue-700 inline-block">
              View Active Tournaments
            </Link>
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
                      {selectedTournament.players.length} players • Completed {new Date(selectedTournament.startDate).toLocaleDateString()}
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
                {/* Tournament Matches */}
                <div className="mb-8">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">All Matches</h4>
                  {(() => {
                    const tournamentMatches = getTournamentMatches(selectedTournament.id);
                    
                    if (tournamentMatches.length === 0) {
                      return <p className="text-gray-600 text-center py-4">No matches yet</p>;
                    }

                    return (
                      <div className="space-y-3">
                        {tournamentMatches
                          .sort((a, b) => {
                            // Sort by round type, then round number, then date
                            if (a.round !== b.round) {
                              return a.round === 'roundRobin' ? -1 : 1;
                            }
                            return (a.bracketRound || 0) - (b.bracketRound || 0);
                          })
                          .map((match) => (
                            <div key={match.id} className="bg-white p-4 rounded-lg border border-gray-200">
                              <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center space-x-4">
                                  <span className="font-medium text-gray-900">
                                    {getPlayerName(match.player1Id)}
                                  </span>
                                  <span className="text-gray-500">vs</span>
                                  <span className="font-medium text-gray-900">
                                    {match.player2Id === 'BYE' ? 'BYE' : getPlayerName(match.player2Id)}
                                  </span>
                                </div>
                                <div className="text-sm text-gray-600">
                                  {match.round === 'roundRobin' ? `Round Robin Round ${match.bracketRound}` : `Bracket Round ${match.bracketRound}`}
                                </div>
                              </div>
                              {match.winnerId && (
                                <div className="text-green-600 font-medium">
                                  Winner: {getPlayerName(match.winnerId)}
                                </div>
                              )}
                              <div className="text-sm text-gray-500 mt-1">
                                {match.games.length} games played
                              </div>
                            </div>
                          ))}
                      </div>
                    );
                  })()}
                </div>

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
                      🏆
                    </div>
                    <div className="text-gray-600 font-medium">
                      Status
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